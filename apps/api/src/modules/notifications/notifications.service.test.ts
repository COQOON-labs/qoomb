/**
 * Unit tests for NotificationsService.
 *
 * Coverage targets:
 * - create:             hiveId stored, optional fields default to null,
 *                       required fields (recipientPersonId, type, title) stored
 * - list:               hiveId + personId in WHERE (cross-tenant + recipient isolation),
 *                       onlyUnread filter, pagination (take/skip), ordered newest first
 * - countUnread:        hiveId + recipientPersonId + isRead=false filter
 * - markRead:           all 3 WHERE conditions (id, hiveId, personId — prevents marking
 *                       another user's notification), returns true/false
 * - markAllRead:        hiveId + personId + isRead=false filter, returns count
 * - getPreferences:     compound unique key lookup, returns {} when no prefs exist
 * - updatePreferences:  merge semantics (existing + update, not replace), upsert call
 */

import * as crypto from 'crypto';

import {
  NotificationsService,
  type CreateNotificationData,
  type NotificationPreferenceMap,
} from './notifications.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  notification: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    updateMany: jest.fn(),
  },
  notificationPreference: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
  },
};

/** Identity EncryptionService — @EncryptFields / @DecryptFields decorators use these. */
const mockEnc = {
  encrypt: jest.fn((value: string) => ({ _data: value })),
  serializeToStorage: jest.fn((v: { _data: string }) => v._data),
  decrypt: jest.fn((value: string) => value),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService(): NotificationsService {
  return new NotificationsService(mockPrisma as never, mockEnc as never);
}

const HIVE_ID = crypto.randomUUID();
const PERSON_ID = crypto.randomUUID();
const NOTIFICATION_ID = crypto.randomUUID();

function resetMocks() {
  jest.clearAllMocks();

  mockPrisma.notification.create.mockResolvedValue({});
  mockPrisma.notification.findMany.mockResolvedValue([]);
  mockPrisma.notification.count.mockResolvedValue(0);
  mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);
  mockPrisma.notificationPreference.upsert.mockResolvedValue({});

  mockEnc.encrypt.mockImplementation((value: string) => ({ _data: value }));
  mockEnc.serializeToStorage.mockImplementation((v: { _data: string }) => v._data);
  mockEnc.decrypt.mockImplementation((value: string) => value);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('NotificationsService', () => {
  let svc: NotificationsService;

  beforeEach(() => {
    resetMocks();
    svc = buildService();
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseData: CreateNotificationData = {
      recipientPersonId: PERSON_ID,
      notificationType: 'task.assigned',
      title: 'Neue Aufgabe',
    };

    it('stores hiveId, recipientPersonId, notificationType, and title', async () => {
      await svc.create(baseData, HIVE_ID);

      const createCall = mockPrisma.notification.create.mock.calls[0][0];
      expect(createCall.data.hiveId).toBe(HIVE_ID);
      expect(createCall.data.recipientPersonId).toBe(PERSON_ID);
      expect(createCall.data.notificationType).toBe('task.assigned');
      expect(createCall.data.title).toBe('Neue Aufgabe');
    });

    it('defaults body to null when not provided', async () => {
      await svc.create(baseData, HIVE_ID);

      const createCall = mockPrisma.notification.create.mock.calls[0][0];
      expect(createCall.data.body).toBeNull();
    });

    it('defaults resourceType to null when not provided', async () => {
      await svc.create(baseData, HIVE_ID);

      const createCall = mockPrisma.notification.create.mock.calls[0][0];
      expect(createCall.data.resourceType).toBeNull();
    });

    it('defaults resourceId to null when not provided', async () => {
      await svc.create(baseData, HIVE_ID);

      const createCall = mockPrisma.notification.create.mock.calls[0][0];
      expect(createCall.data.resourceId).toBeNull();
    });

    it('stores optional fields when provided', async () => {
      const resourceId = crypto.randomUUID();
      await svc.create({ ...baseData, body: 'Details', resourceType: 'task', resourceId }, HIVE_ID);

      const createCall = mockPrisma.notification.create.mock.calls[0][0];
      expect(createCall.data.body).toBe('Details');
      expect(createCall.data.resourceType).toBe('task');
      expect(createCall.data.resourceId).toBe(resourceId);
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('filters by hiveId AND personId (cross-tenant + recipient isolation)', async () => {
      await svc.list(HIVE_ID, PERSON_ID);

      const query = mockPrisma.notification.findMany.mock.calls[0][0];
      expect(query.where.hiveId).toBe(HIVE_ID);
      expect(query.where.recipientPersonId).toBe(PERSON_ID);
    });

    it('orders by createdAt descending (most recent first)', async () => {
      await svc.list(HIVE_ID, PERSON_ID);

      const query = mockPrisma.notification.findMany.mock.calls[0][0];
      expect(query.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('uses default limit 20 and skip 0', async () => {
      await svc.list(HIVE_ID, PERSON_ID);

      const query = mockPrisma.notification.findMany.mock.calls[0][0];
      expect(query.take).toBe(20);
      expect(query.skip).toBe(0);
    });

    it('calculates skip correctly for page 3 with limit 5', async () => {
      await svc.list(HIVE_ID, PERSON_ID, { limit: 5, page: 3 });

      const query = mockPrisma.notification.findMany.mock.calls[0][0];
      expect(query.take).toBe(5);
      expect(query.skip).toBe(10); // (3 - 1) * 5
    });

    it('adds isRead=false filter when onlyUnread is true', async () => {
      await svc.list(HIVE_ID, PERSON_ID, { onlyUnread: true });

      const query = mockPrisma.notification.findMany.mock.calls[0][0];
      expect(query.where.isRead).toBe(false);
    });

    it('does not add isRead filter when onlyUnread is not set', async () => {
      await svc.list(HIVE_ID, PERSON_ID);

      const query = mockPrisma.notification.findMany.mock.calls[0][0];
      expect(query.where.isRead).toBeUndefined();
    });
  });

  // ── countUnread ───────────────────────────────────────────────────────────

  describe('countUnread', () => {
    it('filters on hiveId, recipientPersonId, and isRead=false', async () => {
      mockPrisma.notification.count.mockResolvedValue(4);

      const result = await svc.countUnread(HIVE_ID, PERSON_ID);

      const countCall = mockPrisma.notification.count.mock.calls[0][0];
      expect(countCall.where.hiveId).toBe(HIVE_ID);
      expect(countCall.where.recipientPersonId).toBe(PERSON_ID);
      expect(countCall.where.isRead).toBe(false);
      expect(result).toBe(4);
    });
  });

  // ── markRead ──────────────────────────────────────────────────────────────

  describe('markRead', () => {
    it("filters on id, hiveId, AND recipientPersonId (prevents marking another user's notification)", async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

      await svc.markRead(NOTIFICATION_ID, HIVE_ID, PERSON_ID);

      const updateCall = mockPrisma.notification.updateMany.mock.calls[0][0];
      expect(updateCall.where.id).toBe(NOTIFICATION_ID);
      expect(updateCall.where.hiveId).toBe(HIVE_ID);
      expect(updateCall.where.recipientPersonId).toBe(PERSON_ID);
    });

    it('sets isRead to true', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

      await svc.markRead(NOTIFICATION_ID, HIVE_ID, PERSON_ID);

      const updateCall = mockPrisma.notification.updateMany.mock.calls[0][0];
      expect(updateCall.data.isRead).toBe(true);
    });

    it('returns true when notification was marked', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });

      expect(await svc.markRead(NOTIFICATION_ID, HIVE_ID, PERSON_ID)).toBe(true);
    });

    it('returns false when notification not found or belongs to different person', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });

      expect(await svc.markRead(NOTIFICATION_ID, HIVE_ID, PERSON_ID)).toBe(false);
    });
  });

  // ── markAllRead ───────────────────────────────────────────────────────────

  describe('markAllRead', () => {
    it('filters on hiveId, recipientPersonId, and isRead=false', async () => {
      await svc.markAllRead(HIVE_ID, PERSON_ID);

      const updateCall = mockPrisma.notification.updateMany.mock.calls[0][0];
      expect(updateCall.where.hiveId).toBe(HIVE_ID);
      expect(updateCall.where.recipientPersonId).toBe(PERSON_ID);
      expect(updateCall.where.isRead).toBe(false);
    });

    it('returns the number of notifications marked as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 12 });

      expect(await svc.markAllRead(HIVE_ID, PERSON_ID)).toBe(12);
    });
  });

  // ── getPreferences ────────────────────────────────────────────────────────

  describe('getPreferences', () => {
    it('queries by compound key hiveId+personId', async () => {
      await svc.getPreferences(HIVE_ID, PERSON_ID);

      const findCall = mockPrisma.notificationPreference.findUnique.mock.calls[0][0];
      expect(findCall.where.hiveId_personId).toEqual({ hiveId: HIVE_ID, personId: PERSON_ID });
    });

    it('returns empty object when no preferences exist (all notifications enabled by default)', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);

      const result = await svc.getPreferences(HIVE_ID, PERSON_ID);

      expect(result).toEqual({});
    });

    it('returns the stored preferences object when found', async () => {
      const prefs: NotificationPreferenceMap = {
        'task.assigned': { inApp: true, email: false },
      };
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({ preferences: prefs });

      const result = await svc.getPreferences(HIVE_ID, PERSON_ID);

      expect(result).toEqual(prefs);
    });
  });

  // ── updatePreferences ─────────────────────────────────────────────────────

  describe('updatePreferences', () => {
    it('merges updates onto existing preferences (patch semantics, not replace)', async () => {
      const existing: NotificationPreferenceMap = {
        'task.assigned': { inApp: true, email: true },
        'event.created': { inApp: true, email: true },
      };
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({ preferences: existing });

      const updates: NotificationPreferenceMap = {
        'task.assigned': { inApp: true, email: false }, // change one
      };

      const result = await svc.updatePreferences(HIVE_ID, PERSON_ID, updates);

      // Updated entry should be overwritten
      expect(result['task.assigned']).toEqual({ inApp: true, email: false });
      // Untouched entry should remain
      expect(result['event.created']).toEqual({ inApp: true, email: true });
    });

    it('adds new preference types without removing existing ones', async () => {
      const existing: NotificationPreferenceMap = {
        'task.assigned': { inApp: true, email: true },
      };
      mockPrisma.notificationPreference.findUnique.mockResolvedValue({ preferences: existing });

      const result = await svc.updatePreferences(HIVE_ID, PERSON_ID, {
        'member.invited': { inApp: false, email: false },
      });

      expect(result['task.assigned']).toEqual({ inApp: true, email: true }); // unchanged
      expect(result['member.invited']).toEqual({ inApp: false, email: false }); // added
    });

    it('calls upsert with the merged preferences', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue(null); // no existing

      const updates: NotificationPreferenceMap = {
        'task.assigned': { inApp: true, email: false },
      };

      await svc.updatePreferences(HIVE_ID, PERSON_ID, updates);

      const upsertCall = mockPrisma.notificationPreference.upsert.mock.calls[0][0];
      expect(upsertCall.where.hiveId_personId).toEqual({ hiveId: HIVE_ID, personId: PERSON_ID });
      expect(upsertCall.create.preferences).toEqual(updates);
      expect(upsertCall.update.preferences).toEqual(updates);
    });

    it('returns the merged map', async () => {
      mockPrisma.notificationPreference.findUnique.mockResolvedValue(null);

      const result = await svc.updatePreferences(HIVE_ID, PERSON_ID, {
        'task.assigned': { inApp: true, email: false },
      });

      expect(result).toEqual({ 'task.assigned': { inApp: true, email: false } });
    });
  });
});
