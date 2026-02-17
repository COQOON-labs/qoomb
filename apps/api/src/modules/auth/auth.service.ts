import * as crypto from 'crypto';

import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Hive, Person, User, UserHiveMembership } from '@prisma/client';
import { type CreateHiveInput } from '@qoomb/types';
import * as bcrypt from 'bcrypt';

import { AccountLockoutService } from '../../common/services/account-lockout.service';
import { TokenBlacklistService } from '../../common/services/token-blacklist.service';
import { PASSWORD_CONFIG, JWT_CONFIG } from '../../config/security.config';
import { PrismaService, TransactionClient } from '../../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { EncryptionService } from '../encryption';

import { RefreshTokenService } from './refresh-token.service';
import { SystemConfigService } from './system-config.service';

interface JwtPayload {
  jti?: string;
  sub: string;
  exp?: number;
  hiveId?: string;
  personId?: string;
  type?: string;
}

interface MembershipWithHiveAndPerson extends UserHiveMembership {
  hive: Hive;
  person: Person;
}

interface UserWithMemberships extends User {
  memberships: MembershipWithHiveAndPerson[];
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly accountLockout: AccountLockoutService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly emailService: EmailService,
    private readonly systemConfig: SystemConfigService,
    private readonly enc: EncryptionService
  ) {}

  /**
   * Register a new hive with an admin user
   *
   * SECURITY NOTE:
   * - Uses generic error messages to prevent email enumeration
   * - Configurable bcrypt salt rounds from security config
   * - Returns access + refresh tokens
   */
  async register(input: CreateHiveInput, ipAddress?: string, userAgent?: string) {
    // Check if open registration is allowed
    if (!this.systemConfig.getConfig().allowOpenRegistration) {
      throw new ForbiddenException('Open registration is disabled. Please use an invitation link.');
    }

    // Check if email already exists (lookup via blind index)
    const existingUser: User | null = await this.prisma.user.findUnique({
      where: { emailHash: this.enc.hashEmail(input.adminEmail) },
    });

    if (existingUser) {
      // SECURITY: Generic error message to prevent email enumeration
      throw new BadRequestException(
        'Registration failed. Please check your information and try again.'
      );
    }

    // Hash password with configured salt rounds
    const passwordHash = await bcrypt.hash(input.adminPassword, PASSWORD_CONFIG.SALT_ROUNDS);

    // Create hive, person, and user in a transaction
    const result = await this.prisma.$transaction(async (tx: TransactionClient) => {
      // Check if this is the first user ever → auto-promote to SystemAdmin
      const userCount = await tx.user.count();
      const isSystemAdmin = userCount === 0;

      // 1. Create the hive
      // Pre-generate hiveId so we can derive the per-hive encryption key before the INSERT.
      const newHiveId = crypto.randomUUID();
      const hive: Hive = await tx.hive.create({
        data: {
          id: newHiveId,
          name: this.encryptHiveName(input.name, newHiveId),
          type: input.type,
        },
      });

      // 2. Create admin person — role depends on hive type
      const adminRole = input.type === 'family' ? 'parent' : 'org_admin';
      const person = await tx.person.create({
        data: {
          hiveId: hive.id,
          role: adminRole,
        },
      });

      // 3. Create user account
      // Pre-generate userId so we can derive the per-user encryption key before the INSERT.
      const newUserId = crypto.randomUUID();
      const user: User = await tx.user.create({
        data: {
          id: newUserId,
          email: this.enc.encryptForUser(input.adminEmail.toLowerCase().trim(), newUserId),
          emailHash: this.enc.hashEmail(input.adminEmail),
          passwordHash,
          fullName: input.adminName ? this.enc.encryptForUser(input.adminName, newUserId) : null,
          isSystemAdmin,
        },
      });

      // 4. Link person to user and create membership
      await tx.person.update({
        where: { id: person.id },
        data: { userId: user.id },
      });

      await tx.userHiveMembership.create({
        data: {
          userId: user.id,
          hiveId: hive.id,
          personId: person.id,
          isPrimary: true,
        },
      });

      return { hive, user, personId: person.id };
    });

    // Generate access token (short-lived)
    const userId: string = result.user.id;
    const hiveId: string = result.hive.id;
    const personId: string = result.personId;

    const { token: accessToken } = this.generateAccessToken(userId, hiveId, personId);

    // Generate refresh token (long-lived)
    const refreshTokenData = await this.refreshTokenService.createRefreshToken(
      userId,
      ipAddress,
      userAgent
    );

    const userEmail: string = this.enc.decryptForUser(result.user.email, result.user.id);
    const hiveIdReturn: string = result.hive.id;
    const hiveName: string = this.decryptHiveName(result.hive.name, result.hive.id);

    // Send email verification (non-blocking — don't fail registration if email fails)
    void this.sendEmailVerification(userId).catch(() => undefined);

    return {
      accessToken,
      refreshToken: refreshTokenData.token,
      expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRES_SECONDS,
      user: {
        id: userId,
        email: userEmail,
        hiveId: hiveIdReturn,
        personId: personId,
        isSystemAdmin: result.user.isSystemAdmin,
      },
      hive: {
        id: hiveIdReturn,
        name: hiveName,
      },
    };
  }

  /**
   * Login with email and password
   *
   * SECURITY FEATURES:
   * - Account lockout after failed attempts
   * - Exponential backoff for repeated lockouts
   * - Generic error messages to prevent enumeration
   * - JWT refresh tokens with rotation
   * - Short-lived access tokens (15 min)
   *
   * @returns Access token (15 min) + Refresh token (7 days)
   */
  async login(email: string, password: string, ipAddress?: string, userAgent?: string) {
    // Check if account is locked
    const lockStatus = await this.accountLockout.isLocked(email);
    if (lockStatus.locked) {
      const minutes = Math.ceil((lockStatus.remainingSeconds ?? 0) / 60);
      throw new UnauthorizedException(
        `Account temporarily locked. Please try again in ${minutes} minute(s).`
      );
    }

    // Find user with memberships (lookup via blind index)
    const user: UserWithMemberships | null = await this.prisma.user.findUnique({
      where: { emailHash: this.enc.hashEmail(email) },
      include: {
        memberships: {
          include: {
            hive: true,
            person: true,
          },
        },
      },
    });

    if (!user) {
      // Record failed attempt even if user doesn't exist (prevents enumeration)
      await this.accountLockout.recordFailedAttempt(email);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      // Record failed attempt
      const result = await this.accountLockout.recordFailedAttempt(email);

      if (result.isLocked) {
        const minutes = Math.ceil((result.remainingLockoutSeconds ?? 0) / 60);
        throw new UnauthorizedException(
          `Too many failed attempts. Account locked for ${minutes} minute(s).`
        );
      }

      throw new UnauthorizedException('Invalid credentials');
    }

    // Successful login - reset failed attempts
    await this.accountLockout.resetAttempts(email);

    // Check membership after password verification to avoid user enumeration
    if (user.memberships.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Get primary membership (or first membership if no primary set)
    const primaryMembership = user.memberships.find((m) => m.isPrimary) || user.memberships[0];

    // Generate access token (short-lived)
    const userId: string = user.id;
    const hiveId: string = primaryMembership.hiveId;
    const personId: string = primaryMembership.personId;

    const { token: accessToken } = this.generateAccessToken(userId, hiveId, personId);

    // Generate refresh token (long-lived)
    const refreshTokenData = await this.refreshTokenService.createRefreshToken(
      userId,
      ipAddress,
      userAgent
    );

    const userEmail: string = this.enc.decryptForUser(user.email, user.id);
    const hiveName: string = this.decryptHiveName(
      primaryMembership.hive.name,
      primaryMembership.hive.id
    );

    return {
      accessToken,
      refreshToken: refreshTokenData.token,
      expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRES_SECONDS,
      user: {
        id: userId,
        email: userEmail,
        hiveId: hiveId,
        personId: personId,
      },
      hive: {
        id: hiveId,
        name: hiveName,
      },
      availableHives: user.memberships.map((m) => ({
        id: m.hive.id,
        name: this.decryptHiveName(m.hive.name, m.hive.id),
        role: m.person.role,
        isPrimary: m.isPrimary,
      })),
    };
  }

  /**
   * Validate JWT token and return user context
   *
   * SECURITY NOTE:
   * - Generic error messages for all auth failures
   * - No differentiation between invalid token and non-existent user
   * - Checks token blacklist
   * - Checks user-level blacklist (logout all)
   */
  async validateToken(token: string) {
    try {
      const payload = this.jwtService.verify<JwtPayload>(token);

      // Check if token is blacklisted
      if (payload.jti) {
        const isBlacklisted = await this.tokenBlacklistService.isBlacklisted(payload.jti);
        if (isBlacklisted) {
          throw new UnauthorizedException('Token has been revoked');
        }
      }

      // Check user-level blacklist (for logout-all)
      const userBlacklisted = await this.tokenBlacklistService.isUserBlacklisted(payload.sub);
      if (userBlacklisted) {
        throw new UnauthorizedException('All sessions have been terminated');
      }

      const user: User | null = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });

      if (!user) {
        // SECURITY: Generic error message, same as invalid token
        throw new UnauthorizedException('Authentication failed');
      }

      // Validate that the hiveId in the token is valid for this user
      const hiveId = payload.hiveId;
      if (!hiveId) {
        throw new UnauthorizedException('Invalid token: missing hive context');
      }

      // Verify membership exists
      const membership: MembershipWithHiveAndPerson | null =
        await this.prisma.userHiveMembership.findUnique({
          where: { userId_hiveId: { userId: user.id, hiveId: hiveId } },
          include: { hive: true, person: true },
        });

      if (!membership) {
        throw new UnauthorizedException('Invalid hive access');
      }

      const userId: string = user.id;
      const userEmail: string = this.enc.decryptForUser(user.email, user.id);
      const personId: string = membership.personId;
      const hiveName: string = this.decryptHiveName(membership.hive.name, hiveId);

      return {
        id: userId,
        email: userEmail,
        hiveId: hiveId,
        personId: personId,
        hiveName: hiveName,
      };
    } catch (_error) {
      // SECURITY: Generic error for all token validation failures
      throw new UnauthorizedException('Authentication failed');
    }
  }

  /**
   * Generate Access Token (short-lived) with JWT ID
   *
   * @returns Object with token (JWT) and jti (JWT ID for blacklisting)
   */
  private generateAccessToken(
    userId: string,
    hiveId: string,
    personId: string | null
  ): { token: string; jti: string } {
    // Generate unique JWT ID for blacklisting
    const jti = crypto.randomUUID();

    const payload = {
      sub: userId,
      hiveId,
      personId,
      jti, // JWT ID for token blacklisting
      type: 'access', // Token type
    };

    const token = this.jwtService.sign(payload, {
      expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRES_IN,
    });

    return { token, jti };
  }

  /**
   * Refresh access token using refresh token
   *
   * Implements token rotation:
   * - Old refresh token is revoked
   * - New refresh token is issued
   * - New access token is issued
   */
  async refresh(refreshToken: string, ipAddress?: string, userAgent?: string) {
    // Rotate refresh token
    const rotated = await this.refreshTokenService.rotateRefreshToken(
      refreshToken,
      ipAddress,
      userAgent
    );

    // Get user with primary membership
    const user: UserWithMemberships | null = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      include: {
        memberships: {
          include: { hive: true, person: true },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.memberships.length === 0) {
      throw new UnauthorizedException('No hive access');
    }

    // Use primary membership for refresh
    const primaryMembership = user.memberships.find((m) => m.isPrimary) || user.memberships[0];

    // Generate new access token
    const userId: string = user.id;
    const hiveId: string = primaryMembership.hiveId;
    const personId: string = primaryMembership.personId;

    const { token: accessToken } = this.generateAccessToken(userId, hiveId, personId);

    return {
      accessToken,
      refreshToken: rotated.newToken,
      expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRES_SECONDS,
    };
  }

  /**
   * Logout - revoke refresh token and blacklist access token
   */
  async logout(accessToken: string, refreshToken: string): Promise<void> {
    // Decode access token to get JWT ID and expiration
    const decoded = this.jwtService.decode<JwtPayload>(accessToken);
    if (decoded && typeof decoded === 'object' && decoded.jti && decoded.exp) {
      // Calculate remaining TTL
      const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
      if (expiresIn > 0) {
        // Blacklist access token
        await this.tokenBlacklistService.blacklistToken(decoded.jti, expiresIn, 'logout');
      }
    }

    // Revoke refresh token
    await this.refreshTokenService.revokeToken(refreshToken);
  }

  /**
   * Logout from all devices
   *
   * Revokes all refresh tokens and blacklists all access tokens for a user
   */
  async logoutAll(userId: string): Promise<void> {
    // Revoke all refresh tokens
    await this.refreshTokenService.revokeAllTokensForUser(userId);

    // Blacklist all user tokens (uses user-level blacklist)
    await this.tokenBlacklistService.blacklistAllUserTokens(
      userId,
      JWT_CONFIG.ACCESS_TOKEN_EXPIRES_SECONDS
    );
  }

  /**
   * Get active sessions for a user
   */
  getActiveSessions(userId: string) {
    return this.refreshTokenService.getActiveTokensForUser(userId);
  }

  /**
   * Switch to a different hive
   * Generates a new access token for the specified hive
   */
  async switchHive(
    userId: string,
    targetHiveId: string
  ): Promise<{
    accessToken: string;
    expiresIn: number;
    hive: { id: string; name: string; role: string };
  }> {
    // Verify membership exists
    const membership: MembershipWithHiveAndPerson | null =
      await this.prisma.userHiveMembership.findUnique({
        where: { userId_hiveId: { userId: userId, hiveId: targetHiveId } },
        include: { hive: true, person: true },
      });

    if (!membership) {
      throw new UnauthorizedException('No access to this hive');
    }

    // Generate new access token for the target hive
    const { token: accessToken } = this.generateAccessToken(
      userId,
      membership.hiveId,
      membership.personId
    );

    return {
      accessToken,
      expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRES_SECONDS,
      hive: {
        id: membership.hiveId,
        name: this.decryptHiveName(membership.hive.name, membership.hive.id),
        role: membership.person.role,
      },
    };
  }

  // ── PassKey Login ─────────────────────────────────────────────────────────

  /**
   * Generate tokens for a user verified by PassKey authentication.
   * Password verification is skipped — the PassKeyService handles it.
   */
  async loginWithPassKey(user: User, ipAddress?: string, userAgent?: string) {
    const userWithMemberships: UserWithMemberships | null = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
        memberships: {
          include: { hive: true, person: true },
        },
      },
    });

    if (!userWithMemberships || userWithMemberships.memberships.length === 0) {
      throw new UnauthorizedException('No hive access');
    }

    const primaryMembership =
      userWithMemberships.memberships.find((m) => m.isPrimary) ||
      userWithMemberships.memberships[0];

    const { token: accessToken } = this.generateAccessToken(
      user.id,
      primaryMembership.hiveId,
      primaryMembership.personId
    );

    const refreshTokenData = await this.refreshTokenService.createRefreshToken(
      user.id,
      ipAddress,
      userAgent
    );

    return {
      accessToken,
      refreshToken: refreshTokenData.token,
      expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRES_SECONDS,
      user: {
        id: user.id,
        email: this.enc.decryptForUser(user.email, user.id),
        hiveId: primaryMembership.hiveId,
        personId: primaryMembership.personId,
      },
      hive: {
        id: primaryMembership.hive.id,
        name: this.decryptHiveName(primaryMembership.hive.name, primaryMembership.hive.id),
      },
    };
  }

  // ── Email Verification ────────────────────────────────────────────────────

  /**
   * Create a verification token and send an email.
   * Safe to call fire-and-forget — email failures are logged, not thrown.
   */
  async sendEmailVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.emailVerified) return;

    // Invalidate any existing unused tokens for this user
    await this.prisma.emailVerificationToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });

    const { plainToken, tokenHash } = this.generateSecureToken();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.prisma.emailVerificationToken.create({
      data: { token: tokenHash, userId, expiresAt },
    });

    await this.emailService.sendEmailVerification(
      this.enc.decryptForUser(user.email, user.id),
      plainToken
    );
  }

  async verifyEmail(plainToken: string): Promise<void> {
    const tokenHash = this.hashToken(plainToken);

    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { token: tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired verification link.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerified: true },
      });
    });
  }

  // ── Password Reset ────────────────────────────────────────────────────────

  async requestPasswordReset(email: string): Promise<void> {
    if (!this.systemConfig.getConfig().allowForgotPassword) {
      throw new ForbiddenException('Password reset is disabled.');
    }

    const user = await this.prisma.user.findUnique({
      where: { emailHash: this.enc.hashEmail(email) },
    });

    // SECURITY: Always return success regardless of whether email exists
    if (!user) return;

    // Invalidate any existing unused tokens
    await this.prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const { plainToken, tokenHash } = this.generateSecureToken();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.passwordResetToken.create({
      data: { token: tokenHash, userId: user.id, expiresAt },
    });

    await this.emailService.sendPasswordReset(
      this.enc.decryptForUser(user.email, user.id),
      plainToken
    );
  }

  async resetPassword(plainToken: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(plainToken);

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { token: tokenHash },
    });

    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired reset link.');
    }

    const passwordHash = await bcrypt.hash(newPassword, PASSWORD_CONFIG.SALT_ROUNDS);

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });
    });

    // Revoke all sessions on password change (security best practice)
    await this.logoutAll(record.userId);
  }

  // ── Invitations ───────────────────────────────────────────────────────────

  /**
   * Send an invitation email. Requires caller to be a SystemAdmin.
   * SystemAdmin status is verified from DB — not just from JWT.
   */
  async sendInvitation(inviterUserId: string, email: string, hiveId?: string): Promise<void> {
    // DB-based SystemAdmin check — cannot be spoofed via JWT
    const inviter = await this.prisma.user.findUnique({ where: { id: inviterUserId } });
    if (!inviter?.isSystemAdmin) {
      throw new ForbiddenException('Only system administrators can send invitations.');
    }

    const inviterName = inviter.fullName
      ? this.enc.decryptForUser(inviter.fullName, inviter.id)
      : this.enc.decryptForUser(inviter.email, inviter.id);
    await this.createAndSendInvitation(inviterUserId, inviterName, email, hiveId ?? null);
  }

  /**
   * Send a hive-level invitation. Authorization (MEMBERS_INVITE) is enforced by the caller.
   * Unlike sendInvitation(), no SystemAdmin check — the caller (persons router) has already
   * verified MEMBERS_INVITE permission via requirePermission().
   *
   * @param inviterUserId - userId of the person sending the invite
   * @param inviterName   - display name for the email template
   * @param email         - recipient email address
   * @param hiveId        - hive to join (required for hive-level invites)
   */
  async inviteMemberToHive(
    inviterUserId: string,
    inviterName: string,
    email: string,
    hiveId: string
  ): Promise<void> {
    // Check if the email is already a member of this hive (lookup via blind index)
    const existingUser = await this.prisma.user.findUnique({
      where: { emailHash: this.enc.hashEmail(email) },
      select: { id: true },
    });
    if (existingUser) {
      const existingMembership = await this.prisma.userHiveMembership.findUnique({
        where: { userId_hiveId: { userId: existingUser.id, hiveId } },
      });
      if (existingMembership) {
        throw new BadRequestException('This person is already a member of this hive.');
      }
    }

    await this.createAndSendInvitation(inviterUserId, inviterName, email, hiveId);
  }

  /**
   * Internal helper: create an Invitation record and send the email.
   * Shared by sendInvitation() (SystemAdmin) and inviteMemberToHive() (hive-level).
   */
  private async createAndSendInvitation(
    inviterUserId: string,
    inviterName: string,
    email: string,
    hiveId: string | null
  ): Promise<void> {
    // Invalidate any existing unused invite for this email
    await this.prisma.invitation.updateMany({
      where: { email, usedAt: null },
      data: { usedAt: new Date() },
    });

    const { plainToken, tokenHash } = this.generateSecureToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.invitation.create({
      data: {
        email,
        token: tokenHash,
        invitedByUserId: inviterUserId,
        hiveId,
        expiresAt,
      },
    });

    await this.emailService.sendInvitation(email, inviterName, plainToken);
  }

  /**
   * Register a new user via an invitation token.
   * If the invitation has a hiveId: joins that hive.
   * If no hiveId: creates a new hive (like open registration).
   */
  async registerWithInvitation(
    inviteToken: string,
    input: CreateHiveInput,
    ipAddress?: string,
    userAgent?: string
  ) {
    const tokenHash = this.hashToken(inviteToken);

    const invitation = await this.prisma.invitation.findUnique({ where: { token: tokenHash } });

    if (!invitation || invitation.usedAt || invitation.expiresAt < new Date()) {
      throw new BadRequestException('Invalid or expired invitation link.');
    }

    // Email must match the invitation
    if (invitation.email.toLowerCase() !== input.adminEmail.toLowerCase()) {
      throw new BadRequestException('This invitation was sent to a different email address.');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { emailHash: this.enc.hashEmail(input.adminEmail) },
    });
    if (existingUser) {
      throw new BadRequestException('An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(input.adminPassword, PASSWORD_CONFIG.SALT_ROUNDS);

    const result = await this.prisma.$transaction(async (tx: TransactionClient) => {
      // Mark invitation as used
      await tx.invitation.update({ where: { id: invitation.id }, data: { usedAt: new Date() } });

      let hive: Hive;
      let personId: string;

      if (invitation.hiveId) {
        // Join existing hive
        hive = await tx.hive.findUniqueOrThrow({ where: { id: invitation.hiveId } });
        const defaultRole = hive.type === 'family' ? 'parent' : 'member';
        const person = await tx.person.create({
          data: { hiveId: hive.id, role: defaultRole },
        });
        personId = person.id;

        const newUserId1 = crypto.randomUUID();
        const user: User = await tx.user.create({
          data: {
            id: newUserId1,
            email: this.enc.encryptForUser(input.adminEmail.toLowerCase().trim(), newUserId1),
            emailHash: this.enc.hashEmail(input.adminEmail),
            passwordHash,
            fullName: input.adminName ? this.enc.encryptForUser(input.adminName, newUserId1) : null,
          },
        });

        await tx.person.update({ where: { id: person.id }, data: { userId: user.id } });
        await tx.userHiveMembership.create({
          data: { userId: user.id, hiveId: hive.id, personId: person.id, isPrimary: true },
        });

        return { hive, user, personId };
      } else {
        // Create new hive (same as open registration)
        const newHiveId = crypto.randomUUID();
        hive = await tx.hive.create({
          data: {
            id: newHiveId,
            name: this.encryptHiveName(input.name, newHiveId),
            type: input.type,
          },
        });
        const adminRole = input.type === 'family' ? 'parent' : 'org_admin';
        const person = await tx.person.create({ data: { hiveId: hive.id, role: adminRole } });
        personId = person.id;

        const newUserId2 = crypto.randomUUID();
        const user: User = await tx.user.create({
          data: {
            id: newUserId2,
            email: this.enc.encryptForUser(input.adminEmail.toLowerCase().trim(), newUserId2),
            emailHash: this.enc.hashEmail(input.adminEmail),
            passwordHash,
            fullName: input.adminName ? this.enc.encryptForUser(input.adminName, newUserId2) : null,
          },
        });

        await tx.person.update({ where: { id: person.id }, data: { userId: user.id } });
        await tx.userHiveMembership.create({
          data: { userId: user.id, hiveId: hive.id, personId: person.id, isPrimary: true },
        });

        return { hive, user, personId };
      }
    });

    const { token: accessToken } = this.generateAccessToken(
      result.user.id,
      result.hive.id,
      result.personId
    );
    const refreshTokenData = await this.refreshTokenService.createRefreshToken(
      result.user.id,
      ipAddress,
      userAgent
    );

    void this.sendEmailVerification(result.user.id).catch(() => undefined);

    return {
      accessToken,
      refreshToken: refreshTokenData.token,
      expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRES_SECONDS,
      user: {
        id: result.user.id,
        email: this.enc.decryptForUser(result.user.email, result.user.id),
        hiveId: result.hive.id,
        personId: result.personId,
      },
      hive: { id: result.hive.id, name: this.decryptHiveName(result.hive.name, result.hive.id) },
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private encryptHiveName(name: string, hiveId: string): string {
    return this.enc.serializeToStorage(this.enc.encrypt(name, hiveId));
  }

  private decryptHiveName(encrypted: string, hiveId: string): string {
    // If the value doesn't match the v{n}:{base64} storage format it is still
    // plaintext — migration window between old and new schema.  Return as-is.
    if (!/^v\d+:/.test(encrypted)) {
      this.logger.warn(`Hive ${hiveId}: name field is still plaintext (migration window)`);
      return encrypted;
    }
    // Value IS in encrypted format — parse + decrypt.  Any failure here
    // (wrong key, auth-tag mismatch, data corruption) is a real error and
    // must propagate instead of silently returning ciphertext to the client.
    return this.enc.decrypt(this.enc.parseFromStorage(encrypted), hiveId);
  }

  private generateSecureToken(): { plainToken: string; tokenHash: string } {
    const plainToken = crypto.randomBytes(32).toString('base64url');
    return { plainToken, tokenHash: this.hashToken(plainToken) };
  }

  private hashToken(plainToken: string): string {
    return crypto.createHash('sha256').update(plainToken).digest('hex');
  }

  /**
   * Get all hives for a user
   */
  async getUserHives(userId: string): Promise<
    Array<{
      id: string;
      name: string;
      role: string;
      isPrimary: boolean;
      personId: string;
    }>
  > {
    const memberships: MembershipWithHiveAndPerson[] =
      await this.prisma.userHiveMembership.findMany({
        where: { userId },
        include: { hive: true, person: true },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      });

    return memberships.map((m) => ({
      id: m.hive.id,
      name: this.decryptHiveName(m.hive.name, m.hive.id),
      role: m.person.role,
      isPrimary: m.isPrimary,
      personId: m.personId,
    }));
  }
}
