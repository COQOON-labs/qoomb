/**
 * Unit tests for RefreshTokenService.
 *
 * Coverage targets:
 * - createRefreshToken: token is hashed before storage, plaintext returned only once,
 *   session eviction when MAX_SESSIONS is reached (oldest evicted, not newest)
 * - rotateRefreshToken: happy path (old revoked + replacedByToken set, new token returned),
 *   revoked token rejected, expired token rejected, non-existent token rejected
 * - revokeToken: idempotent (already-revoked token is not double-revoked)
 * - revokeAllTokensForUser: revokes all active tokens, skips already-revoked ones
 * - getActiveTokensForUser: excludes revoked + expired tokens
 * - cleanupExpiredTokens: only removes tokens expired more than 30 days ago
 */

import * as crypto from 'crypto';

import { UnauthorizedException } from '@nestjs/common';

import { RefreshTokenService } from './refresh-token.service';

// ── Prisma mock ───────────────────────────────────────────────────────────────

const mockPrisma = {
  refreshToken: {
    count: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService(): RefreshTokenService {
  return new RefreshTokenService(mockPrisma as never);
}

/** Compute the SHA-256 hex hash the service uses internally. */
function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Build a minimal fake RefreshToken DB row. */
function makeTokenRow(
  overrides: {
    id?: string;
    userId?: string;
    token?: string;
    revokedAt?: Date | null;
    expiresAt?: Date;
    replacedByToken?: string | null;
  } = {}
) {
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return {
    id: overrides.id ?? crypto.randomUUID(),
    token: overrides.token ?? sha256('some-token'),
    userId: overrides.userId ?? crypto.randomUUID(),
    revokedAt: overrides.revokedAt ?? null,
    expiresAt: overrides.expiresAt ?? future,
    replacedByToken: overrides.replacedByToken ?? null,
    ipAddress: null,
    userAgent: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: overrides.userId ?? crypto.randomUUID() },
  };
}

// ── Shared reset ──────────────────────────────────────────────────────────────

function resetMocks() {
  jest.clearAllMocks();

  // Safe defaults: no active sessions, create succeeds
  mockPrisma.refreshToken.count.mockResolvedValue(0);
  mockPrisma.refreshToken.findFirst.mockResolvedValue(null);
  mockPrisma.refreshToken.findUnique.mockResolvedValue(null);
  mockPrisma.refreshToken.findMany.mockResolvedValue([]);
  mockPrisma.refreshToken.create.mockResolvedValue(makeTokenRow());
  mockPrisma.refreshToken.update.mockResolvedValue(makeTokenRow());
  mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });
}

const USER_ID = crypto.randomUUID();

// ─────────────────────────────────────────────────────────────────────────────

