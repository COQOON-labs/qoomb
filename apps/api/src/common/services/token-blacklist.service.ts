import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from './redis.service';

/**
 * Token Blacklist Service
 *
 * Manages blacklist for revoked JWT access tokens.
 *
 * How it works:
 * - When a user logs out or a token is compromised, add it to blacklist
 * - Tokens are stored in Redis with TTL matching token expiration
 * - Middleware checks blacklist before accepting tokens
 *
 * Why Redis:
 * - Fast lookups (O(1))
 * - Automatic expiration (TTL)
 * - Distributed (works across multiple servers)
 * - No need to persist after token expires
 */
@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly prefix = 'blacklist:token:';

  constructor(private readonly redisService: RedisService) {}

  /**
   * Add a token to the blacklist
   *
   * @param tokenId - The JWT 'jti' (JWT ID) claim
   * @param expiresIn - How long until token expires (seconds)
   * @param reason - Reason for blacklisting (for logging)
   */
  async blacklistToken(
    tokenId: string,
    expiresIn: number,
    reason: string = 'logout'
  ): Promise<void> {
    const key = this.prefix + tokenId;

    // Store token ID with metadata
    await this.redisService.set(
      key,
      JSON.stringify({
        blacklistedAt: new Date().toISOString(),
        reason,
      }),
      expiresIn
    );

    this.logger.log(`Blacklisted token ${tokenId} (reason: ${reason})`);
  }

  /**
   * Check if a token is blacklisted
   *
   * @param tokenId - The JWT 'jti' (JWT ID) claim
   * @returns true if token is blacklisted
   */
  async isBlacklisted(tokenId: string): Promise<boolean> {
    const key = this.prefix + tokenId;
    const exists = await this.redisService.exists(key);

    if (exists) {
      this.logger.warn(`Blocked blacklisted token: ${tokenId}`);
    }

    return exists;
  }

  /**
   * Remove a token from blacklist
   * (Rarely needed, but useful for token restoration)
   *
   * @param tokenId - The JWT 'jti' (JWT ID) claim
   */
  async removeFromBlacklist(tokenId: string): Promise<void> {
    const key = this.prefix + tokenId;
    await this.redisService.del(key);
    this.logger.log(`Removed token ${tokenId} from blacklist`);
  }

  /**
   * Blacklist all tokens for a user
   * Used for "logout from all devices"
   *
   * Note: This requires storing all active token IDs per user
   * Alternative: Use short-lived tokens and rely on refresh token revocation
   *
   * @param userId - User ID
   * @param expiresIn - Max remaining lifetime of tokens (seconds)
   */
  async blacklistAllUserTokens(userId: string, expiresIn: number): Promise<void> {
    const key = `blacklist:user:${userId}`;

    // Store user-level blacklist marker
    await this.redisService.set(
      key,
      JSON.stringify({
        blacklistedAt: new Date().toISOString(),
        reason: 'logout_all',
      }),
      expiresIn
    );

    this.logger.log(`Blacklisted all tokens for user ${userId}`);
  }

  /**
   * Check if all tokens for a user are blacklisted
   *
   * @param userId - User ID
   * @returns true if all user tokens are blacklisted
   */
  async isUserBlacklisted(userId: string): Promise<boolean> {
    const key = `blacklist:user:${userId}`;
    return await this.redisService.exists(key);
  }
}
