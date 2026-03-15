import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { AuthService } from './auth.service';

/**
 * Scheduled task that hard-deletes expired invitations from the database.
 *
 * Invitations expire after 7 days. This task runs daily at 03:00 UTC
 * and removes all rows where `expires_at < NOW()`, regardless of whether
 * they were used or not.
 *
 * Why hard-delete:
 * - Invitation rows contain the recipient's plaintext email address
 *   (stored since migration 20260314000005_invitation_email).
 * - Keeping email addresses beyond the invitation's purpose violates
 *   data minimization principles.
 * - The `usedAt` field is sufficient context for any audit; old rows
 *   provide no operational value.
 */
@Injectable()
export class InvitationCleanupTask {
  private readonly logger = new Logger(InvitationCleanupTask.name);

  constructor(private readonly authService: AuthService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup(): Promise<void> {
    try {
      const count = await this.authService.cleanupExpiredInvitations();
      if (count > 0) {
        this.logger.log(`Invitation cleanup complete: removed ${count} expired invitation(s)`);
      }
    } catch (error) {
      this.logger.error('Invitation cleanup failed', error instanceof Error ? error.stack : error);
    }
  }
}
