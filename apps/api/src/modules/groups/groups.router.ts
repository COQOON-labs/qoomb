import { Prisma } from '@prisma/client';
import { HivePermission } from '@qoomb/types';
import {
  groupIdSchema,
  createGroupSchema,
  updateGroupSchema,
  addGroupMemberSchema,
  removeGroupMemberSchema,
  sanitizeHtml,
} from '@qoomb/validators';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { requirePermission } from '../../common/guards';
import { router, hiveProcedure } from '../../trpc/trpc.router';

import { type GroupsService } from './groups.service';

// ============================================
// ROUTER
// ============================================

export const groupsRouter = (groupsService: GroupsService) =>
  router({
    /**
     * List all groups in the hive with member counts.
     * Any member with members:view can see groups.
     */
    list: hiveProcedure.query(async ({ ctx }) => {
      requirePermission(ctx, HivePermission.MEMBERS_VIEW);
      return groupsService.list(ctx.user.hiveId);
    }),

    /**
     * Get a single group with its member list.
     * Any member with members:view can see group details.
     */
    get: hiveProcedure.input(groupIdSchema).query(async ({ ctx, input: id }) => {
      requirePermission(ctx, HivePermission.MEMBERS_VIEW);
      const group = await groupsService.getById(id, ctx.user.hiveId);
      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
      }
      return group;
    }),

    /**
     * Create a new group. Requires members:manage (admin-only).
     * Group name is sanitized and encrypted at rest.
     */
    create: hiveProcedure.input(createGroupSchema).mutation(async ({ ctx, input }) => {
      requirePermission(ctx, HivePermission.MEMBERS_MANAGE);

      try {
        return await groupsService.create(ctx.user.hiveId, {
          name: sanitizeHtml(input.name),
          description: input.description ? sanitizeHtml(input.description) : undefined,
        });
      } catch (e) {
        throw mapPrismaError(e, 'Failed to create group');
      }
    }),

    /**
     * Update a group's name and/or description.
     * Requires members:manage (admin-only).
     */
    update: hiveProcedure
      .input(z.object({ id: groupIdSchema, data: updateGroupSchema }))
      .mutation(async ({ ctx, input }) => {
        requirePermission(ctx, HivePermission.MEMBERS_MANAGE);

        // Verify group exists in this hive
        const existing = await groupsService.getById(input.id, ctx.user.hiveId);
        if (!existing) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
        }

        try {
          return await groupsService.update(input.id, ctx.user.hiveId, {
            ...(input.data.name !== undefined && { name: sanitizeHtml(input.data.name) }),
            ...('description' in input.data && {
              description: input.data.description ? sanitizeHtml(input.data.description) : null,
            }),
          });
        } catch (e) {
          throw mapPrismaError(e, 'Failed to update group');
        }
      }),

    /**
     * Delete a group. Requires members:manage (admin-only).
     * Cascading delete removes all group memberships and group shares.
     */
    delete: hiveProcedure.input(groupIdSchema).mutation(async ({ ctx, input: id }) => {
      requirePermission(ctx, HivePermission.MEMBERS_MANAGE);

      const removed = await groupsService.remove(id, ctx.user.hiveId);
      if (!removed) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
      }
      return { success: true as const };
    }),

    /**
     * Add a person to a group. Requires members:manage (admin-only).
     * Records who added the member for audit trail (addedByPersonId).
     */
    addMember: hiveProcedure.input(addGroupMemberSchema).mutation(async ({ ctx, input }) => {
      requirePermission(ctx, HivePermission.MEMBERS_MANAGE);

      // Verify group exists in this hive
      const group = await groupsService.getById(input.groupId, ctx.user.hiveId);
      if (!group) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
      }

      const { personId: addedByPersonId } = ctx.user;
      if (!addedByPersonId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No person record found' });
      }

      try {
        return await groupsService.addMember(
          input.groupId,
          input.personId,
          ctx.user.hiveId,
          addedByPersonId
        );
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Person is already a member of this group',
          });
        }
        throw mapPrismaError(e, 'Failed to add member to group');
      }
    }),

    /**
     * Remove a person from a group. Requires members:manage (admin-only).
     */
    removeMember: hiveProcedure.input(removeGroupMemberSchema).mutation(async ({ ctx, input }) => {
      requirePermission(ctx, HivePermission.MEMBERS_MANAGE);

      const removed = await groupsService.removeMember(
        input.groupId,
        input.personId,
        ctx.user.hiveId
      );
      if (!removed) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Membership not found' });
      }
      return { success: true as const };
    }),
  });

export type GroupsRouter = ReturnType<typeof groupsRouter>;

// ============================================
// HELPERS
// ============================================

function mapPrismaError(e: unknown, fallbackMessage: string): TRPCError {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2025') {
      return new TRPCError({ code: 'NOT_FOUND', message: 'Group not found' });
    }
    return new TRPCError({ code: 'BAD_REQUEST', message: fallbackMessage });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected error' });
}
