import { Injectable } from '@nestjs/common';
import { type Notification, Prisma } from '@prisma/client';

import { PrismaService } from '../../prisma/prisma.service';
import { DecryptFields, EncryptFields, EncryptionService } from '../encryption';

// ============================================
// TYPES
// ============================================

/** Notification row with encrypted fields decrypted. */
export type NotificationRow = Omit<Notification, 'title' | 'body'> & {
  title: string;
  body: string | null;
};

export interface CreateNotificationData {
  recipientPersonId: string;
  notificationType: string;
  title: string;
  body?: string;
  resourceType?: string;
  resourceId?: string;
}

export interface NotificationPreferenceMap {
  [notificationType: string]: { inApp: boolean; email: boolean };
}

// ============================================
// ENCRYPTION CONFIG
// ============================================

const ENC_FIELDS = ['title', 'body'];

// ============================================
// SERVICE
// ============================================

/**
 * NotificationsService
 *
 * Manages in-app notifications and per-person notification preferences.
 * `title` and `body` are encrypted at rest (AES-256-GCM, hive-scoped key).
 *
 * Callers (router / event listeners) are responsible for:
 * - Authorization: only the recipient can read/mark their own notifications
 * - Permission checks are applied at the router layer
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: EncryptionService
  ) {}

  /**
   * Create a new in-app notification for a person.
   * Called internally when significant events occur (member joined, task assigned, etc.).
   */
  @EncryptFields({ fields: ENC_FIELDS, hiveIdArg: 1 })
  async create(data: CreateNotificationData, hiveId: string): Promise<void> {
    await this.prisma.notification.create({
      data: {
        hiveId,
        recipientPersonId: data.recipientPersonId,
        notificationType: data.notificationType,
        title: data.title,
        body: data.body ?? null,
        resourceType: data.resourceType ?? null,
        resourceId: data.resourceId ?? null,
      },
    });
  }

  /**
   * List notifications for the current person.
   * Ordered by most recent first.
   * Defense-in-depth: explicit personId filter on top of RLS.
   */
  @DecryptFields({ fields: ENC_FIELDS, hiveIdArg: 0 })
  async list(
    hiveId: string,
    personId: string,
    options?: { onlyUnread?: boolean; limit?: number; page?: number }
  ): Promise<NotificationRow[]> {
    const limit = options?.limit ?? 20;
    const page = options?.page ?? 1;
    const where: Prisma.NotificationWhereInput = { hiveId, recipientPersonId: personId };
    if (options?.onlyUnread) where.isRead = false;

    return this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
    });
  }

  /** Count unread notifications for the current person. */
  async countUnread(hiveId: string, personId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { hiveId, recipientPersonId: personId, isRead: false },
    });
  }

  /** Mark a single notification as read. Returns false if not found / wrong person. */
  async markRead(notificationId: string, hiveId: string, personId: string): Promise<boolean> {
    const result = await this.prisma.notification.updateMany({
      where: { id: notificationId, hiveId, recipientPersonId: personId },
      data: { isRead: true },
    });
    return result.count > 0;
  }

  /** Mark all notifications for the current person as read. */
  async markAllRead(hiveId: string, personId: string): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { hiveId, recipientPersonId: personId, isRead: false },
      data: { isRead: true },
    });
    return result.count;
  }

  // ── Preferences ────────────────────────────────────────────────────────────

  /**
   * Get the notification preferences for a person.
   * Returns an empty object if none have been set — all notifications enabled by default.
   */
  async getPreferences(hiveId: string, personId: string): Promise<NotificationPreferenceMap> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { hiveId_personId: { hiveId, personId } },
      select: { preferences: true },
    });
    return (pref?.preferences ?? {}) as NotificationPreferenceMap;
  }

  /**
   * Upsert notification preferences for a person.
   * Merges the given map into the existing preferences (patch semantics).
   */
  async updatePreferences(
    hiveId: string,
    personId: string,
    updates: NotificationPreferenceMap
  ): Promise<NotificationPreferenceMap> {
    const existing = await this.getPreferences(hiveId, personId);
    const merged = { ...existing, ...updates };

    await this.prisma.notificationPreference.upsert({
      where: { hiveId_personId: { hiveId, personId } },
      create: { hiveId, personId, preferences: merged as Prisma.InputJsonValue },
      update: { preferences: merged as Prisma.InputJsonValue },
    });

    return merged;
  }
}
