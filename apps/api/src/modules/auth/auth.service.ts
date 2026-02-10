import * as crypto from 'crypto';

import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Hive, User, UserHiveMembership } from '@prisma/client';
import type { CreateHiveInput } from '@qoomb/types';
import * as bcrypt from 'bcrypt';

import { AccountLockoutService } from '../../common/services/account-lockout.service';
import { TokenBlacklistService } from '../../common/services/token-blacklist.service';
import { PASSWORD_CONFIG, JWT_CONFIG } from '../../config/security.config';
import { PrismaService, TransactionClient } from '../../prisma/prisma.service';

import { RefreshTokenService } from './refresh-token.service';

// Type definitions for raw SQL query results
interface PersonIdResult {
  id: string;
}

interface JwtPayload {
  jti?: string;
  sub: string;
  exp?: number;
  hiveId?: string;
  personId?: string;
  type?: string;
}

interface MembershipWithHive extends UserHiveMembership {
  hive: Hive;
}

interface UserWithMemberships extends User {
  memberships: MembershipWithHive[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly accountLockout: AccountLockoutService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly refreshTokenService: RefreshTokenService
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
    // Check if email already exists
    const existingUser: User | null = await this.prisma.user.findUnique({
      where: { email: input.adminEmail },
    });

    if (existingUser) {
      // SECURITY: Generic error message to prevent email enumeration
      throw new BadRequestException(
        'Registration failed. Please check your information and try again.'
      );
    }

    // Hash password with configured salt rounds
    const passwordHash = await bcrypt.hash(input.adminPassword, PASSWORD_CONFIG.SALT_ROUNDS);

    // Create hive and user in a transaction
    const result = await this.prisma.$transaction(async (tx: TransactionClient) => {
      // 1. Create the hive
      const hive: Hive = await tx.hive.create({
        data: {
          name: input.name,
        },
      });

      // 2. Create dynamic schema for this hive
      await tx.$executeRawUnsafe(`
        CREATE SCHEMA IF NOT EXISTS hive_${hive.id}
      `);

      // 3. Create persons table in hive schema
      await tx.$executeRawUnsafe(`
        CREATE TABLE hive_${hive.id}.persons (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          name VARCHAR(255) NOT NULL,
          role VARCHAR(50) NOT NULL,
          birthdate DATE,
          age_group VARCHAR(20),
          permission_level INT NOT NULL DEFAULT 100,
          public_key TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          version INT NOT NULL DEFAULT 1
        )
      `);

      // 4. Create admin person in hive schema
      const personResult = await tx.$queryRawUnsafe<PersonIdResult[]>(
        `
        INSERT INTO hive_${hive.id}.persons (name, role, permission_level)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
        input.adminName,
        'parent',
        100
      );

      const personId: string | undefined = personResult[0]?.id;
      if (!personId) {
        throw new BadRequestException('Failed to create admin person');
      }

      // 5. Create user account
      const user: User = await tx.user.create({
        data: {
          email: input.adminEmail,
          passwordHash,
        },
      });

      // 6. Create membership linking user to hive
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      await (
        tx as unknown as {
          userHiveMembership: {
            create: (args: {
              data: {
                userId: string;
                hiveId: string;
                personId: string;
                role: string;
                isPrimary: boolean;
              };
            }) => Promise<UserHiveMembership>;
          };
        }
      ).userHiveMembership.create({
        data: {
          userId: user.id,
          hiveId: hive.id,
          personId,
          role: 'admin',
          isPrimary: true, // First hive is always primary
        },
      });

      return { hive, user, personId };
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

    const userEmail: string = result.user.email;
    const hiveIdReturn: string = result.hive.id;
    const hiveName: string = result.hive.name;

    return {
      accessToken,
      refreshToken: refreshTokenData.token,
      expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRES_SECONDS,
      user: {
        id: userId,
        email: userEmail,
        hiveId: hiveIdReturn,
        personId: personId,
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

    // Find user with memberships
    const user: UserWithMemberships | null = await this.prisma.user.findUnique({
      where: { email },
      include: {
        memberships: {
          include: {
            hive: true,
          },
        },
      },
    });

    if (!user) {
      // Record failed attempt even if user doesn't exist (prevents enumeration)
      await this.accountLockout.recordFailedAttempt(email);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user has at least one membership
    if (user.memberships.length === 0) {
      throw new UnauthorizedException('No hive access');
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

    const userEmail: string = user.email;
    const hiveName: string = primaryMembership.hive.name;

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
        id: m.hiveId,
        name: m.hive.name,
        role: m.role,
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      const membership: MembershipWithHive | null = await (
        this.prisma as unknown as {
          userHiveMembership: {
            findUnique: (args: {
              where: { userId_hiveId: { userId: string; hiveId: string } };
              include: { hive: boolean };
            }) => Promise<MembershipWithHive | null>;
          };
        }
      ).userHiveMembership.findUnique({
        where: {
          userId_hiveId: {
            userId: user.id,
            hiveId: hiveId,
          },
        },
        include: {
          hive: true,
        },
      });

      if (!membership) {
        throw new UnauthorizedException('Invalid hive access');
      }

      const userId: string = user.id;
      const userEmail: string = user.email;
      const personId: string = membership.personId;
      const hiveName: string = membership.hive.name;

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
          include: { hive: true },
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const membership: MembershipWithHive | null = await (
      this.prisma as unknown as {
        userHiveMembership: {
          findUnique: (args: {
            where: { userId_hiveId: { userId: string; hiveId: string } };
            include: { hive: boolean };
          }) => Promise<MembershipWithHive | null>;
        };
      }
    ).userHiveMembership.findUnique({
      where: {
        userId_hiveId: {
          userId: userId,
          hiveId: targetHiveId,
        },
      },
      include: {
        hive: true,
      },
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
        name: membership.hive.name,
        role: membership.role,
      },
    };
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const memberships: MembershipWithHive[] = await (
      this.prisma as unknown as {
        userHiveMembership: {
          findMany: (args: {
            where: { userId: string };
            include: { hive: boolean };
            orderBy: Array<{ isPrimary?: string; createdAt?: string }>;
          }) => Promise<MembershipWithHive[]>;
        };
      }
    ).userHiveMembership.findMany({
      where: { userId },
      include: { hive: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });

    return memberships.map((m) => ({
      id: m.hiveId,
      name: m.hive.name,
      role: m.role,
      isPrimary: m.isPrimary,
      personId: m.personId,
    }));
  }
}
