/**
 * Unit tests for GroupsService.
 *
 * Coverage targets:
 * - list:         hiveId filter, memberCount from _count.members, orderBy createdAt asc
 * - getById:      id+hiveId filter (cross-tenant defense), null when absent, member mapping
 * - create:       hiveId stored, memberCount hardcoded to 0, returns plaintext name directly
 * - update:       sparse patch (name !== undefined; 'description' in data for nullable clear),
 *                 where: { id } only (RLS + router permission guard cover multi-tenant here)
 * - remove:       deleteMany id+hiveId — true/false
 * - addMember:    all four fields stored, returns 3-field object (audit: addedByPersonId)
 * - removeMember: deleteMany groupId+personId+hiveId — true/false
 *
 * Encryption helpers (encStr/decStr) are tested via identity mocks — the round-trip
 * is transparent so we can focus on business logic and field contracts.
 */

import * as crypto from 'crypto';

import { GroupsService } from './groups.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  hiveGroup: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
  hiveGroupMember: {
    create: jest.fn(),
    deleteMany: jest.fn(),
  },
};

/**
 * Identity EncryptionService — GroupsService calls:
 *   encStr:  enc.serializeToStorage(enc.encrypt(value, hiveId))
 *   decStr:  enc.decrypt(enc.parseFromStorage(value), hiveId)
 *
 * Identity mocks make both round-trips transparent (value → value).
 */
const mockEnc = {
  encrypt: jest.fn((value: string, _hiveId: string) => ({ _data: value })),
  serializeToStorage: jest.fn((v: { _data: string }) => v._data),
  parseFromStorage: jest.fn((v: string) => ({ _data: v })),
  decrypt: jest.fn((v: { _data: string }, _hiveId: string) => v._data),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService(): GroupsService {
  return new GroupsService(mockPrisma as never, mockEnc as never);
}

const HIVE_ID = crypto.randomUUID();
const GROUP_ID = crypto.randomUUID();
const PERSON_ID = crypto.randomUUID();
const ADMIN_ID = crypto.randomUUID();
const now = new Date();

function makeGroupRow(
  overrides: Partial<{
    id: string;
    hiveId: string;
    name: string;
    description: string | null;
    createdAt: Date;
    _count: { members: number };
  }> = {}
) {
  return {
    id: overrides.id ?? GROUP_ID,
    hiveId: overrides.hiveId ?? HIVE_ID,
    name: overrides.name ?? 'Eltern',
    description: overrides.description ?? null,
    createdAt: overrides.createdAt ?? now,
    _count: overrides._count ?? { members: 3 },
  };
}

function makeMemberRow(
  overrides: Partial<{
    id: string;
    personId: string;
    joinedAt: Date;
    person: { id: string; displayName: string | null };
  }> = {}
) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    personId: overrides.personId ?? PERSON_ID,
    joinedAt: overrides.joinedAt ?? now,
    person: overrides.person ?? { id: PERSON_ID, displayName: 'Alice' },
  };
}

// ── Reset ─────────────────────────────────────────────────────────────────────

