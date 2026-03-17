import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PgBoss, type Job } from 'pg-boss';

import { getEnv } from '../../config/env.validation';

import { DEFAULT_LOCALE, EmailService, type SupportedLocale } from './email.service';

interface VerificationJobData {
  to: string;
  token: string;
  locale: SupportedLocale;
}

interface PasswordResetJobData {
  to: string;
  token: string;
  locale: SupportedLocale;
}

interface InvitationJobData {
  to: string;
  inviterName: string;
  token: string;
  locale: SupportedLocale;
}

const QUEUES = {
  VERIFICATION: 'email.verification',
  PASSWORD_RESET: 'email.password-reset',
  INVITATION: 'email.invitation',
} as const;

/** Expiry aligned to token lifetimes so stale jobs never fire after token expiry. */
const EXPIRE_IN_SECONDS = {
  VERIFICATION: 24 * 60 * 60, // 24 h
  PASSWORD_RESET: 60 * 60, // 1 h
  INVITATION: 7 * 24 * 60 * 60, // 7 d
} as const;

/**
 * Async email queue backed by pg-boss (PostgreSQL).
 *
 * Replaces fire-and-forget email sends with durable, retried jobs.
 * Owns the pg-boss lifecycle (start/stop) and registers all three
 * email workers. Callers use enqueue*() instead of EmailService directly.
 *
 * Retry strategy: up to 5 attempts with exponential backoff (base 60 s).
 * Failed jobs are retained in the pgboss schema for audit / manual retry.
 */
@Injectable()
export class EmailQueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailQueueService.name);
  private boss!: PgBoss;

  constructor(private readonly emailService: EmailService) {}

  async onModuleInit(): Promise<void> {
    this.boss = new PgBoss({
      // Q-002: use getEnv() so DATABASE_URL is Zod-validated at startup
      connectionString: getEnv().DATABASE_URL,
    });

    this.boss.on('error', (error: Error) => this.logger.error('pg-boss error', error.stack));

    await this.boss.start();
    await this.createQueues();
    await this.registerWorkers();
    this.logger.log('✅ Email queue started');
  }

  async onModuleDestroy(): Promise<void> {
    await this.boss.stop({ graceful: true });
    this.logger.log('👋 Email queue stopped');
  }

  private async createQueues(): Promise<void> {
    const retryDefaults = { retryLimit: 5, retryDelay: 60, retryBackoff: true };
    await this.boss.createQueue(QUEUES.VERIFICATION, retryDefaults);
    await this.boss.createQueue(QUEUES.PASSWORD_RESET, retryDefaults);
    await this.boss.createQueue(QUEUES.INVITATION, retryDefaults);
  }

  private async registerWorkers(): Promise<void> {
    await this.boss.work<VerificationJobData>(
      QUEUES.VERIFICATION,
      async (jobs: Job<VerificationJobData>[]) => {
        for (const job of jobs) {
          await this.emailService.sendEmailVerification(
            job.data.to,
            job.data.token,
            job.data.locale
          );
        }
      }
    );

    await this.boss.work<PasswordResetJobData>(
      QUEUES.PASSWORD_RESET,
      async (jobs: Job<PasswordResetJobData>[]) => {
        for (const job of jobs) {
          await this.emailService.sendPasswordReset(job.data.to, job.data.token, job.data.locale);
        }
      }
    );

    await this.boss.work<InvitationJobData>(
      QUEUES.INVITATION,
      async (jobs: Job<InvitationJobData>[]) => {
        for (const job of jobs) {
          await this.emailService.sendInvitation(
            job.data.to,
            job.data.inviterName,
            job.data.token,
            job.data.locale
          );
        }
      }
    );
  }

  async enqueueVerification(
    to: string,
    token: string,
    locale: SupportedLocale = DEFAULT_LOCALE
  ): Promise<void> {
    const data: VerificationJobData = { to, token, locale };
    await this.boss.send(QUEUES.VERIFICATION, data, {
      expireInSeconds: EXPIRE_IN_SECONDS.VERIFICATION,
    });
  }

  async enqueuePasswordReset(
    to: string,
    token: string,
    locale: SupportedLocale = DEFAULT_LOCALE
  ): Promise<void> {
    const data: PasswordResetJobData = { to, token, locale };
    await this.boss.send(QUEUES.PASSWORD_RESET, data, {
      expireInSeconds: EXPIRE_IN_SECONDS.PASSWORD_RESET,
    });
  }

  async enqueueInvitation(
    to: string,
    inviterName: string,
    token: string,
    locale: SupportedLocale = DEFAULT_LOCALE
  ): Promise<void> {
    const data: InvitationJobData = { to, inviterName, token, locale };
    await this.boss.send(QUEUES.INVITATION, data, {
      expireInSeconds: EXPIRE_IN_SECONDS.INVITATION,
    });
  }
}