describe('RefreshTokenService', () => {
  let svc: RefreshTokenService;

  beforeEach(() => {
    resetMocks();
    svc = buildService();
  });

  // ── createRefreshToken ────────────────────────────────────────────────────

  describe('createRefreshToken', () => {
    it('stores only the SHA-256 hash — never the plaintext token', async () => {
      const row = makeTokenRow({ userId: USER_ID });
      mockPrisma.refreshToken.create.mockResolvedValue(row);

      const { token } = await svc.createRefreshToken(USER_ID);

      const createCall = mockPrisma.refreshToken.create.mock.calls[0][0];
      const storedHash: string = createCall.data.token;

      // The stored value must be the SHA-256 hash of the plaintext
      expect(storedHash).toBe(sha256(token));
      // The stored value must NOT be the plaintext itself
      expect(storedHash).not.toBe(token);
    });

    it('returns the plaintext token, its id and expiry', async () => {
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const row = makeTokenRow({ userId: USER_ID, expiresAt: future });
      mockPrisma.refreshToken.create.mockResolvedValue(row);

      const result = await svc.createRefreshToken(USER_ID);

      expect(result.token).toBeDefined();
      expect(typeof result.token).toBe('string');
      expect(result.id).toBe(row.id);
      expect(result.expiresAt).toEqual(row.expiresAt);
    });

    it('evicts the oldest active session when MAX_SESSIONS (5) is reached', async () => {
      const oldestId = crypto.randomUUID();
      mockPrisma.refreshToken.count.mockResolvedValue(5); // at the limit
      mockPrisma.refreshToken.findFirst.mockResolvedValue({ id: oldestId });
      mockPrisma.refreshToken.create.mockResolvedValue(makeTokenRow({ userId: USER_ID }));

      await svc.createRefreshToken(USER_ID);

      // Should have revoked the oldest session
      expect(mockPrisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: oldestId },
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        })
      );
    });

    it('does NOT evict a session when under MAX_SESSIONS limit', async () => {
      mockPrisma.refreshToken.count.mockResolvedValue(4); // under the limit
      mockPrisma.refreshToken.create.mockResolvedValue(makeTokenRow({ userId: USER_ID }));

      await svc.createRefreshToken(USER_ID);

      // findFirst should not have been called (no eviction needed)
      expect(mockPrisma.refreshToken.findFirst).not.toHaveBeenCalled();
    });

    it('sets expiry 7 days in the future', async () => {
      mockPrisma.refreshToken.create.mockResolvedValue(makeTokenRow({ userId: USER_ID }));

      const before = new Date();
      await svc.createRefreshToken(USER_ID);
      const after = new Date();

      const createCall = mockPrisma.refreshToken.create.mock.calls[0][0];
      const storedExpiry: Date = createCall.data.expiresAt;

      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      expect(storedExpiry.getTime()).toBeGreaterThanOrEqual(before.getTime() + sevenDaysMs - 1000);
      expect(storedExpiry.getTime()).toBeLessThanOrEqual(after.getTime() + sevenDaysMs + 1000);
    });
  });

  // ── rotateRefreshToken ────────────────────────────────────────────────────

  describe('rotateRefreshToken', () => {
    it('returns a new token and marks the old one as revoked with replacedByToken', async () => {
      const plaintextOld = 'old-plaintext-token';
      const existingRow = makeTokenRow({ userId: USER_ID, token: sha256(plaintextOld) });
      mockPrisma.refreshToken.findUnique.mockResolvedValue(existingRow);

      const newRow = makeTokenRow({ userId: USER_ID });
      mockPrisma.refreshToken.create.mockResolvedValue(newRow);

      const result = await svc.rotateRefreshToken(plaintextOld);

      // Returns the new plaintext token + user id
      expect(result.userId).toBe(USER_ID);
      expect(result.newToken).toBeDefined();
      expect(result.newToken).not.toBe(plaintextOld);

      // Old token must be revoked and linked to the new hash
      const updateCall = mockPrisma.refreshToken.update.mock.calls.find(
        (c) => c[0].where?.id === existingRow.id
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![0].data.revokedAt).toBeInstanceOf(Date);
      expect(updateCall![0].data.replacedByToken).toBe(sha256(result.newToken));
    });

    it('rejects a token that does not exist', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(svc.rotateRefreshToken('ghost-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a revoked token', async () => {
      const plaintext = 'revoked-token';
      mockPrisma.refreshToken.findUnique.mockResolvedValue(
        makeTokenRow({ token: sha256(plaintext), revokedAt: new Date(Date.now() - 1000) })
      );

      await expect(svc.rotateRefreshToken(plaintext)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects an expired token', async () => {
      const plaintext = 'expired-token';
      mockPrisma.refreshToken.findUnique.mockResolvedValue(
        makeTokenRow({
          token: sha256(plaintext),
          revokedAt: null,
          expiresAt: new Date(Date.now() - 1000), // in the past
        })
      );

      await expect(svc.rotateRefreshToken(plaintext)).rejects.toThrow(UnauthorizedException);
    });

    it('looks up the token by its SHA-256 hash, not the plaintext', async () => {
      const plaintext = 'my-plaintext';
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null); // not found → throw

      await expect(svc.rotateRefreshToken(plaintext)).rejects.toThrow(UnauthorizedException);

      const lookupArg = mockPrisma.refreshToken.findUnique.mock.calls[0][0];
      expect(lookupArg.where.token).toBe(sha256(plaintext));
      expect(lookupArg.where.token).not.toBe(plaintext);
    });
  });

  // ── revokeToken ───────────────────────────────────────────────────────────

  describe('revokeToken', () => {
    it('sets revokedAt on the matching token', async () => {
      const plaintext = 'some-token';

      await svc.revokeToken(plaintext);

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ token: sha256(plaintext) }),
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        })
      );
    });

    it('is idempotent — uses revokedAt: null filter so already-revoked tokens are not touched', async () => {
      const plaintext = 'already-revoked';

      await svc.revokeToken(plaintext);

      const updateCall = mockPrisma.refreshToken.updateMany.mock.calls[0][0];
      // The WHERE clause must include revokedAt: null so a second call is a no-op
      expect(updateCall.where.revokedAt).toBeNull();
    });
  });

  // ── revokeAllTokensForUser ────────────────────────────────────────────────

  describe('revokeAllTokensForUser', () => {
    it('revokes all active tokens for the user', async () => {
      mockPrisma.refreshToken.updateMany.mockResolvedValue({ count: 3 });

      await svc.revokeAllTokensForUser(USER_ID);

      expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: USER_ID,
            revokedAt: null,
          }),
          data: expect.objectContaining({ revokedAt: expect.any(Date) }),
        })
      );
    });

    it('does not touch already-revoked tokens (revokedAt: null filter)', async () => {
      await svc.revokeAllTokensForUser(USER_ID);

      const updateCall = mockPrisma.refreshToken.updateMany.mock.calls[0][0];
      expect(updateCall.where.revokedAt).toBeNull();
    });
  });

  // ── getActiveTokensForUser ────────────────────────────────────────────────

  describe('getActiveTokensForUser', () => {
    it('queries only non-revoked, non-expired tokens', () => {
      svc.getActiveTokensForUser(USER_ID);

      const query = mockPrisma.refreshToken.findMany.mock.calls[0][0];
      expect(query.where.userId).toBe(USER_ID);
      expect(query.where.revokedAt).toBeNull();
      expect(query.where.expiresAt.gt).toBeInstanceOf(Date);
    });

    it('returns tokens ordered by createdAt descending (newest first)', () => {
      svc.getActiveTokensForUser(USER_ID);

      const query = mockPrisma.refreshToken.findMany.mock.calls[0][0];
      expect(query.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('does not expose the token hash — only metadata fields', () => {
      svc.getActiveTokensForUser(USER_ID);

      const query = mockPrisma.refreshToken.findMany.mock.calls[0][0];
      expect(query.select.token).toBeUndefined();
      expect(query.select.id).toBe(true);
      expect(query.select.ipAddress).toBe(true);
    });
  });

  // ── cleanupExpiredTokens ──────────────────────────────────────────────────

  describe('cleanupExpiredTokens', () => {
    it('returns the number of deleted tokens', async () => {
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 7 });

      const count = await svc.cleanupExpiredTokens();

      expect(count).toBe(7);
    });

    it('only deletes tokens expired MORE than 30 days ago', async () => {
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      const before = new Date();
      await svc.cleanupExpiredTokens();
      const after = new Date();

      const deleteCall = mockPrisma.refreshToken.deleteMany.mock.calls[0][0];
      const cutoff: Date = deleteCall.where.expiresAt.lt;

      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      // cutoff should be ~30 days ago
      expect(cutoff.getTime()).toBeLessThanOrEqual(before.getTime() - thirtyDaysMs + 1000);
      expect(cutoff.getTime()).toBeGreaterThanOrEqual(after.getTime() - thirtyDaysMs - 1000);
    });

    it('returns 0 when there is nothing to clean up', async () => {
      mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 0 });

      const count = await svc.cleanupExpiredTokens();

      expect(count).toBe(0);
    });
  });
});
