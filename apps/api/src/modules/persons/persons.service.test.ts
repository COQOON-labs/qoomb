/**
 * Unit tests for PersonsService.
 *
 * Coverage targets:
 * - list: hiveId filter, select fields (no birthdate/userId), order by createdAt asc
 * - getById: id+hiveId filter (cross-tenant defense), null when not found
 * - updateProfile: updateMany with id+hiveId filter, throws when not found,
 *                  sparse update (only defined fields sent to DB),
 *                  returns updated record via findFirstOrThrow
 * - updateRole: updateMany with id+hiveId filter, throws when not found
 * - remove: returns true/false based on deleteMany count, id+hiveId filter
 * - notifyAdmins: role filter uses isAdminRole (Q-003), Promise.allSettled
 *                 (fire-and-forget — never throws), no-op when no admins
 *
 * Encryption decorators (@EncryptFields / @DecryptFields) are tested separately
 * in encrypt-fields.decorator.test.ts. Here the mockEnc uses identity transforms
 * so we can focus purely on the business logic and query contracts.
 */

import * as crypto from 'crypto';

import { PersonsService } from './persons.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  person: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findFirstOrThrow: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

/**
 * Identity EncryptionService mock.
 * The @EncryptFields / @DecryptFields decorators call these methods —
 * identity transforms let us test pure service logic without encryption noise.
 */
const mockEnc = {
  encrypt: jest.fn((value: string) => ({ _data: value })),
  serializeToStorage: jest.fn((v: { _data: string }) => v._data),
  decrypt: jest.fn((value: string) => value),
  encryptForUser: jest.fn((value: string) => value),
  decryptForUser: jest.fn((value: string) => value),
};

const mockNotifications = {
  create: jest.fn(),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService(): PersonsService {
  return new PersonsService(mockPrisma as never, mockEnc as never, mockNotifications as never);
}

function makePersonRow(
  overrides: Partial<{
    id: string;
    hiveId: string;
    role: string;
    displayName: string | null;
    avatarUrl: string | null;
    birthdate: string | null;
    userId: string | null;
    createdAt: Date;
  }> = {}
) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    hiveId: overrides.hiveId ?? HIVE_ID,
    role: overrides.role ?? 'member',
    displayName: overrides.displayName ?? 'Alice',
    avatarUrl: overrides.avatarUrl ?? null,
    birthdate: overrides.birthdate ?? null,
    userId: overrides.userId ?? crypto.randomUUID(),
    createdAt: overrides.createdAt ?? new Date(),
    updatedAt: new Date(),
  };
}

// ── Reset ─────────────────────────────────────────────────────────────────────

function resetMocks() {
  jest.clearAllMocks();

  mockPrisma.person.findMany.mockResolvedValue([]);
  mockPrisma.person.findFirst.mockResolvedValue(null);
  mockPrisma.person.findFirstOrThrow.mockResolvedValue(makePersonRow());
  mockPrisma.person.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.person.deleteMany.mockResolvedValue({ count: 1 });

  mockNotifications.create.mockResolvedValue(undefined);

  mockEnc.encrypt.mockImplementation((value: string) => ({ _data: value }));
  mockEnc.serializeToStorage.mockImplementation((v: { _data: string }) => v._data);
  mockEnc.decrypt.mockImplementation((value: string) => value);
}

const HIVE_ID = crypto.randomUUID();
const PERSON_ID = crypto.randomUUID();

// ─────────────────────────────────────────────────────────────────────────────

