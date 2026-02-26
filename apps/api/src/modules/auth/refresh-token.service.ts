import * as crypto from 'crypto';

import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import type { RefreshToken, User } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';

// Type for refresh token with user relation
interface RefreshTokenWithUser extends RefreshToken {
  user: User;
}

/**
 * Refresh Token Service
 *
 * Manages JWT refresh tokens with the following features:
 * - Token rotation (automatic replacement on refresh)
 * - Token revocation
 * - Automatic cleanup of expired tokens
 * - Device/session tracking
 *
 * Security features:
 * - Tokens are hashed (SHA-256) before storage
 * - Automatic revocation of old tokens on rotation
 * - Revocation chain tracking (replaced_by_token)
 * - IP and User-Agent tracking for security monitoring
 */
@Injectable()
export class RefreshTokenService {
  private readonly logger = new Logger(RefreshTokenService.name);

  // Refresh token lifetime: 7 days
  private readonly REFRESH_TOKEN_LIFETIME_DAYS = 7;

  /**
   * Maximum concurrent active sessions per user.
   * When exceeded, the oldest active session is revoked.
   */
  private readonly MAX_SESSIONS = 5;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new refresh token for a user
   *
   * @param userId - User ID
   * @param ipAddress - Client IP address (optional)
   * @param userAgent - Client User-Agent (optional)
   * @returns Object with token (plaintext) and database record
   */
  async createRefreshToken(
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{ token: string; id: string; expiresAt: Date }> {
    // Enforce maximum concurrent sessions per user.
    // If at the limit, revoke the oldest active session.
    const activeCount = await this.prisma.refreshToken.count({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (activeCount >= this.MAX_SESSIONS) {
      const oldest = await this.prisma.refreshToken.findFirst({
        where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (oldest) {
        await this.prisma.refreshToken.update({
          where: { id: oldest.id },
          data: { revokedAt: new Date() },
        });
        this.logger.log(`Evicted oldest session for user ${userId} (max ${this.MAX_SESSIONS})`);
      }
    }

    // Generate secure random token (32 bytes = 256 bits)
    const token = crypto.randomBytes(32).toString('base64url');

    // Hash token for storage (SHA-256)
    const tokenHash = this.hashToken(token);

    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.REFRESH_TOKEN_LIFETIME_DAYS);

    // Store hashed token in database
    const refreshToken: RefreshToken = await this.prisma.refreshToken.create({
      data: {
        token: tokenHash,
        userId,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    this.logger.log(`Created refresh token for user ${userId}`);

    // Return plaintext token (only time it's available)
    const tokenId: string = refreshToken.id;
    const tokenExpiresAt: Date = refreshToken.expiresAt;

    return {
      token, // Plaintext for client
      id: tokenId,
      expiresAt: tokenExpiresAt,
    };
  }

  /**
   * Validate and rotate refresh token
   *
   * Token rotation:
   * 1. Verify token is valid and not expired
   * 2. Create new refresh token
   * 3. Mark old token as revoked and link to new token
   *
   * @param token - Plaintext refresh token
   * @returns Object with new token and user info
   * @throws UnauthorizedException if token is invalid/expired/revoked
   */
  async rotateRefreshToken(
    token: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<{
    userId: string;
    newToken: string;
    expiresAt: Date;
  }> {
    // Hash token for lookup
    const tokenHash = this.hashToken(token);

    // Find token in database
    const refreshToken: RefreshTokenWithUser | null = await this.prisma.refreshToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    // Validate token exists
    if (!refreshToken) {
      this.logger.warn('Refresh token not found');
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Check if token is revoked
    if (refreshToken.revokedAt) {
      const userId: string = refreshToken.userId;
      this.logger.warn(`Attempted use of revoked token for user ${userId}`);
      throw new UnauthorizedException('Token has been revoked');
    }

    // Check if token is expired
    if (refreshToken.expiresAt < new Date()) {
      const userId: string = refreshToken.userId;
      this.logger.warn(`Attempted use of expired token for user ${userId}`);
      throw new UnauthorizedException('Token has expired');
    }

    // Create new refresh token
    const userId: string = refreshToken.userId;
    const newRefreshToken = await this.createRefreshToken(userId, ipAddress, userAgent);

    // Revoke old token and link to new one
    const refreshTokenId: string = refreshToken.id;
    await this.prisma.refreshToken.update({
      where: { id: refreshTokenId },
      data: {
        revokedAt: new Date(),
        replacedByToken: this.hashToken(newRefreshToken.token),
      },
    });

    this.logger.log(`Rotated refresh token for user ${userId}`);

    const newTokenValue: string = newRefreshToken.token;
    const expiresAt: Date = newRefreshToken.expiresAt;

    return {
      userId: userId,
      newToken: newTokenValue,
      expiresAt: expiresAt,
    };
  }

  /**
   * Revoke a specific refresh token
   *
   * @param token - Plaintext refresh token to revoke
   */
  async revokeToken(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);

    await this.prisma.refreshToken.updateMany({
      where: {
        token: tokenHash,
        revokedAt: null, // Only revoke if not already revoked
      },
      data: {
        revokedAt: new Date(),
      },
    });

    this.logger.log('Revoked refresh token');
  }

  /**
   * Revoke all refresh tokens for a user
   * Useful for "logout from all devices"
   *
   * @param userId - User ID
   */
  async revokeAllTokensForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    this.logger.log(`Revoked all refresh tokens for user ${userId}`);
  }

  /**
   * Get all active refresh tokens for a user
   * Useful for showing active sessions
   *
   * @param userId - User ID
   * @returns Array of active refresh tokens with metadata
   */
  getActiveTokensForUser(userId: string) {
    return this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Cleanup expired refresh tokens
   * Should be run periodically (e.g., daily cron job)
   *
   * Removes tokens that expired more than 30 days ago
   */
  async cleanupExpiredTokens(): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await this.prisma.refreshToken.deleteMany({
      where: {
        expiresAt: {
          lt: thirtyDaysAgo,
        },
      },
    });

    const count: number = result.count;
    if (count > 0) {
      this.logger.log(`Cleaned up ${count} expired refresh tokens`);
    }

    return count;
  }

  /**
   * Hash a token using SHA-256
   * Tokens are never stored in plaintext in the database
   *
   * @param token - Plaintext token
   * @returns Hashed token (hex string)
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
