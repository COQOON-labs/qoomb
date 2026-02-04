import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';

import { RedisService } from '../services/redis.service';

/**
 * Redis-based Throttler Storage
 *
 * Stores rate limit data in Redis for:
 * - Distributed rate limiting across multiple servers
 * - Persistent rate limit counters
 * - Better performance than in-memory storage
 */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly prefix = 'throttle:';

  constructor(private readonly redisService: RedisService) {}

  /**
   * Increment the request counter for a key
   *
   * @param key - The throttler key (user ID or IP address)
   * @param ttl - Time to live in milliseconds
   * @param limit - Maximum number of requests allowed
   * @param blockDuration - How long to block in milliseconds
   * @param throttlerName - Name of the throttler
   * @returns The current count and time remaining
   */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string
  ): Promise<{
    totalHits: number;
    timeToExpire: number;
    isBlocked: boolean;
    timeToBlockExpire: number;
  }> {
    const redisKey = this.prefix + key;
    const client = this.redisService.getClient();

    // Get current TTL
    const currentTtl = await this.redisService.ttl(redisKey);

    // Increment counter
    const hits = await this.redisService.incr(redisKey);

    // Set expiration if this is the first hit
    if (hits === 1 || currentTtl === -1) {
      await client.expire(redisKey, Math.ceil(ttl / 1000));
    }

    // Get time to expire in milliseconds
    const timeToExpire = currentTtl > 0 ? currentTtl * 1000 : ttl;

    // Check if blocked
    const isBlocked = hits > limit;
    const timeToBlockExpire = isBlocked ? blockDuration : 0;

    return {
      totalHits: hits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    };
  }

  /**
   * Reset the counter for a key
   */
  async reset(key: string): Promise<void> {
    const redisKey = this.prefix + key;
    await this.redisService.del(redisKey);
  }
}
