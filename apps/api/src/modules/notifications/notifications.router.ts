import {
  listNotificationsSchema,
  markNotificationReadSchema,
  updateNotificationPreferencesSchema,
} from '@qoomb/validators';
import { TRPCError } from '@trpc/server';

import { router, hiveProcedure } from '../../trpc/trpc.router';

import { type NotificationsService } from './notifications.service';

// ============================================
// ROUTER
// ============================================

export const notificationsRouter = (notificationsService: NotificationsService) =>
  router({
    /**
     * List the current person's notifications.
     * Newest first, paginated.
     * No special permission — every authenticated hive member sees their own.
     */
    list: hiveProcedure.input(listNotificationsSchema).query(async ({ ctx, input }) => {
      const personId = ctx.user.personId;
      if (!personId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing person context' });
      }
      return notificationsService.list(ctx.user.hiveId, personId, {
        onlyUnread: input.onlyUnread,
        limit: input.limit,
        page: input.page,
      });
    }),

    /**
     * Count unread notifications for the bell indicator.
     * Lightweight — returns a single integer.
     */
    countUnread: hiveProcedure.query(async ({ ctx }) => {
      const personId = ctx.user.personId;
      if (!personId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing person context' });
      }
      const count = await notificationsService.countUnread(ctx.user.hiveId, personId);
      return { count };
    }),

    /**
     * Mark a single notification as read.
     */
    markRead: hiveProcedure
      .input(markNotificationReadSchema)
      .mutation(async ({ ctx, input: notificationId }) => {
        const personId = ctx.user.personId;
        if (!personId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing person context' });
        }
        const updated = await notificationsService.markRead(
          notificationId,
          ctx.user.hiveId,
          personId
        );
        if (!updated) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Notification not found' });
        }
        return { success: true as const };
      }),

    /**
     * Mark all of the current person's notifications as read.
     * Returns the number of notifications marked.
     */
    markAllRead: hiveProcedure.mutation(async ({ ctx }) => {
      const personId = ctx.user.personId;
      if (!personId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing person context' });
      }
      const count = await notificationsService.markAllRead(ctx.user.hiveId, personId);
      return { count };
    }),

    /**
     * Get the current person's notification preferences.
     */
    getPreferences: hiveProcedure.query(async ({ ctx }) => {
      const personId = ctx.user.personId;
      if (!personId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing person context' });
      }
      return notificationsService.getPreferences(ctx.user.hiveId, personId);
    }),

    /**
     * Update the current person's notification preferences (patch semantics).
     */
    updatePreferences: hiveProcedure
      .input(updateNotificationPreferencesSchema)
      .mutation(async ({ ctx, input }) => {
        const personId = ctx.user.personId;
        if (!personId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing person context' });
        }
        return notificationsService.updatePreferences(ctx.user.hiveId, personId, input);
      }),
  });

export type NotificationsRouter = ReturnType<typeof notificationsRouter>;