function resetMocks() {
  jest.clearAllMocks();

  mockPrisma.hiveGroup.findMany.mockResolvedValue([]);
  mockPrisma.hiveGroup.findFirst.mockResolvedValue(null);
  mockPrisma.hiveGroup.create.mockResolvedValue(makeGroupRow());
  mockPrisma.hiveGroup.update.mockResolvedValue(makeGroupRow());
  mockPrisma.hiveGroup.deleteMany.mockResolvedValue({ count: 1 });
  mockPrisma.hiveGroupMember.create.mockResolvedValue({
    id: crypto.randomUUID(),
    personId: PERSON_ID,
    joinedAt: now,
  });
  mockPrisma.hiveGroupMember.deleteMany.mockResolvedValue({ count: 1 });

  mockEnc.encrypt.mockImplementation((value: string, _hiveId: string) => ({ _data: value }));
  mockEnc.serializeToStorage.mockImplementation((v: { _data: string }) => v._data);
  mockEnc.parseFromStorage.mockImplementation((v: string) => ({ _data: v }));
  mockEnc.decrypt.mockImplementation((v: { _data: string }, _hiveId: string) => v._data);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('GroupsService', () => {
  let svc: GroupsService;

  beforeEach(() => {
    resetMocks();
    svc = buildService();
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('filters by hiveId', async () => {
      await svc.list(HIVE_ID);

      expect(mockPrisma.hiveGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { hiveId: HIVE_ID } })
      );
    });

    it('orders groups by createdAt ascending', async () => {
      await svc.list(HIVE_ID);

      const query = mockPrisma.hiveGroup.findMany.mock.calls[0][0];
      expect(query.orderBy).toEqual({ createdAt: 'asc' });
    });

    it('includes member count via _count', async () => {
      await svc.list(HIVE_ID);

      const query = mockPrisma.hiveGroup.findMany.mock.calls[0][0];
      expect(query.include._count.select.members).toBe(true);
    });

    it('maps memberCount from _count.members', async () => {
      mockPrisma.hiveGroup.findMany.mockResolvedValue([makeGroupRow({ _count: { members: 7 } })]);

      const result = await svc.list(HIVE_ID);

      expect(result[0].memberCount).toBe(7);
    });

    it('returns decrypted name and description', async () => {
      mockPrisma.hiveGroup.findMany.mockResolvedValue([
        makeGroupRow({ name: 'Eltern', description: 'Elternbeirat' }),
      ]);

      const result = await svc.list(HIVE_ID);

      // Identity mock: decrypt is a no-op, so values come through unchanged
      expect(result[0].name).toBe('Eltern');
      expect(result[0].description).toBe('Elternbeirat');
    });

    it('returns null description when DB value is null', async () => {
      mockPrisma.hiveGroup.findMany.mockResolvedValue([makeGroupRow({ description: null })]);

      const result = await svc.list(HIVE_ID);

      expect(result[0].description).toBeNull();
    });
  });

  // ── getById ───────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('filters by BOTH id and hiveId (cross-tenant defense)', async () => {
      mockPrisma.hiveGroup.findFirst.mockResolvedValue({
        ...makeGroupRow(),
        members: [],
      });

      await svc.getById(GROUP_ID, HIVE_ID);

      const query = mockPrisma.hiveGroup.findFirst.mock.calls[0][0];
      expect(query.where.id).toBe(GROUP_ID);
      expect(query.where.hiveId).toBe(HIVE_ID);
    });

    it('returns null when group not found', async () => {
      mockPrisma.hiveGroup.findFirst.mockResolvedValue(null);

      const result = await svc.getById(GROUP_ID, HIVE_ID);

      expect(result).toBeNull();
    });

    it('maps member list including decrypted displayName', async () => {
      const member = makeMemberRow({ person: { id: PERSON_ID, displayName: 'Alice' } });
      mockPrisma.hiveGroup.findFirst.mockResolvedValue({ ...makeGroupRow(), members: [member] });

      const result = await svc.getById(GROUP_ID, HIVE_ID);

      expect(result!.members).toHaveLength(1);
      expect(result!.members[0].personId).toBe(PERSON_ID);
      expect(result!.members[0].displayName).toBe('Alice');
    });

    it('maps null displayName when person has no display name', async () => {
      const member = makeMemberRow({ person: { id: PERSON_ID, displayName: null } });
      mockPrisma.hiveGroup.findFirst.mockResolvedValue({ ...makeGroupRow(), members: [member] });

      const result = await svc.getById(GROUP_ID, HIVE_ID);

      expect(result!.members[0].displayName).toBeNull();
    });

    it('returns empty members array when group has no members', async () => {
      mockPrisma.hiveGroup.findFirst.mockResolvedValue({ ...makeGroupRow(), members: [] });

      const result = await svc.getById(GROUP_ID, HIVE_ID);

      expect(result!.members).toEqual([]);
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('stores hiveId in the DB record', async () => {
      await svc.create(HIVE_ID, { name: 'Eltern' });

      const createCall = mockPrisma.hiveGroup.create.mock.calls[0][0];
      expect(createCall.data.hiveId).toBe(HIVE_ID);
    });

    it('stores the encrypted name', async () => {
      await svc.create(HIVE_ID, { name: 'Eltern' });

      // After identity encryption: encStr('Eltern') → 'Eltern'
      const createCall = mockPrisma.hiveGroup.create.mock.calls[0][0];
      expect(createCall.data.name).toBe('Eltern');
      // encrypt must have been called with the plaintext name
      expect(mockEnc.encrypt).toHaveBeenCalledWith('Eltern', HIVE_ID);
    });

    it('stores null for description when not provided', async () => {
      await svc.create(HIVE_ID, { name: 'Eltern' });

      const createCall = mockPrisma.hiveGroup.create.mock.calls[0][0];
      expect(createCall.data.description).toBeNull();
    });

    it('returns memberCount of 0 without a DB round-trip count', async () => {
      const result = await svc.create(HIVE_ID, { name: 'Eltern' });

      // memberCount is hardcoded to 0 on creation — no separate count query
      expect(result.memberCount).toBe(0);
      expect(mockPrisma.hiveGroup.findMany).not.toHaveBeenCalled();
    });

    it('returns the plaintext name directly (not re-decrypted from DB)', async () => {
      const result = await svc.create(HIVE_ID, { name: 'Eltern' });

      // Service returns data.name, not decStr(row.name) — plaintext already available
      expect(result.name).toBe('Eltern');
      expect(mockEnc.decrypt).not.toHaveBeenCalled();
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('patches name when provided', async () => {
      await svc.update(GROUP_ID, HIVE_ID, { name: 'Großeltern' });

      const patch = mockPrisma.hiveGroup.update.mock.calls[0][0].data;
      expect(patch.name).toBe('Großeltern');
    });

    it('skips name when not provided (sparse patch)', async () => {
      await svc.update(GROUP_ID, HIVE_ID, { description: null });

      const patch = mockPrisma.hiveGroup.update.mock.calls[0][0].data;
      expect('name' in patch).toBe(false);
    });

    it('clears description to null when explicitly set to null', async () => {
      await svc.update(GROUP_ID, HIVE_ID, { description: null });

      const patch = mockPrisma.hiveGroup.update.mock.calls[0][0].data;
      expect(patch.description).toBeNull();
    });

    it('skips description when absent from the update object', async () => {
      await svc.update(GROUP_ID, HIVE_ID, { name: 'X' });

      const patch = mockPrisma.hiveGroup.update.mock.calls[0][0].data;
      expect('description' in patch).toBe(false);
    });

    it('uses where: { id } (trusts RLS + router permission check for multi-tenant isolation)', async () => {
      // Note: unlike EventsService.update (updateMany with hiveId), GroupsService.update
      // uses Prisma update() with only { id }. Multi-tenant protection comes from RLS
      // and the router's requirePermission guard. This test documents the contract.
      await svc.update(GROUP_ID, HIVE_ID, { name: 'X' });

      const whereClause = mockPrisma.hiveGroup.update.mock.calls[0][0].where;
      expect(whereClause).toEqual({ id: GROUP_ID });
    });

    it('returns the updated group with decrypted fields', async () => {
      mockPrisma.hiveGroup.update.mockResolvedValue(
        makeGroupRow({ name: 'Geschwister', description: null, _count: { members: 2 } })
      );

      const result = await svc.update(GROUP_ID, HIVE_ID, { name: 'Geschwister' });

      expect(result.name).toBe('Geschwister');
      expect(result.memberCount).toBe(2);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('uses deleteMany with id+hiveId filter (cross-tenant defense)', async () => {
      await svc.remove(GROUP_ID, HIVE_ID);

      const deleteCall = mockPrisma.hiveGroup.deleteMany.mock.calls[0][0];
      expect(deleteCall.where.id).toBe(GROUP_ID);
      expect(deleteCall.where.hiveId).toBe(HIVE_ID);
    });

    it('returns true when the group was deleted', async () => {
      mockPrisma.hiveGroup.deleteMany.mockResolvedValue({ count: 1 });

      expect(await svc.remove(GROUP_ID, HIVE_ID)).toBe(true);
    });

    it('returns false when group not found', async () => {
      mockPrisma.hiveGroup.deleteMany.mockResolvedValue({ count: 0 });

      expect(await svc.remove(GROUP_ID, HIVE_ID)).toBe(false);
    });
  });

  // ── addMember ─────────────────────────────────────────────────────────────

  describe('addMember', () => {
    it('stores all four fields: hiveId, groupId, personId, addedByPersonId (audit)', async () => {
      await svc.addMember(GROUP_ID, PERSON_ID, HIVE_ID, ADMIN_ID);

      const createCall = mockPrisma.hiveGroupMember.create.mock.calls[0][0];
      expect(createCall.data.hiveId).toBe(HIVE_ID);
      expect(createCall.data.groupId).toBe(GROUP_ID);
      expect(createCall.data.personId).toBe(PERSON_ID);
      expect(createCall.data.addedByPersonId).toBe(ADMIN_ID);
    });

    it('returns id, personId, and joinedAt (not the full membership row)', async () => {
      const membershipId = crypto.randomUUID();
      mockPrisma.hiveGroupMember.create.mockResolvedValue({
        id: membershipId,
        personId: PERSON_ID,
        joinedAt: now,
      });

      const result = await svc.addMember(GROUP_ID, PERSON_ID, HIVE_ID, ADMIN_ID);

      expect(result).toEqual({ id: membershipId, personId: PERSON_ID, joinedAt: now });
      // hiveId and addedByPersonId are not exposed in the return value
      expect(Object.keys(result)).toEqual(['id', 'personId', 'joinedAt']);
    });
  });

  // ── removeMember ──────────────────────────────────────────────────────────

  describe('removeMember', () => {
    it('filters on groupId, personId, AND hiveId to prevent cross-group removal', async () => {
      await svc.removeMember(GROUP_ID, PERSON_ID, HIVE_ID);

      const deleteCall = mockPrisma.hiveGroupMember.deleteMany.mock.calls[0][0];
      expect(deleteCall.where.groupId).toBe(GROUP_ID);
      expect(deleteCall.where.personId).toBe(PERSON_ID);
      expect(deleteCall.where.hiveId).toBe(HIVE_ID);
    });

    it('returns true when the membership was removed', async () => {
      mockPrisma.hiveGroupMember.deleteMany.mockResolvedValue({ count: 1 });

      expect(await svc.removeMember(GROUP_ID, PERSON_ID, HIVE_ID)).toBe(true);
    });

    it('returns false when membership not found', async () => {
      mockPrisma.hiveGroupMember.deleteMany.mockResolvedValue({ count: 0 });

      expect(await svc.removeMember(GROUP_ID, PERSON_ID, HIVE_ID)).toBe(false);
    });
  });
});
