import { Injectable, Logger } from '@nestjs/common';

import { RedisService } from './redis.service';

/**
 * Account Lockout Service
 *
 * Protects against brute force attacks by:
 * - Tracking failed login attempts per email
 * - Locking accounts after too many failures
 * - Implementing exponential backoff
 *
 * Security configuration:
 * - Max failed attempts: 5
 * - Initial lockout: 15 minutes
 * - Max lockout: 24 hours
 * - Exponential backoff multiplier: 2
 */
@Injectable()
export class AccountLockoutService {
  private readonly logger = new Logger(AccountLockoutService.name);

  // Configuration
  private readonly MAX_ATTEMPTS = 5;
  private readonly INITIAL_LOCKOUT_MINUTES = 15;
  private readonly MAX_LOCKOUT_MINUTES = 24 * 60; // 24 hours
  private readonly BACKOFF_MULTIPLIER = 2;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Record a failed login attempt
   *
   * @param email - User email
   * @returns Object with isLocked status and remaining lockout time
   */
  async recordFailedAttempt(email: string): Promise<{
    isLocked: boolean;
    remainingLockoutSeconds?: number;
    attemptsRemaining?: number;
  }> {
    const normalizedEmail = email.toLowerCase().trim();
    const key = this.getKey(normalizedEmail);
    const lockKey = this.getLockKey(normalizedEmail);
    const lockCountKey = this.getLockCountKey(normalizedEmail);

    // Check if already locked
    const currentLockTime = await this.redisService.get(lockKey);
    if (currentLockTime) {
      const remainingTtl = await this.redisService.ttl(lockKey);
      this.logger.warn(`Failed login attempt for locked account: ${normalizedEmail}`);
      return {
        isLocked: true,
        remainingLockoutSeconds: remainingTtl,
      };
    }

    // Increment failed attempts counter
    const attempts = await this.redisService.incr(key);

    // Set expiration on first attempt (15 minutes window)
    if (attempts === 1) {
      await this.redisService.expire(key, this.INITIAL_LOCKOUT_MINUTES * 60);
    }

    this.logger.warn(
      `Failed login attempt ${attempts}/${this.MAX_ATTEMPTS} for: ${normalizedEmail}`
    );

    // Check if account should be locked
    if (attempts >= this.MAX_ATTEMPTS) {
      // Get number of previous lockouts for exponential backoff
      const lockCount = await this.getLockCount(normalizedEmail);
      const lockoutMinutes = this.calculateLockoutDuration(lockCount);
      const lockoutSeconds = lockoutMinutes * 60;

      // Lock the account
      await this.redisService.set(lockKey, new Date().toISOString(), lockoutSeconds);

      // Increment lock counter
      await this.redisService.incr(lockCountKey);
      await this.redisService.expire(lockCountKey, 24 * 60 * 60); // 24h

      // Reset attempts counter
      await this.redisService.del(key);

      this.logger.error(
        `Account locked (${lockCount + 1}x) for ${lockoutMinutes} minutes: ${normalizedEmail}`
      );

      return {
        isLocked: true,
        remainingLockoutSeconds: lockoutSeconds,
      };
    }

    return {
      isLocked: false,
      attemptsRemaining: this.MAX_ATTEMPTS - attempts,
    };
  }

  /**
   * Check if an account is currently locked
   *
   * @param email - User email
   * @returns Object with lock status and remaining time
   */
  async isLocked(email: string): Promise<{
    locked: boolean;
    remainingSeconds?: number;
  }> {
    const normalizedEmail = email.toLowerCase().trim();
    const lockKey = this.getLockKey(normalizedEmail);

    const lockTime = await this.redisService.get(lockKey);
    if (!lockTime) {
      return { locked: false };
    }

    const remainingTtl = await this.redisService.ttl(lockKey);
    return {
      locked: true,
      remainingSeconds: remainingTtl,
    };
  }

  /**
   * Reset failed attempts counter (call after successful login)
   *
   * @param email - User email
   */
  async resetAttempts(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase().trim();
    const key = this.getKey(normalizedEmail);
    const lockCountKey = this.getLockCountKey(normalizedEmail);

    await this.redisService.del(key);
    await this.redisService.del(lockCountKey);

    this.logger.log(`Reset failed attempts for: ${normalizedEmail}`);
  }

  /**
   * Get current number of failed attempts
   *
   * @param email - User email
   * @returns Number of failed attempts
   */
  async getAttempts(email: string): Promise<number> {
    const normalizedEmail = email.toLowerCase().trim();
    const key = this.getKey(normalizedEmail);

    const value = await this.redisService.get(key);
    return value ? parseInt(value, 10) : 0;
  }

  /**
   * Calculate lockout duration with exponential backoff
   *
   * @param lockCount - Number of previous lockouts
   * @returns Lockout duration in minutes
   */
  private calculateLockoutDuration(lockCount: number): number {
    const duration = this.INITIAL_LOCKOUT_MINUTES * Math.pow(this.BACKOFF_MULTIPLIER, lockCount);
    return Math.min(duration, this.MAX_LOCKOUT_MINUTES);
  }

  /**
   * Get number of times this account has been locked
   */
  private async getLockCount(email: string): Promise<number> {
    const lockCountKey = this.getLockCountKey(email);
    const value = await this.redisService.get(lockCountKey);
    return value ? parseInt(value, 10) : 0;
  }

  /**
   * Generate Redis key for failed attempts counter
   */
  private getKey(email: string): string {
    return `auth:failed:${email}`;
  }

  /**
   * Generate Redis key for account lock status
   */
  private getLockKey(email: string): string {
    return `auth:locked:${email}`;
  }

  /**
   * Generate Redis key for lock count (for exponential backoff)
   */
  private getLockCountKey(email: string): string {
    return `auth:lockcount:${email}`;
  }
}
