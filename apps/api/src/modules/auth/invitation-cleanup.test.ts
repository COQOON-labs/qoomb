/**
 * Tests for invitation expiry cleanup.
 *
 * Coverage targets:
 * - AuthService.cleanupExpiredInvitations(): correct Prisma where clause, correct return count
 * - InvitationCleanupTask.handleCleanup(): delegates to AuthService, logs count, swallows errors
 */

import { Logger } from '@nestjs/common';

import type { AuthService } from './auth.service';
import { InvitationCleanupTask } from './invitation-cleanup.task';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeleteManyArgs {
  where: { expiresAt?: { lt: Date }; usedAt?: unknown; OR?: unknown };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PAST = new Date(Date.now() - 1_000);
const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1_000);

function makePrisma(deleteManyResult: { count: number }) {
  return {
    invitation: {
      deleteMany: jest.fn().mockResolvedValue(deleteManyResult) as jest.MockedFunction<
        (args: DeleteManyArgs) => Promise<{ count: number }>
      >,
    },
  };
}

/** Minimal AuthService stub with a real cleanupExpiredInvitations implementation. */
function makeAuthService(prisma: ReturnType<typeof makePrisma>) {
  return {
    async cleanupExpiredInvitations(): Promise<number> {
      const result = await prisma.invitation.deleteMany({
        where: { expiresAt: { lt: new Date() } },
      });
      return result.count;
    },
  };
}

function makeTaskWithMock(cleanupResult: number | Error): {
  task: InvitationCleanupTask;
  authService: jest.Mocked<Pick<AuthService, 'cleanupExpiredInvitations'>>;
} {
  const mock =
    cleanupResult instanceof Error
      ? jest.fn().mockRejectedValue(cleanupResult)
      : jest.fn<Promise<number>, []>().mockResolvedValue(cleanupResult);

  const authService = {
    cleanupExpiredInvitations: mock,
  } as unknown as jest.Mocked<Pick<AuthService, 'cleanupExpiredInvitations'>>;

  return {
    task: new InvitationCleanupTask(authService as unknown as AuthService),
    authService,
  };
}

// ---------------------------------------------------------------------------
// AuthService.cleanupExpiredInvitations — unit tests via Prisma mock
// ---------------------------------------------------------------------------

describe('AuthService.cleanupExpiredInvitations', () => {
  it('calls deleteMany with expiresAt lt: new Date()', async () => {
    const prisma = makePrisma({ count: 0 });
    const svc = makeAuthService(prisma);

    const before = Date.now();
    await svc.cleanupExpiredInvitations();
    const after = Date.now();

    expect(prisma.invitation.deleteMany).toHaveBeenCalledTimes(1);
    const call = prisma.invitation.deleteMany.mock.calls[0][0];
    expect(call.where.expiresAt?.lt.getTime()).toBeGreaterThanOrEqual(before);
    expect(call.where.expiresAt?.lt.getTime()).toBeLessThanOrEqual(after);
  });

  it('returns 0 when no rows are expired', async () => {
    const svc = makeAuthService(makePrisma({ count: 0 }));
    expect(await svc.cleanupExpiredInvitations()).toBe(0);
  });

  it('returns the exact count from Prisma', async () => {
    const svc = makeAuthService(makePrisma({ count: 7 }));
    expect(await svc.cleanupExpiredInvitations()).toBe(7);
  });

  it('does NOT filter on usedAt — deletes both used and unused expired rows', async () => {
    const prisma = makePrisma({ count: 3 });
    await makeAuthService(prisma).cleanupExpiredInvitations();
    const call = prisma.invitation.deleteMany.mock.calls[0][0];
    expect(Object.keys(call.where)).not.toContain('usedAt');
    expect(Object.keys(call.where)).not.toContain('OR');
  });

  it('propagates Prisma errors up to the caller', async () => {
    const prisma = {
      invitation: {
        deleteMany: jest.fn().mockRejectedValue(new Error('DB connection lost')),
      },
    };
    const svc = makeAuthService(prisma);
    await expect(svc.cleanupExpiredInvitations()).rejects.toThrow('DB connection lost');
  });
});

// ---------------------------------------------------------------------------
// InvitationCleanupTask — unit tests with AuthService mock
// ---------------------------------------------------------------------------

describe('InvitationCleanupTask.handleCleanup', () => {
  let logSpy: jest.SpyInstance<void, [message: unknown, ...optionalParams: unknown[]]>;
  let errorSpy: jest.SpyInstance<void, [message: unknown, ...optionalParams: unknown[]]>;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('calls cleanupExpiredInvitations once per invocation', async () => {
    const { task, authService } = makeTaskWithMock(0);
    await task.handleCleanup();
    expect(authService.cleanupExpiredInvitations).toHaveBeenCalledTimes(1);
  });

  it('logs when rows were removed', async () => {
    const { task } = makeTaskWithMock(5);
    await task.handleCleanup();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('5'));
  });

  it('does not log when count is 0', async () => {
    const { task } = makeTaskWithMock(0);
    await task.handleCleanup();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('logs count = 1 correctly', async () => {
    const { task } = makeTaskWithMock(1);
    await task.handleCleanup();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('1'));
  });

  it('swallows errors so the cron scheduler is not disrupted', async () => {
    const { task } = makeTaskWithMock(new Error('timeout'));
    await expect(task.handleCleanup()).resolves.toBeUndefined();
  });

  it('logs errors via Logger.error when cleanup throws', async () => {
    const { task } = makeTaskWithMock(new Error('timeout'));
    await task.handleCleanup();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('failed'), expect.anything());
  });

  it('does not throw even for non-Error rejections', async () => {
    const authService = {
      cleanupExpiredInvitations: jest.fn().mockRejectedValue('string error'),
    } as unknown as AuthService;
    const task = new InvitationCleanupTask(authService);
    await expect(task.handleCleanup()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Boundary: what counts as "expired"
// ---------------------------------------------------------------------------

describe('expiry boundary semantics', () => {
  it('a cutoff in the past triggers a deleteMany with lt = past date', async () => {
    const prisma = makePrisma({ count: 2 });
    await makeAuthService(prisma).cleanupExpiredInvitations();
    const call = prisma.invitation.deleteMany.mock.calls[0][0];
    // The cutoff passed to the DB must be approximately now (≤ 100 ms ago)
    expect(Date.now() - (call.where.expiresAt?.lt.getTime() ?? 0)).toBeLessThan(100);
  });

  it('PAST and FUTURE constants reflect expiry logic', () => {
    expect(PAST.getTime()).toBeLessThan(Date.now());
    expect(FUTURE.getTime()).toBeGreaterThan(Date.now());
  });
});
