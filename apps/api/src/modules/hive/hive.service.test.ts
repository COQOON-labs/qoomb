/**
 * Unit tests for HiveService.
 *
 * Coverage targets:
 * - getById:  findUnique by hiveId, returns null when not found
 * - update:   sparse patch (name !== undefined; 'locale' in data for nullable clear;
 *             settings !== undefined), where: { id: hiveId }
 * - remove:   delete by id, returns true on success, false on P2025 (not found),
 *             rethrows unexpected errors
 *
 * @EncryptDecryptFields / @DecryptFields decorators are integration-tested separately.
 * Identity mocks keep the business-logic assertions noise-free.
 */

import * as crypto from 'crypto';

import { Prisma } from '@prisma/client';

import { HiveService, type UpdateHiveData } from './hive.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  hive: {
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

/** Identity EncryptionService — used by @EncryptDecryptFields / @DecryptFields decorators. */
const mockEnc = {
  encrypt: jest.fn((value: string) => ({ _data: value })),
  serializeToStorage: jest.fn((v: { _data: string }) => v._data),
  decrypt: jest.fn((value: string) => value),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService(): HiveService {
  return new HiveService(mockPrisma as never, mockEnc as never);
}

const HIVE_ID = crypto.randomUUID();

function makeHiveRow(
  overrides: Partial<{
    id: string;
    name: string;
    locale: string | null;
    settings: Record<string, unknown>;
  }> = {}
) {
  return {
    id: overrides.id ?? HIVE_ID,
    name: overrides.name ?? 'Müller Familie',
    locale: overrides.locale ?? 'de',
    settings: overrides.settings ?? {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makePrismaP2025(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Record to delete does not exist.', {
    code: 'P2025',
    clientVersion: '6.0.0',
  });
}

// ── Reset ─────────────────────────────────────────────────────────────────────

function resetMocks() {
  jest.clearAllMocks();

  mockPrisma.hive.findUnique.mockResolvedValue(makeHiveRow());
  mockPrisma.hive.update.mockResolvedValue(makeHiveRow());
  mockPrisma.hive.delete.mockResolvedValue(makeHiveRow());

  mockEnc.encrypt.mockImplementation((value: string) => ({ _data: value }));
  mockEnc.serializeToStorage.mockImplementation((v: { _data: string }) => v._data);
  mockEnc.decrypt.mockImplementation((value: string) => value);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('HiveService', () => {
  let svc: HiveService;

  beforeEach(() => {
    resetMocks();
    svc = buildService();
  });

  // ── getById ───────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('queries by the hiveId as unique key', async () => {
      await svc.getById(HIVE_ID);

      expect(mockPrisma.hive.findUnique).toHaveBeenCalledWith({ where: { id: HIVE_ID } });
    });

    it('returns null when hive does not exist', async () => {
      mockPrisma.hive.findUnique.mockResolvedValue(null);

      const result = await svc.getById(HIVE_ID);

      expect(result).toBeNull();
    });

    it('returns the hive row when found', async () => {
      mockPrisma.hive.findUnique.mockResolvedValue(makeHiveRow({ name: 'Müller Familie' }));

      const result = await svc.getById(HIVE_ID);

      expect(result).not.toBeNull();
      expect(result!.name).toBe('Müller Familie');
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates where: { id: hiveId }', async () => {
      await svc.update({ name: 'Neue Familie' }, HIVE_ID);

      const call = mockPrisma.hive.update.mock.calls[0][0];
      expect(call.where).toEqual({ id: HIVE_ID });
    });

    it('patches name when provided', async () => {
      await svc.update({ name: 'Neue Familie' }, HIVE_ID);

      const patch = mockPrisma.hive.update.mock.calls[0][0].data;
      expect(patch.name).toBe('Neue Familie');
    });

    it('skips name when not provided (sparse patch)', async () => {
      await svc.update({ settings: {} }, HIVE_ID);

      const patch = mockPrisma.hive.update.mock.calls[0][0].data;
      expect('name' in patch).toBe(false);
    });

    it('clears locale to null when explicitly set to null', async () => {
      const data: UpdateHiveData = { locale: null };
      await svc.update(data, HIVE_ID);

      const patch = mockPrisma.hive.update.mock.calls[0][0].data;
      expect(patch.locale).toBeNull();
    });

    it('skips locale when absent from the update object', async () => {
      await svc.update({ name: 'X' }, HIVE_ID);

      const patch = mockPrisma.hive.update.mock.calls[0][0].data;
      expect('locale' in patch).toBe(false);
    });

    it('patches settings when provided', async () => {
      const newSettings = { theme: 'dark', notifications: true };
      await svc.update({ settings: newSettings }, HIVE_ID);

      const patch = mockPrisma.hive.update.mock.calls[0][0].data;
      expect(patch.settings).toEqual(newSettings);
    });

    it('skips settings when not provided', async () => {
      await svc.update({ name: 'X' }, HIVE_ID);

      const patch = mockPrisma.hive.update.mock.calls[0][0].data;
      expect('settings' in patch).toBe(false);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('calls delete with the hiveId', async () => {
      await svc.remove(HIVE_ID);

      expect(mockPrisma.hive.delete).toHaveBeenCalledWith({ where: { id: HIVE_ID } });
    });

    it('returns true when the hive was successfully deleted', async () => {
      mockPrisma.hive.delete.mockResolvedValue(makeHiveRow());

      expect(await svc.remove(HIVE_ID)).toBe(true);
    });

    it('returns false when hive not found (Prisma P2025)', async () => {
      mockPrisma.hive.delete.mockRejectedValue(makePrismaP2025());

      expect(await svc.remove(HIVE_ID)).toBe(false);
    });

    it('rethrows unexpected DB errors (not P2025)', async () => {
      const dbError = new Error('Connection refused');
      mockPrisma.hive.delete.mockRejectedValue(dbError);

      await expect(svc.remove(HIVE_ID)).rejects.toThrow('Connection refused');
    });

    it('rethrows Prisma errors with codes other than P2025', async () => {
      const otherPrismaError = new Prisma.PrismaClientKnownRequestError(
        'Foreign key constraint failed',
        { code: 'P2003', clientVersion: '6.0.0' }
      );
      mockPrisma.hive.delete.mockRejectedValue(otherPrismaError);

      await expect(svc.remove(HIVE_ID)).rejects.toBeInstanceOf(
        Prisma.PrismaClientKnownRequestError
      );
    });
  });
});
