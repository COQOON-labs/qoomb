import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { RefreshTokenService } from './refresh-token.service';

/**
 * Scheduled task that cleans up expired refresh tokens from the database.
 *
 * Runs daily at 03:00 UTC. Expired tokens that are older than 30 days are
 * permanently deleted to prevent unbounded table growth (CWE-459).
 */
@Injectable()
export class TokenCleanupTask {
  private readonly logger = new Logger(TokenCleanupTask.name);

  constructor(private readonly refreshTokenService: RefreshTokenService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup(): Promise<void> {
    try {
      const count = await this.refreshTokenService.cleanupExpiredTokens();
      if (count > 0) {
        this.logger.log(`Token cleanup complete: removed ${count} expired tokens`);
      }
    } catch (error) {
      this.logger.error('Token cleanup failed', error instanceof Error ? error.stack : error);
    }
  }
}
