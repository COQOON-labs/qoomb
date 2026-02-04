import * as crypto from 'crypto';

import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { CreateHiveInput } from '@qoomb/types';
import * as bcrypt from 'bcrypt';

import { AccountLockoutService } from '../../common/services/account-lockout.service';
import { TokenBlacklistService } from '../../common/services/token-blacklist.service';
import { PASSWORD_CONFIG, JWT_CONFIG } from '../../config/security.config';
import { PrismaService } from '../../prisma/prisma.service';

import { RefreshTokenService } from './refresh-token.service';

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
    const existingUser = await this.prisma.user.findUnique({
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
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create the hive
      const hive = await tx.hive.create({
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
      const personResult = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        `
        INSERT INTO hive_${hive.id}.persons (name, role, permission_level)
        VALUES ($1, $2, $3)
        RETURNING id
      `,
        input.adminName,
        'parent',
        100
      );

      const personId = personResult[0].id;

      // 5. Create user account
      const user = await tx.user.create({
        data: {
          email: input.adminEmail,
          passwordHash,
          hiveId: hive.id,
          personId,
        },
      });

      return { hive, user, personId };
    });

    // Generate access token (short-lived)
    const { token: accessToken } = this.generateAccessToken(
      result.user.id,
      result.hive.id,
      result.personId
    );

    // Generate refresh token (long-lived)
    const refreshTokenData = await this.refreshTokenService.createRefreshToken(
      result.user.id,
      ipAddress,
      userAgent
    );

    return {
      accessToken,
      refreshToken: refreshTokenData.token,
      expiresIn: JWT_CONFIG.ACCESS_TOKEN_EXPIRES_SECONDS,
      user: {
        id: result.user.id,
        email: result.user.email,
        hiveId: result.hive.id,
        personId: result.personId,
      },
      hive: {
        id: result.hive.id,
        name: result.hive.name,
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
      const minutes = Math.ceil(lockStatus.remainingSeconds! / 60);
      throw new UnauthorizedException(
        `Account temporarily locked. Please try again in ${minutes} minute(s).`
      );
    }

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        hive: true,
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
        const minutes = Math.ceil(result.remainingLockoutSeconds! / 60);
        throw new UnauthorizedException(
          `Too many failed attempts. Account locked for ${minutes} minute(s).`
        );
      }

      throw new UnauthorizedException('Invalid credentials');
    }

    // Successful login - reset failed attempts
    await this.accountLockout.resetAttempts(email);

    // Generate access token (short-lived)
    const { token: accessToken } = this.generateAccessToken(user.id, user.hiveId, user.personId);

    // Generate refresh token (long-lived)
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
        email: user.email,
        hiveId: user.hiveId,
        personId: user.personId,
      },
      hive: {
        id: user.hive.id,
        name: user.hive.name,
      },
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
      const payload = this.jwtService.verify(token);

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

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          hive: true,
        },
      });

      if (!user) {
        // SECURITY: Generic error message, same as invalid token
        throw new UnauthorizedException('Authentication failed');
      }

      return {
        id: user.id,
        email: user.email,
        hiveId: user.hiveId,
        personId: user.personId,
        hiveName: user.hive.name,
      };
    } catch (error) {
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
    personId?: string | null
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

    // Get user details
    const user = await this.prisma.user.findUnique({
      where: { id: rotated.userId },
      include: { hive: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Generate new access token
    const { token: accessToken } = this.generateAccessToken(user.id, user.hiveId, user.personId);

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
    const decoded = this.jwtService.decode(accessToken);
    if (decoded?.jti) {
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
  async getActiveSessions(userId: string) {
    return this.refreshTokenService.getActiveTokensForUser(userId);
  }
}
