import { HivePermission } from '@qoomb/types';
import { sendMessageSchema, listMessagesSchema, listConversationsSchema, sanitizeHtml } from '@qoomb/validators';
import { TRPCError } from '@trpc/server';

import { requirePermission } from '../../common/guards';
import { router, hiveProcedure } from '../../trpc/trpc.router';

import { type MessagingService } from './messaging.service';

// ============================================
// ROUTER
// ============================================

export const messagingRouter = (messagingService: MessagingService) =>
  router({
    /**
     * List conversations (unique partners) for the current person,
     * ordered by most recent message.
     * Requires: messages:send
     */
    listConversations: hiveProcedure
      .input(listConversationsSchema)
      .query(async ({ ctx, input }) => {
        requirePermission(ctx, HivePermission.MESSAGES_SEND);
        const personId = ctx.user.personId;
        if (!personId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing person context' });
        }
        return messagingService.listConversations(ctx.user.hiveId, personId, {
          limit: input.limit,
          page: input.page,
        });
      }),

    /**
     * List messages in a conversation with a specific partner.
     * Newest first, paginated. Only returns messages where current user is sender or recipient.
     * Requires: messages:send
     */
    listMessages: hiveProcedure.input(listMessagesSchema).query(async ({ ctx, input }) => {
      requirePermission(ctx, HivePermission.MESSAGES_SEND);
      const personId = ctx.user.personId;
      if (!personId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing person context' });
      }
      return messagingService.listMessages(ctx.user.hiveId, personId, input.partnerPersonId, {
        limit: input.limit,
        page: input.page,
      });
    }),

    /**
     * Count total unread messages (for badge indicator).
     * Requires: messages:send
     */
    countUnread: hiveProcedure.query(async ({ ctx }) => {
      requirePermission(ctx, HivePermission.MESSAGES_SEND);
      const personId = ctx.user.personId;
      if (!personId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing person context' });
      }
      const count = await messagingService.countUnread(ctx.user.hiveId, personId);
      return { count };
    }),

    /**
     * Send a direct message to another hive member.
     * Body is sanitized and encrypted at rest.
     * Requires: messages:send
     */
    send: hiveProcedure.input(sendMessageSchema).mutation(async ({ ctx, input }) => {
      requirePermission(ctx, HivePermission.MESSAGES_SEND);
      const personId = ctx.user.personId;
      if (!personId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing person context' });
      }

      if (input.recipientPersonId === personId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot send a message to yourself',
        });
      }

      return messagingService.send(
        {
          senderPersonId: personId,
          recipientPersonId: input.recipientPersonId,
          body: sanitizeHtml(input.body),
        },
        ctx.user.hiveId
      );
    }),

    /**
     * Mark all messages from a specific partner as read.
     * Returns the number of messages updated.
     * Requires: messages:send
     */
    markConversationRead: hiveProcedure
      .input(listMessagesSchema.pick({ partnerPersonId: true }))
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx, HivePermission.MESSAGES_SEND);
        const personId = ctx.user.personId;
        if (!personId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing person context' });
        }
        const count = await messagingService.markConversationRead(
          ctx.user.hiveId,
          personId,
          input.partnerPersonId
        );
        return { count };
      }),
  });

export type MessagingRouter = ReturnType<typeof messagingRouter>;
