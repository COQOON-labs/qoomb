/**
 * Unit tests for EventsService.
 *
 * Coverage targets:
 * - list:   hiveId + visibilityFilter merged into WHERE, optional date/group filters,
 *           order by startAt asc
 * - getById: id+hiveId filter (cross-tenant defense), null when not found
 * - create:  hiveId + creatorId set, optional fields default to null,
 *            recurrenceRule stored as Prisma.JsonNull when absent
 * - update:  sparse patch — 'field' in data (nullable clear) vs !== undefined (skip),
 *            updateMany with id+hiveId (cross-tenant defense), throws when not found,
 *            returns via findUniqueOrThrow
 * - remove:  returns true/false based on deleteMany count, id+hiveId filter
 *
 * Encryption decorators (@EncryptDecryptFields / @DecryptFields) are integration-tested
 * separately. Here the mockEnc uses identity transforms so we can focus on business logic.
 */

import * as crypto from 'crypto';

import { Prisma } from '@prisma/client';

import { type CreateEventData, EventsService, type UpdateEventData } from './events.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  event: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
};

/** Identity EncryptionService — decorators call these; identity lets us test logic cleanly. */
const mockEnc = {
  encrypt: jest.fn((value: string) => ({ _data: value })),
  serializeToStorage: jest.fn((v: { _data: string }) => v._data),
  decrypt: jest.fn((value: string) => value),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService(): EventsService {
  return new EventsService(mockPrisma as never, mockEnc as never);
}

const now = new Date();
const future = new Date(now.getTime() + 60 * 60 * 1000);

function makeEventRow(
  overrides: Partial<{
    id: string;
    hiveId: string;
    creatorId: string;
    title: string;
    description: string | null;
    location: string | null;
    url: string | null;
    category: string | null;
    color: string | null;
    startAt: Date;
    endAt: Date;
    allDay: boolean;
    visibility: string;
    groupId: string | null;
    recurrenceRule: unknown;
  }> = {}
) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    hiveId: overrides.hiveId ?? HIVE_ID,
    creatorId: overrides.creatorId ?? PERSON_ID,
    title: overrides.title ?? 'Team Meeting',
    description: overrides.description ?? null,
    location: overrides.location ?? null,
    url: overrides.url ?? null,
    category: overrides.category ?? null,
    color: overrides.color ?? null,
    startAt: overrides.startAt ?? now,
    endAt: overrides.endAt ?? future,
    allDay: overrides.allDay ?? false,
    visibility: overrides.visibility ?? 'hive',
    groupId: overrides.groupId ?? null,
    recurrenceRule: overrides.recurrenceRule ?? Prisma.JsonNull,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ── Reset ─────────────────────────────────────────────────────────────────────

function resetMocks() {
  jest.clearAllMocks();

  mockPrisma.event.findMany.mockResolvedValue([]);
  mockPrisma.event.findFirst.mockResolvedValue(null);
  mockPrisma.event.findUniqueOrThrow.mockResolvedValue(makeEventRow());
  mockPrisma.event.create.mockResolvedValue(makeEventRow());
  mockPrisma.event.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.event.deleteMany.mockResolvedValue({ count: 1 });

  mockEnc.encrypt.mockImplementation((value: string) => ({ _data: value }));
  mockEnc.serializeToStorage.mockImplementation((v: { _data: string }) => v._data);
  mockEnc.decrypt.mockImplementation((value: string) => value);
}

const HIVE_ID = crypto.randomUUID();
const PERSON_ID = crypto.randomUUID();
const EVENT_ID = crypto.randomUUID();

// ─────────────────────────────────────────────────────────────────────────────

describe('EventsService', () => {
  let svc: EventsService;

  beforeEach(() => {
    resetMocks();
    svc = buildService();
  });

  // ── list ──────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('always includes hiveId in the WHERE clause', async () => {
      await svc.list(HIVE_ID, {});

      const query = mockPrisma.event.findMany.mock.calls[0][0];
      expect(query.where.hiveId).toBe(HIVE_ID);
    });

    it('merges visibilityFilter into WHERE so role-based restrictions are applied', async () => {
      const visibilityFilter: Prisma.EventWhereInput = {
        OR: [{ visibility: 'hive' }, { creatorId: PERSON_ID }],
      };

      await svc.list(HIVE_ID, visibilityFilter);

      const query = mockPrisma.event.findMany.mock.calls[0][0];
      expect(query.where.OR).toEqual(visibilityFilter.OR);
    });

    it('orders results by startAt ascending', async () => {
      await svc.list(HIVE_ID, {});

      const query = mockPrisma.event.findMany.mock.calls[0][0];
      expect(query.orderBy).toEqual({ startAt: 'asc' });
    });

    it('applies startAt filter (gte) when provided', async () => {
      const from = new Date('2026-06-01');
      await svc.list(HIVE_ID, {}, { startAt: from });

      const query = mockPrisma.event.findMany.mock.calls[0][0];
      expect(query.where.startAt).toEqual({ gte: from });
    });

    it('applies endAt filter (lte) when provided', async () => {
      const to = new Date('2026-06-30');
      await svc.list(HIVE_ID, {}, { endAt: to });

      const query = mockPrisma.event.findMany.mock.calls[0][0];
      expect(query.where.endAt).toEqual({ lte: to });
    });

    it('applies groupId filter when provided', async () => {
      const groupId = crypto.randomUUID();
      await svc.list(HIVE_ID, {}, { groupId });

      const query = mockPrisma.event.findMany.mock.calls[0][0];
      expect(query.where.groupId).toBe(groupId);
    });

    it('does not add date or group filters when not provided', async () => {
      await svc.list(HIVE_ID, {});

      const query = mockPrisma.event.findMany.mock.calls[0][0];
      expect(query.where.startAt).toBeUndefined();
      expect(query.where.endAt).toBeUndefined();
      expect(query.where.groupId).toBeUndefined();
    });
  });

  // ── getById ───────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('filters by BOTH id and hiveId (cross-tenant defense)', async () => {
      await svc.getById(EVENT_ID, HIVE_ID);

      const query = mockPrisma.event.findFirst.mock.calls[0][0];
      expect(query.where.id).toBe(EVENT_ID);
      expect(query.where.hiveId).toBe(HIVE_ID);
    });

    it('returns null when event does not exist', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(null);

      const result = await svc.getById(EVENT_ID, HIVE_ID);

      expect(result).toBeNull();
    });

    it('returns null for an event that exists in a DIFFERENT hive', async () => {
      mockPrisma.event.findFirst.mockResolvedValue(null);

      const result = await svc.getById(EVENT_ID, crypto.randomUUID());

      expect(result).toBeNull();
    });
  });

  // ── create ────────────────────────────────────────────────────────────────

  describe('create', () => {
    const baseData: CreateEventData = {
      title: 'Sprint Planning',
      startAt: now,
      endAt: future,
      allDay: false,
      visibility: 'hive',
    };

    it('always sets hiveId and creatorId from the explicit arguments', async () => {
      await svc.create(baseData, HIVE_ID, PERSON_ID);

      const createCall = mockPrisma.event.create.mock.calls[0][0];
      expect(createCall.data.hiveId).toBe(HIVE_ID);
      expect(createCall.data.creatorId).toBe(PERSON_ID);
    });

    it('defaults optional text fields to null when not provided', async () => {
      await svc.create(baseData, HIVE_ID, PERSON_ID);

      const createCall = mockPrisma.event.create.mock.calls[0][0];
      expect(createCall.data.description).toBeNull();
      expect(createCall.data.location).toBeNull();
      expect(createCall.data.url).toBeNull();
      expect(createCall.data.category).toBeNull();
      expect(createCall.data.color).toBeNull();
      expect(createCall.data.groupId).toBeNull();
    });

    it('stores recurrenceRule as Prisma.JsonNull when not provided', async () => {
      await svc.create(baseData, HIVE_ID, PERSON_ID);

      const createCall = mockPrisma.event.create.mock.calls[0][0];
      // Prisma.JsonNull is the sentinel that writes a JSON null — not JS undefined
      expect(createCall.data.recurrenceRule).toBe(Prisma.JsonNull);
    });

    it('stores provided recurrenceRule as-is', async () => {
      const rule = { freq: 'WEEKLY', interval: 1 };
      await svc.create({ ...baseData, recurrenceRule: rule }, HIVE_ID, PERSON_ID);

      const createCall = mockPrisma.event.create.mock.calls[0][0];
      expect(createCall.data.recurrenceRule).toEqual(rule);
    });

    it('passes allDay, startAt, endAt and visibility through', async () => {
      await svc.create({ ...baseData, allDay: true }, HIVE_ID, PERSON_ID);

      const createCall = mockPrisma.event.create.mock.calls[0][0];
      expect(createCall.data.allDay).toBe(true);
      expect(createCall.data.startAt).toBe(now);
      expect(createCall.data.endAt).toBe(future);
      expect(createCall.data.visibility).toBe('hive');
    });
  });

  // ── update ────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('uses updateMany with id+hiveId filter (cross-tenant defense)', async () => {
      await svc.update(EVENT_ID, { title: 'New Title' }, HIVE_ID);

      const updateCall = mockPrisma.event.updateMany.mock.calls[0][0];
      expect(updateCall.where.id).toBe(EVENT_ID);
      expect(updateCall.where.hiveId).toBe(HIVE_ID);
    });

    it('throws when event not found in this hive', async () => {
      mockPrisma.event.updateMany.mockResolvedValue({ count: 0 });

      await expect(svc.update(EVENT_ID, { title: 'X' }, HIVE_ID)).rejects.toThrow(
        'Event not found in this hive'
      );
    });

    it('returns the updated event via findUniqueOrThrow', async () => {
      const updated = makeEventRow({ id: EVENT_ID, title: 'Updated' });
      mockPrisma.event.findUniqueOrThrow.mockResolvedValue(updated);

      const result = await svc.update(EVENT_ID, { title: 'Updated' }, HIVE_ID);

      expect(mockPrisma.event.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: EVENT_ID } });
      expect(result.title).toBe('Updated');
    });

    it('sparse patch — only includes title when only title is provided', async () => {
      await svc.update(EVENT_ID, { title: 'Only Title' }, HIVE_ID);

      const patch = mockPrisma.event.updateMany.mock.calls[0][0].data;
      expect(Object.keys(patch)).toEqual(['title']);
    });

    it('clears a nullable field to null when explicitly set to null', async () => {
      const data: UpdateEventData = { description: null };
      await svc.update(EVENT_ID, data, HIVE_ID);

      const patch = mockPrisma.event.updateMany.mock.calls[0][0].data;
      expect(patch.description).toBeNull();
    });

    it('skips a nullable field entirely when it is absent from the update object', async () => {
      // description not in data object at all
      const data: UpdateEventData = { title: 'New Title' };
      await svc.update(EVENT_ID, data, HIVE_ID);

      const patch = mockPrisma.event.updateMany.mock.calls[0][0].data;
      expect('description' in patch).toBe(false);
    });

    it('clears groupId to null when explicitly set to null', async () => {
      await svc.update(EVENT_ID, { groupId: null }, HIVE_ID);

      const patch = mockPrisma.event.updateMany.mock.calls[0][0].data;
      expect(patch.groupId).toBeNull();
    });

    it('stores Prisma.JsonNull when recurrenceRule is explicitly set to null', async () => {
      await svc.update(EVENT_ID, { recurrenceRule: null }, HIVE_ID);

      const patch = mockPrisma.event.updateMany.mock.calls[0][0].data;
      expect(patch.recurrenceRule).toBe(Prisma.JsonNull);
    });

    it('stores the recurrenceRule object when provided', async () => {
      const rule = { freq: 'DAILY' };
      await svc.update(EVENT_ID, { recurrenceRule: rule }, HIVE_ID);

      const patch = mockPrisma.event.updateMany.mock.calls[0][0].data;
      expect(patch.recurrenceRule).toEqual(rule);
    });
  });

  // ── remove ────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('uses deleteMany with id+hiveId filter (cross-tenant defense)', async () => {
      await svc.remove(EVENT_ID, HIVE_ID);

      const deleteCall = mockPrisma.event.deleteMany.mock.calls[0][0];
      expect(deleteCall.where.id).toBe(EVENT_ID);
      expect(deleteCall.where.hiveId).toBe(HIVE_ID);
    });

    it('returns true when the event was deleted', async () => {
      mockPrisma.event.deleteMany.mockResolvedValue({ count: 1 });

      const result = await svc.remove(EVENT_ID, HIVE_ID);

      expect(result).toBe(true);
    });

    it('returns false when event not found (or belongs to a different hive)', async () => {
      mockPrisma.event.deleteMany.mockResolvedValue({ count: 0 });

      const result = await svc.remove(EVENT_ID, HIVE_ID);

      expect(result).toBe(false);
    });
  });
});
