import { Injectable } from '@nestjs/common';
import { type DirectMessage } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { DecryptFields, EncryptDecryptFields, EncryptionService } from '../encryption';

// ============================================
// TYPES
// ============================================

/** DirectMessage row with `body` decrypted. */
export type MessageRow = Omit<DirectMessage, 'body'> & { body: string };

export interface SendMessageData {
  senderPersonId: string;
  recipientPersonId: string;
  body: string;
}

/** Summary of the last message in a conversation thread. */
export interface ConversationSummary {
  partnerPersonId: string;
  lastMessage: MessageRow;
  unreadCount: number;
}

// ============================================
// ENCRYPTION CONFIG
// ============================================

const ENC_FIELDS = ['body'];

// ============================================
// SERVICE
// ============================================

/**
 * MessagingService
 *
 * Handles encrypted direct messages between hive members (Phase 3).
 * `body` is encrypted at rest using per-hive AES-256-GCM keys.
 *
 * Callers (router) are responsible for:
 * - Authorization (MESSAGES_SEND permission, sender must be current person)
 * - Input sanitization before calling service methods
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: EncryptionService
  ) {}

  /**
   * Send a direct message. `body` is encrypted by @EncryptDecryptFields.
   */
  @EncryptDecryptFields({ fields: ENC_FIELDS, hiveIdArg: 1 })
  async send(data: SendMessageData, hiveId: string): Promise<MessageRow> {
    return this.prisma.directMessage.create({
      data: {
        hiveId,
        senderPersonId: data.senderPersonId,
        recipientPersonId: data.recipientPersonId,
        body: data.body,
      },
    });
  }

  /**
   * List messages in a conversation between two persons.
   * Defense-in-depth: only returns messages where current person is sender or recipient.
   * Ordered newest first (client reverses for display).
   */
  @DecryptFields({ fields: ENC_FIELDS, hiveIdArg: 0 })
  async listMessages(
    hiveId: string,
    currentPersonId: string,
    partnerPersonId: string,
    options?: { limit?: number; page?: number }
  ): Promise<MessageRow[]> {
    const limit = options?.limit ?? 20;
    const page = options?.page ?? 1;

    return this.prisma.directMessage.findMany({
      where: {
        hiveId,
        OR: [
          { senderPersonId: currentPersonId, recipientPersonId: partnerPersonId },
          { senderPersonId: partnerPersonId, recipientPersonId: currentPersonId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    });
  }

  /**
   * List conversation partners (unique persons the current person has exchanged messages with),
   * each with the latest message and unread count.
   * Note: Decryption of `body` is done manually here due to the aggregation pattern.
   */
  async listConversations(
    hiveId: string,
    currentPersonId: string,
    options?: { limit?: number; page?: number }
  ): Promise<{ partnerPersonId: string; lastMessageAt: Date; unreadCount: number }[]> {
    const limit = options?.limit ?? 20;
    const page = options?.page ?? 1;

    // Raw aggregation: find latest message timestamp + unread count per conversation partner
    const rows = await this.prisma.$queryRaw<
      { partner_person_id: string; last_message_at: Date; unread_count: bigint }[]
    >`
      SELECT
        CASE
          WHEN sender_person_id = ${currentPersonId}::uuid THEN recipient_person_id
          ELSE sender_person_id
        END AS partner_person_id,
        MAX(created_at) AS last_message_at,
        COUNT(*) FILTER (
          WHERE recipient_person_id = ${currentPersonId}::uuid AND is_read = false
        ) AS unread_count
      FROM direct_messages
      WHERE hive_id = ${hiveId}::uuid
        AND (sender_person_id = ${currentPersonId}::uuid OR recipient_person_id = ${currentPersonId}::uuid)
      GROUP BY partner_person_id
      ORDER BY last_message_at DESC
      LIMIT ${limit} OFFSET ${(page - 1) * limit}
    `;

    return rows.map((row) => ({
      partnerPersonId: row.partner_person_id,
      lastMessageAt: row.last_message_at,
      unreadCount: Number(row.unread_count),
    }));
  }

  /** Mark all unread messages in a conversation as read. */
  async markConversationRead(
    hiveId: string,
    currentPersonId: string,
    partnerPersonId: string
  ): Promise<number> {
    const result = await this.prisma.directMessage.updateMany({
      where: {
        hiveId,
        senderPersonId: partnerPersonId,
        recipientPersonId: currentPersonId,
        isRead: false,
      },
      data: { isRead: true },
    });
    return result.count;
  }

  /** Count total unread messages for the current person across all conversations. */
  async countUnread(hiveId: string, personId: string): Promise<number> {
    return this.prisma.directMessage.count({
      where: { hiveId, recipientPersonId: personId, isRead: false },
    });
  }
}
