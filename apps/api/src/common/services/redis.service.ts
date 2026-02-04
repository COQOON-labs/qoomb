import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

/**
 * Redis Service
 *
 * Provides Redis connection for:
 * - Rate limiting storage
 * - Session management
 * - Caching
 * - Pub/Sub
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType;

  constructor() {
    this.client = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    // Error handling
    this.client.on('error', (err) => {
      this.logger.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      this.logger.log('✅ Redis connected');
    });

    this.client.on('reconnecting', () => {
      this.logger.warn('⚠️  Redis reconnecting...');
    });
  }

  async onModuleInit() {
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('👋 Redis disconnected');
  }

  /**
   * Get the Redis client instance
   */
  getClient(): RedisClientType {
    return this.client;
  }

  /**
   * Set a key with optional expiration
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.setEx(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  /**
   * Get a value by key
   */
  async get(key: string): Promise<string | null> {
    const value = await this.client.get(key);
    return typeof value === 'string' ? value : null;
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  /**
   * Increment a key by 1
   */
  async incr(key: string): Promise<number> {
    return await this.client.incr(key);
  }

  /**
   * Set expiration on a key
   */
  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Get time to live for a key
   */
  async ttl(key: string): Promise<number> {
    return await this.client.ttl(key);
  }
}
