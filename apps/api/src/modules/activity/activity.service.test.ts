/**
 * Unit tests for ActivityService.
 *
 * Coverage targets:
 * - record:  hiveId stored, optional fields default (actorPersonId → null,
 *            summary → null, metadata → {}), all required fields passed through
 * - list:    hiveId always in WHERE, optional filters (resourceType, resourceId,
 *            actorPersonId), orderBy createdAt desc, pagination (take/skip)
 */

import * as crypto from 'crypto';

import { ActivityService, type RecordActivityData } from './activity.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  activityEvent: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
};

/** Identity EncryptionService — @EncryptFields / @DecryptFields decorators use these. */
const mockEnc = {
  encrypt: jest.fn((value: string) => ({ _data: value })),
  serializeToStorage: jest.fn((v: { _data: string }) => v._data),
  decrypt: jest.fn((value: string) => value),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService(): ActivityService {
  return new ActivityService(mockPrisma as never, mockEnc as never);
}

const HIVE_ID = crypto.randomUUID();
const PERSON_ID = crypto.randomUUID();
const RESOURCE_ID = crypto.randomUUID();

function resetMocks() {
  jest.clearAllMocks();

  mockPrisma.activityEvent.create.mockResolvedValue({});
  mockPrisma.activityEvent.findMany.mockResolvedValue([]);

  mockEnc.encrypt.mockImplementation((value: string) => ({ _data: value }));
  mockEnc.serializeToStorage.mockImplementation((v: { _data: string }) => v._data);
  mockEnc.decrypt.mockImplementation((value: string) => value);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('ActivityService', () => {
  let svc: ActivityService;

  beforeEach(() => {
    resetMocks();
    svc = buildService();
  });

  // ── record ────────────────────────────────────────────────────────────────

  describe('record', () => {
    const baseData: RecordActivityData = {
      action: 'event.created',
      resourceType: 'event',
      resourceId: RESOURCE_ID,
    };

    it('stores hiveId, action, resourceType, and resourceId', async () => {
      await svc.record(baseData, HIVE_ID);

      const createCall = mockPrisma.activityEvent.create.mock.calls[0][0];
      expect(createCall.data.hiveId).toBe(HIVE_ID);
      expect(createCall.data.action).toBe('event.created');
      expect(createCall.data.resourceType).toBe('event');
      expect(createCall.data.resourceId).toBe(RESOURCE_ID);
    });

    it('defaults actorPersonId to null when not provided', async () => {
      await svc.record(baseData, HIVE_ID);

      const createCall = mockPrisma.activityEvent.create.mock.calls[0][0];
      expect(createCall.data.actorPersonId).toBeNull();
    });

    it('stores actorPersonId when provided', async () => {
      await svc.record({ ...baseData, actorPersonId: PERSON_ID }, HIVE_ID);

      const createCall = mockPrisma.activityEvent.create.mock.calls[0][0];
      expect(createCall.data.actorPersonId).toBe(PERSON_ID);
    });

    it('defaults summary to null when not provided', async () => {
      await svc.record(baseData, HIVE_ID);

      const createCall = mockPrisma.activityEvent.create.mock.calls[0][0];
      expect(createCall.data.summary).toBeNull();
    });

    it('defaults metadata to empty object when not provided', async () => {
      await svc.record(baseData, HIVE_ID);

      const createCall = mockPrisma.activityEvent.create.mock.calls[0][0];
      expect(createCall.data.metadata).toEqual({});
    });

    it('stores provided metadata as-is', async () => {
      const meta = { previousTitle: 'Old', newTitle: 'New' };
      await svc.record({ ...baseData, metadata: meta }, HIVE_ID);

      const createCall = mockPrisma.activityEvent.create.mock.calls[0][0];
      expect(createCall.data.metadata).toEqual(meta);
    });
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('always includes hiveId in the WHERE clause', async () => {
      await svc.list(HIVE_ID);

      const query = mockPrisma.activityEvent.findMany.mock.calls[0][0];
      expect(query.where.hiveId).toBe(HIVE_ID);
    });

    it('orders by createdAt descending (most recent first)', async () => {
      await svc.list(HIVE_ID);

      const query = mockPrisma.activityEvent.findMany.mock.calls[0][0];
      expect(query.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('uses default limit of 20 when not specified', async () => {
      await svc.list(HIVE_ID);

      const query = mockPrisma.activityEvent.findMany.mock.calls[0][0];
      expect(query.take).toBe(20);
    });

    it('uses default page 1 (skip = 0) when not specified', async () => {
      await svc.list(HIVE_ID);

      const query = mockPrisma.activityEvent.findMany.mock.calls[0][0];
      expect(query.skip).toBe(0);
    });

    it('calculates skip correctly for page 2 with default limit', async () => {
      await svc.list(HIVE_ID, { page: 2 });

      const query = mockPrisma.activityEvent.findMany.mock.calls[0][0];
      expect(query.skip).toBe(20); // (2 - 1) * 20
    });

    it('calculates skip correctly for page 3 with custom limit', async () => {
      await svc.list(HIVE_ID, { limit: 10, page: 3 });

      const query = mockPrisma.activityEvent.findMany.mock.calls[0][0];
      expect(query.take).toBe(10);
      expect(query.skip).toBe(20); // (3 - 1) * 10
    });

    it('applies resourceType filter when provided', async () => {
      await svc.list(HIVE_ID, { resourceType: 'event' });

      const query = mockPrisma.activityEvent.findMany.mock.calls[0][0];
      expect(query.where.resourceType).toBe('event');
    });

    it('applies resourceId filter when provided', async () => {
      await svc.list(HIVE_ID, { resourceId: RESOURCE_ID });

      const query = mockPrisma.activityEvent.findMany.mock.calls[0][0];
      expect(query.where.resourceId).toBe(RESOURCE_ID);
    });

    it('applies actorPersonId filter when provided', async () => {
      await svc.list(HIVE_ID, { actorPersonId: PERSON_ID });

      const query = mockPrisma.activityEvent.findMany.mock.calls[0][0];
      expect(query.where.actorPersonId).toBe(PERSON_ID);
    });

    it('does not add optional filters when not provided', async () => {
      await svc.list(HIVE_ID);

      const query = mockPrisma.activityEvent.findMany.mock.calls[0][0];
      expect(query.where.resourceType).toBeUndefined();
      expect(query.where.resourceId).toBeUndefined();
      expect(query.where.actorPersonId).toBeUndefined();
    });
  });
});
