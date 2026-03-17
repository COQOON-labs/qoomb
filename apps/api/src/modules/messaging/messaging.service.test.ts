/**
 * Unit tests for MessagingService.
 *
 * Coverage targets:
 * - send:                hiveId + sender + recipient stored
 * - listMessages:        bidirectional OR filter (both message directions),
 *                        hiveId included, pagination (take/skip), ordered newest first
 * - listConversations:   $queryRaw called with parameterized args (no injection),
 *                        bigint → number conversion for unreadCount
 * - markConversationRead: all 4 WHERE conditions (hiveId, sender=partner, recipient=current,
 *                         isRead=false), returns count
 * - countUnread:         hiveId + recipientPersonId=current + isRead=false filter
 */

import * as crypto from 'crypto';

import { MessagingService, type SendMessageData } from './messaging.service';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPrisma = {
  directMessage: {
    create: jest.fn(),
    findMany: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

/** Identity EncryptionService — @EncryptDecryptFields / @DecryptFields decorators use these. */
const mockEnc = {
  encrypt: jest.fn((value: string) => ({ _data: value })),
  serializeToStorage: jest.fn((v: { _data: string }) => v._data),
  decrypt: jest.fn((value: string) => value),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildService(): MessagingService {
  return new MessagingService(mockPrisma as never, mockEnc as never);
}

const HIVE_ID = crypto.randomUUID();
const PERSON_A = crypto.randomUUID();
const PERSON_B = crypto.randomUUID();

function makeMessageRow(
  overrides: Partial<{
    id: string;
    hiveId: string;
    senderPersonId: string;
    recipientPersonId: string;
    body: string;
    isRead: boolean;
  }> = {}
) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    hiveId: overrides.hiveId ?? HIVE_ID,
    senderPersonId: overrides.senderPersonId ?? PERSON_A,
    recipientPersonId: overrides.recipientPersonId ?? PERSON_B,
    body: overrides.body ?? 'Hallo!',
    isRead: overrides.isRead ?? false,
    createdAt: new Date(),
  };
}

function resetMocks() {
  jest.clearAllMocks();

  mockPrisma.directMessage.create.mockResolvedValue(makeMessageRow());
  mockPrisma.directMessage.findMany.mockResolvedValue([]);
  mockPrisma.directMessage.updateMany.mockResolvedValue({ count: 3 });
  mockPrisma.directMessage.count.mockResolvedValue(0);
  mockPrisma.$queryRaw.mockResolvedValue([]);

  mockEnc.encrypt.mockImplementation((value: string) => ({ _data: value }));
  mockEnc.serializeToStorage.mockImplementation((v: { _data: string }) => v._data);
  mockEnc.decrypt.mockImplementation((value: string) => value);
}

// ─────────────────────────────────────────────────────────────────────────────

describe('MessagingService', () => {
  let svc: MessagingService;

  beforeEach(() => {
    resetMocks();
    svc = buildService();
  });

  // ── send ──────────────────────────────────────────────────────────────────

  describe('send', () => {
    const msgData: SendMessageData = {
      senderPersonId: PERSON_A,
      recipientPersonId: PERSON_B,
      body: 'Guten Morgen!',
    };

    it('stores hiveId, senderPersonId, recipientPersonId, and body', async () => {
      await svc.send(msgData, HIVE_ID);

      const createCall = mockPrisma.directMessage.create.mock.calls[0][0];
      expect(createCall.data.hiveId).toBe(HIVE_ID);
      expect(createCall.data.senderPersonId).toBe(PERSON_A);
      expect(createCall.data.recipientPersonId).toBe(PERSON_B);
      expect(createCall.data.body).toBe('Guten Morgen!');
    });
  });

  // ── listMessages ──────────────────────────────────────────────────────────

  describe('listMessages', () => {
    it('includes hiveId in the WHERE clause', async () => {
      await svc.listMessages(HIVE_ID, PERSON_A, PERSON_B);

      const query = mockPrisma.directMessage.findMany.mock.calls[0][0];
      expect(query.where.hiveId).toBe(HIVE_ID);
    });

    it('uses a bidirectional OR filter covering both message directions', async () => {
      await svc.listMessages(HIVE_ID, PERSON_A, PERSON_B);

      const query = mockPrisma.directMessage.findMany.mock.calls[0][0];
      expect(query.where.OR).toHaveLength(2);

      // Direction 1: A sent to B
      expect(query.where.OR).toContainEqual({
        senderPersonId: PERSON_A,
        recipientPersonId: PERSON_B,
      });
      // Direction 2: B sent to A
      expect(query.where.OR).toContainEqual({
        senderPersonId: PERSON_B,
        recipientPersonId: PERSON_A,
      });
    });

    it('orders by createdAt descending (newest first)', async () => {
      await svc.listMessages(HIVE_ID, PERSON_A, PERSON_B);

      const query = mockPrisma.directMessage.findMany.mock.calls[0][0];
      expect(query.orderBy).toEqual({ createdAt: 'desc' });
    });

    it('uses default limit 20 and page 1 (skip=0)', async () => {
      await svc.listMessages(HIVE_ID, PERSON_A, PERSON_B);

      const query = mockPrisma.directMessage.findMany.mock.calls[0][0];
      expect(query.take).toBe(20);
      expect(query.skip).toBe(0);
    });

    it('calculates skip correctly for page 2 with custom limit', async () => {
      await svc.listMessages(HIVE_ID, PERSON_A, PERSON_B, { limit: 10, page: 2 });

      const query = mockPrisma.directMessage.findMany.mock.calls[0][0];
      expect(query.take).toBe(10);
      expect(query.skip).toBe(10); // (2 - 1) * 10
    });
  });

  // ── listConversations ─────────────────────────────────────────────────────

  describe('listConversations', () => {
    it('calls $queryRaw (raw SQL aggregation for conversation summaries)', async () => {
      await svc.listConversations(HIVE_ID, PERSON_A);

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('converts unread_count from bigint to number in the result', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          partner_person_id: PERSON_B,
          last_message_at: new Date(),
          unread_count: BigInt(3),
        },
      ]);

      const result = await svc.listConversations(HIVE_ID, PERSON_A);

      expect(typeof result[0].unreadCount).toBe('number');
      expect(result[0].unreadCount).toBe(3);
    });

    it('maps snake_case DB columns to camelCase result fields', async () => {
      const lastAt = new Date();
      mockPrisma.$queryRaw.mockResolvedValue([
        { partner_person_id: PERSON_B, last_message_at: lastAt, unread_count: BigInt(0) },
      ]);

      const result = await svc.listConversations(HIVE_ID, PERSON_A);

      expect(result[0].partnerPersonId).toBe(PERSON_B);
      expect(result[0].lastMessageAt).toBe(lastAt);
      expect(result[0].unreadCount).toBe(0);
    });

    it('returns an empty array when no conversations exist', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await svc.listConversations(HIVE_ID, PERSON_A);

      expect(result).toEqual([]);
    });
  });

  // ── markConversationRead ──────────────────────────────────────────────────

  describe('markConversationRead', () => {
    it('filters on all 4 conditions: hiveId, sender=partner, recipient=current, isRead=false', async () => {
      await svc.markConversationRead(HIVE_ID, PERSON_A, PERSON_B);

      const updateCall = mockPrisma.directMessage.updateMany.mock.calls[0][0];
      expect(updateCall.where.hiveId).toBe(HIVE_ID);
      expect(updateCall.where.senderPersonId).toBe(PERSON_B); // partner sent
      expect(updateCall.where.recipientPersonId).toBe(PERSON_A); // current received
      expect(updateCall.where.isRead).toBe(false); // only unread
    });

    it('sets isRead to true', async () => {
      await svc.markConversationRead(HIVE_ID, PERSON_A, PERSON_B);

      const updateCall = mockPrisma.directMessage.updateMany.mock.calls[0][0];
      expect(updateCall.data.isRead).toBe(true);
    });

    it('returns the count of updated messages', async () => {
      mockPrisma.directMessage.updateMany.mockResolvedValue({ count: 5 });

      const result = await svc.markConversationRead(HIVE_ID, PERSON_A, PERSON_B);

      expect(result).toBe(5);
    });
  });

  // ── countUnread ───────────────────────────────────────────────────────────

  describe('countUnread', () => {
    it('filters on hiveId, recipientPersonId=current, and isRead=false', async () => {
      mockPrisma.directMessage.count.mockResolvedValue(7);

      const result = await svc.countUnread(HIVE_ID, PERSON_A);

      const countCall = mockPrisma.directMessage.count.mock.calls[0][0];
      expect(countCall.where.hiveId).toBe(HIVE_ID);
      expect(countCall.where.recipientPersonId).toBe(PERSON_A);
      expect(countCall.where.isRead).toBe(false);
      expect(result).toBe(7);
    });
  });
});