describe('PersonsService', () => {
  let svc: PersonsService;

  beforeEach(() => {
    resetMocks();
    svc = buildService();
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('filters by hiveId', async () => {
      await svc.list(HIVE_ID);

      const query = mockPrisma.person.findMany.mock.calls[0][0];
      expect(query.where.hiveId).toBe(HIVE_ID);
    });

    it('orders results by createdAt ascending', async () => {
      await svc.list(HIVE_ID);

      const query = mockPrisma.person.findMany.mock.calls[0][0];
      expect(query.orderBy).toEqual({ createdAt: 'asc' });
    });

    it('selects id, role, displayName, avatarUrl, createdAt — but NOT birthdate or userId', async () => {
      await svc.list(HIVE_ID);

      const query = mockPrisma.person.findMany.mock.calls[0][0];
      expect(query.select.id).toBe(true);
      expect(query.select.role).toBe(true);
      expect(query.select.displayName).toBe(true);
      expect(query.select.avatarUrl).toBe(true);
      expect(query.select.createdAt).toBe(true);
      // Sensitive fields must NOT be in the list view
      expect(query.select.birthdate).toBeUndefined();
      expect(query.select.userId).toBeUndefined();
    });

    it('returns an empty array when no persons exist', async () => {
      mockPrisma.person.findMany.mockResolvedValue([]);

      const result = await svc.list(HIVE_ID);

      expect(result).toEqual([]);
    });
  });

  // ── getById ───────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('filters by BOTH id and hiveId (cross-tenant defense)', async () => {
      await svc.getById(PERSON_ID, HIVE_ID);

      const query = mockPrisma.person.findFirst.mock.calls[0][0];
      expect(query.where.id).toBe(PERSON_ID);
      expect(query.where.hiveId).toBe(HIVE_ID);
    });

    it('returns null when person does not exist', async () => {
      mockPrisma.person.findFirst.mockResolvedValue(null);

      const result = await svc.getById(PERSON_ID, HIVE_ID);

      expect(result).toBeNull();
    });

    it('returns null for a valid person in a DIFFERENT hive (cross-tenant isolation)', async () => {
      // Prisma + RLS returns null when the hiveId filter does not match
      mockPrisma.person.findFirst.mockResolvedValue(null);

      const result = await svc.getById(PERSON_ID, crypto.randomUUID());

      expect(result).toBeNull();
    });

    it('includes birthdate and userId in select (detail view)', async () => {
      await svc.getById(PERSON_ID, HIVE_ID);

      const query = mockPrisma.person.findFirst.mock.calls[0][0];
      expect(query.select.birthdate).toBe(true);
      expect(query.select.userId).toBe(true);
    });
  });

  // ── updateProfile ─────────────────────────────────────────────────────────

  describe('updateProfile', () => {
    it('uses updateMany with id+hiveId filter (cross-tenant defense)', async () => {
      await svc.updateProfile(PERSON_ID, HIVE_ID, { displayName: 'Bob' });

      const updateCall = mockPrisma.person.updateMany.mock.calls[0][0];
      expect(updateCall.where.id).toBe(PERSON_ID);
      expect(updateCall.where.hiveId).toBe(HIVE_ID);
    });

    it('throws when person not found in this hive', async () => {
      mockPrisma.person.updateMany.mockResolvedValue({ count: 0 });

      await expect(svc.updateProfile(PERSON_ID, HIVE_ID, { displayName: 'Bob' })).rejects.toThrow(
        'Person not found in this hive'
      );
    });

    it('returns the updated person via findFirstOrThrow', async () => {
      const updatedRow = makePersonRow({ id: PERSON_ID, displayName: 'Bob' });
      mockPrisma.person.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.person.findFirstOrThrow.mockResolvedValue(updatedRow);

      const result = await svc.updateProfile(PERSON_ID, HIVE_ID, { displayName: 'Bob' });

      expect(mockPrisma.person.findFirstOrThrow).toHaveBeenCalled();
      expect(result.displayName).toBe('Bob');
    });

    it('only includes defined fields in the DB update (sparse update)', async () => {
      // Only displayName provided — avatarUrl and birthdate must NOT appear in data
      await svc.updateProfile(PERSON_ID, HIVE_ID, { displayName: 'NewName' });

      const updateCall = mockPrisma.person.updateMany.mock.calls[0][0];
      expect(Object.keys(updateCall.data)).toContain('displayName');
      expect(Object.keys(updateCall.data)).not.toContain('avatarUrl');
      expect(Object.keys(updateCall.data)).not.toContain('birthdate');
    });

    it('does not include role in the updatable fields (role changes via updateRole only)', async () => {
      // Even if someone passes a role-like object, the service only touches
      // displayName, avatarUrl, birthdate
      await svc.updateProfile(PERSON_ID, HIVE_ID, {
        displayName: 'Alice',
        avatarUrl: 'https://example.com/avatar.png',
      });

      const updateCall = mockPrisma.person.updateMany.mock.calls[0][0];
      expect(Object.keys(updateCall.data)).not.toContain('role');
    });
  });

  // ── updateRole ────────────────────────────────────────────────────────────

  describe('updateRole', () => {
    it('uses updateMany with id+hiveId filter (cross-tenant defense)', async () => {
      await svc.updateRole(PERSON_ID, HIVE_ID, 'parent');

      const updateCall = mockPrisma.person.updateMany.mock.calls[0][0];
      expect(updateCall.where.id).toBe(PERSON_ID);
      expect(updateCall.where.hiveId).toBe(HIVE_ID);
    });

    it('sets the new role in data', async () => {
      await svc.updateRole(PERSON_ID, HIVE_ID, 'org_admin');

      const updateCall = mockPrisma.person.updateMany.mock.calls[0][0];
      expect(updateCall.data.role).toBe('org_admin');
    });

    it('throws when person not found in this hive', async () => {
      mockPrisma.person.updateMany.mockResolvedValue({ count: 0 });

      await expect(svc.updateRole(PERSON_ID, HIVE_ID, 'child')).rejects.toThrow(
        'Person not found in this hive'
      );
    });

    it('returns the updated person via findFirstOrThrow', async () => {
      const updatedRow = makePersonRow({ id: PERSON_ID, role: 'parent' });
      mockPrisma.person.findFirstOrThrow.mockResolvedValue(updatedRow);

      const result = await svc.updateRole(PERSON_ID, HIVE_ID, 'parent');

      expect(mockPrisma.person.findFirstOrThrow).toHaveBeenCalled();
      expect(result.role).toBe('parent');
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('uses deleteMany with id+hiveId filter (cross-tenant defense)', async () => {
      await svc.remove(PERSON_ID, HIVE_ID);

      const deleteCall = mockPrisma.person.deleteMany.mock.calls[0][0];
      expect(deleteCall.where.id).toBe(PERSON_ID);
      expect(deleteCall.where.hiveId).toBe(HIVE_ID);
    });

    it('returns true when the person was deleted', async () => {
      mockPrisma.person.deleteMany.mockResolvedValue({ count: 1 });

      const result = await svc.remove(PERSON_ID, HIVE_ID);

      expect(result).toBe(true);
    });

    it('returns false when person is not found (or belongs to a different hive)', async () => {
      mockPrisma.person.deleteMany.mockResolvedValue({ count: 0 });

      const result = await svc.remove(PERSON_ID, HIVE_ID);

      expect(result).toBe(false);
    });
  });

  // ── notifyAdmins ──────────────────────────────────────────────────────────

  describe('notifyAdmins', () => {
    it('queries persons with admin roles derived from isAdminRole (Q-003)', async () => {
      mockPrisma.person.findMany.mockResolvedValue([]);

      await svc.notifyAdmins(HIVE_ID, 'MEMBER_JOINED', 'Title', 'Body');

      const query = mockPrisma.person.findMany.mock.calls[0][0];
      const roleFilter: string[] = query.where.role.in;

      // Both admin role names must be included
      expect(roleFilter).toContain('parent');
      expect(roleFilter).toContain('org_admin');
    });

    it('calls notifications.create once per admin found', async () => {
      const admin1 = { id: crypto.randomUUID() };
      const admin2 = { id: crypto.randomUUID() };
      mockPrisma.person.findMany.mockResolvedValue([admin1, admin2]);

      await svc.notifyAdmins(HIVE_ID, 'MEMBER_JOINED', 'Title', 'Body');

      expect(mockNotifications.create).toHaveBeenCalledTimes(2);
      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ recipientPersonId: admin1.id }),
        HIVE_ID
      );
      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ recipientPersonId: admin2.id }),
        HIVE_ID
      );
    });

    it('is fire-and-forget — does not throw when a notification fails', async () => {
      const admin = { id: crypto.randomUUID() };
      mockPrisma.person.findMany.mockResolvedValue([admin]);
      // Notification fails
      mockNotifications.create.mockRejectedValue(new Error('notification service down'));

      // Must resolve without throwing (Promise.allSettled absorbs failures)
      await expect(
        svc.notifyAdmins(HIVE_ID, 'MEMBER_JOINED', 'Title', 'Body')
      ).resolves.toBeUndefined();
    });

    it('sends no notifications when there are no admins in the hive', async () => {
      mockPrisma.person.findMany.mockResolvedValue([]);

      await svc.notifyAdmins(HIVE_ID, 'MEMBER_JOINED', 'Title', 'Body');

      expect(mockNotifications.create).not.toHaveBeenCalled();
    });

    it('passes notificationType, title, body, and optional resourceType/resourceId through', async () => {
      const admin = { id: crypto.randomUUID() };
      mockPrisma.person.findMany.mockResolvedValue([admin]);
      const resourceId = crypto.randomUUID();

      await svc.notifyAdmins(HIVE_ID, 'EVENT_CREATED', 'New Event', 'Details', 'event', resourceId);

      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationType: 'EVENT_CREATED',
          title: 'New Event',
          body: 'Details',
          resourceType: 'event',
          resourceId,
        }),
        HIVE_ID
      );
    });
  });
});
