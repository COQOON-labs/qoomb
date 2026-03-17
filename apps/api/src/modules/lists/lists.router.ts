import { Prisma } from '@prisma/client';
import { HivePermission } from '@qoomb/types';
import {
  createListSchema,
  updateListSchema,
  createListFieldSchema,
  updateListFieldSchema,
  createListViewSchema,
  updateListViewSchema,
  createListItemSchema,
  updateListItemSchema,
  reorderListItemsSchema,
  listListsSchema,
  sanitizeHtml,
} from '@qoomb/validators';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  requirePermission,
  requireResourceAccess,
  buildVisibilityFilter,
  getSharedResourceIds,
  type ResourcePermissions,
} from '../../common/guards';
import { type TransactionClient } from '../../prisma/prisma.service';
import { router, hiveProcedure } from '../../trpc/trpc.router';

import { type ListsService } from './lists.service';

// ============================================
// PERMISSION CONSTANTS
// ============================================

const LIST_PERMISSIONS: ResourcePermissions = {
  view: HivePermission.LISTS_VIEW,
  edit: HivePermission.LISTS_UPDATE_ANY,
  editOwn: HivePermission.LISTS_UPDATE_OWN,
  delete: HivePermission.LISTS_DELETE_ANY,
  deleteOwn: HivePermission.LISTS_DELETE_OWN,
};

// ============================================
// ROUTER
// ============================================

export const listsRouter = (listsService: ListsService) =>
  router({
    /**
     * List all lists visible to the current user.
     * Requires: lists:view
     */
    list: hiveProcedure.input(listListsSchema).query(async ({ ctx, input }) => {
      requirePermission(ctx, HivePermission.LISTS_VIEW);

      const sharedIds = await getSharedResourceIds(
        ctx.tx,
        'list',
        ctx.user.personId ?? '',
        ctx.user.groupIds ?? []
      );

      const visibilityFilter = buildVisibilityFilter(
        {
          personId: ctx.user.personId ?? '',
          hiveType: ctx.user.hiveType ?? '',
          role: ctx.user.role ?? '',
          roleOverrides: ctx.user.roleOverrides ?? [],
          groupIds: ctx.user.groupIds ?? [],
        },
        HivePermission.LISTS_VIEW,
        sharedIds
      );

      return listsService.list(
        ctx.user.hiveId,
        visibilityFilter as Prisma.ListWhereInput,
        input.includeArchived
      );
    }),

    /**
     * Get a single list by ID (with fields and views).
     * Full 5-stage resource access check.
     * Requires: lists:view
     */
    get: hiveProcedure.input(z.uuid()).query(async ({ ctx, input: id }) => {
      const list = await listsService.getById(id, ctx.user.hiveId);
      if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });

      await requireResourceAccess(
        ctx,
        ctx.tx,
        { type: 'list', ...list, groupId: list.groupId ?? undefined },
        'view',
        LIST_PERMISSIONS
      );
      return list;
    }),

    /**
     * Create a new list.
     * Requires: lists:create
     */
    create: hiveProcedure.input(createListSchema).mutation(async ({ ctx, input }) => {
      requirePermission(ctx, HivePermission.LISTS_CREATE);

      const { personId, hiveId } = ctx.user;
      if (!personId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No person record found' });
      }

      try {
        return await listsService.create(
          {
            name: sanitizeHtml(input.name),
            icon: input.icon,
            visibility: input.visibility,
            groupId: input.groupId,
          },
          hiveId,
          personId
        );
      } catch (e) {
        throw mapPrismaError(e, 'Failed to create list');
      }
    }),

    /**
     * Update an existing list.
     * System lists (systemKey != null) cannot be renamed.
     * Creator can update their own list (UPDATE_OWN); admins can update any (UPDATE_ANY).
     */
    update: hiveProcedure
      .input(z.object({ id: z.uuid(), data: updateListSchema }))
      .mutation(async ({ ctx, input }) => {
        const list = await listsService.getById(input.id, ctx.user.hiveId);
        if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });

        await requireResourceAccess(
          ctx,
          ctx.tx,
          { type: 'list', ...list, groupId: list.groupId ?? undefined },
          'edit',
          LIST_PERMISSIONS
        );

        // System lists cannot be renamed
        if (list.systemKey && input.data.name !== undefined) {
          throw new TRPCError({
            code: 'FORBIDDEN',
            message: 'System lists cannot be renamed',
          });
        }

        try {
          return await listsService.update(input.id, input.data, ctx.user.hiveId);
        } catch (e) {
          throw mapPrismaError(e, 'Failed to update list');
        }
      }),

    /**
     * Delete a list.
     * System lists cannot be deleted.
     * Creator can delete own list (DELETE_OWN); admins can delete any (DELETE_ANY).
     */
    delete: hiveProcedure.input(z.uuid()).mutation(async ({ ctx, input: id }) => {
      const list = await listsService.getById(id, ctx.user.hiveId);
      if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });

      if (list.systemKey) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'System lists cannot be deleted' });
      }

      await requireResourceAccess(
        ctx,
        ctx.tx,
        { type: 'list', ...list, groupId: list.groupId ?? undefined },
        'delete',
        LIST_PERMISSIONS
      );

      const removed = await listsService.remove(id, ctx.user.hiveId);
      if (!removed) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });
      return { success: true as const };
    }),

    // ── Field management ───────────────────────────────────────────────────

    /**
     * Add a field to a list.
     * Requires edit access on the list.
     */
    createField: hiveProcedure.input(createListFieldSchema).mutation(async ({ ctx, input }) => {
      const list = await listsService.getById(input.listId, ctx.user.hiveId);
      if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });

      await requireResourceAccess(
        ctx,
        ctx.tx,
        { type: 'list', ...list, groupId: list.groupId ?? undefined },
        'edit',
        LIST_PERMISSIONS
      );

      try {
        return await listsService.createField(input.listId, ctx.user.hiveId, {
          fieldType: input.fieldType,
          name: sanitizeHtml(input.name),
          config: input.config as Record<string, unknown>,
          isRequired: input.isRequired,
          isTitle: input.isTitle,
        });
      } catch (e) {
        throw mapPrismaError(e, 'Failed to create field');
      }
    }),

    /**
     * Update a field.
     * Requires edit access on the parent list.
     */
    updateField: hiveProcedure
      .input(z.object({ id: z.uuid(), listId: z.uuid(), data: updateListFieldSchema }))
      .mutation(async ({ ctx, input }) => {
        const list = await listsService.getById(input.listId, ctx.user.hiveId);
        if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });

        await requireResourceAccess(
          ctx,
          ctx.tx,
          { type: 'list', ...list, groupId: list.groupId ?? undefined },
          'edit',
          LIST_PERMISSIONS
        );

        try {
          return await listsService.updateField(input.id, input.listId, ctx.user.hiveId, {
            name: input.data.name ? sanitizeHtml(input.data.name) : undefined,
            config: input.data.config as Record<string, unknown> | undefined,
            isRequired: input.data.isRequired,
            sortOrder: input.data.sortOrder,
          });
        } catch (e) {
          throw mapPrismaError(e, 'Failed to update field');
        }
      }),

    /**
     * Delete a field.
     * Requires edit access on the parent list.
     */
    deleteField: hiveProcedure
      .input(z.object({ id: z.uuid(), listId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        const list = await listsService.getById(input.listId, ctx.user.hiveId);
        if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });

        await requireResourceAccess(
          ctx,
          ctx.tx,
          { type: 'list', ...list, groupId: list.groupId ?? undefined },
          'edit',
          LIST_PERMISSIONS
        );

        const removed = await listsService.removeField(input.id, input.listId);
        if (!removed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Field not found' });
        return { success: true as const };
      }),

    /**
     * Return configured options for a select-type field.
     * Used by the frontend to populate dropdown suggestions (Notion-style).
     * Requires view access on the parent list.
     */
    getSelectOptions: hiveProcedure
      .input(z.object({ fieldId: z.uuid(), listId: z.uuid() }))
      .query(async ({ ctx, input }) => {
        const list = await listsService.getById(input.listId, ctx.user.hiveId);
        if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });

        await requireResourceAccess(
          ctx,
          ctx.tx,
          { type: 'list', ...list, groupId: list.groupId ?? undefined },
          'view',
          LIST_PERMISSIONS
        );

        return listsService.getSelectOptions(input.fieldId, input.listId);
      }),

    // ── View management ────────────────────────────────────────────────────

    /**
     * Create a view for a list.
     * Requires edit access on the list.
     */
    createView: hiveProcedure.input(createListViewSchema).mutation(async ({ ctx, input }) => {
      const list = await listsService.getById(input.listId, ctx.user.hiveId);
      if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });

      await requireResourceAccess(
        ctx,
        ctx.tx,
        { type: 'list', ...list, groupId: list.groupId ?? undefined },
        'edit',
        LIST_PERMISSIONS
      );

      try {
        return await listsService.createView(input.listId, ctx.user.hiveId, {
          name: sanitizeHtml(input.name),
          viewType: input.viewType,
          config: input.config as Record<string, unknown>,
          filter: input.filter as Record<string, unknown> | undefined,
          sortBy: input.sortBy as Array<{ fieldId: string; direction: string }> | undefined,
          isDefault: input.isDefault,
        });
      } catch (e) {
        throw mapPrismaError(e, 'Failed to create view');
      }
    }),

    /**
     * Update a view.
     * Requires edit access on the parent list.
     */
    updateView: hiveProcedure
      .input(z.object({ id: z.uuid(), listId: z.uuid(), data: updateListViewSchema }))
      .mutation(async ({ ctx, input }) => {
        const list = await listsService.getById(input.listId, ctx.user.hiveId);
        if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });

        await requireResourceAccess(
          ctx,
          ctx.tx,
          { type: 'list', ...list, groupId: list.groupId ?? undefined },
          'edit',
          LIST_PERMISSIONS
        );

        try {
          return await listsService.updateView(input.id, input.listId, ctx.user.hiveId, {
            name: input.data.name ? sanitizeHtml(input.data.name) : undefined,
            config: input.data.config as Record<string, unknown> | undefined,
            filter:
              'filter' in input.data
                ? (input.data.filter as Record<string, unknown> | null | undefined)
                : undefined,
            sortBy:
              'sortBy' in input.data
                ? (input.data.sortBy as
                    | Array<{ fieldId: string; direction: string }>
                    | null
                    | undefined)
                : undefined,
            isDefault: input.data.isDefault,
          });
        } catch (e) {
          throw mapPrismaError(e, 'Failed to update view');
        }
      }),

    /**
     * Delete a view.
     * Requires edit access on the parent list.
     */
    deleteView: hiveProcedure
      .input(z.object({ id: z.uuid(), listId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        const list = await listsService.getById(input.listId, ctx.user.hiveId);
        if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });

        await requireResourceAccess(
          ctx,
          ctx.tx,
          { type: 'list', ...list, groupId: list.groupId ?? undefined },
          'edit',
          LIST_PERMISSIONS
        );

        const removed = await listsService.removeView(input.id, input.listId);
        if (!removed) throw new TRPCError({ code: 'NOT_FOUND', message: 'View not found' });
        return { success: true as const };
      }),

    // ── Item management ────────────────────────────────────────────────────

    /**
     * List items in a list.
     * Requires view access on the list.
     */
    listItems: hiveProcedure.input(z.object({ listId: z.uuid() })).query(async ({ ctx, input }) => {
      const list = await listsService.getById(input.listId, ctx.user.hiveId);
      if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });

      await requireResourceAccess(
        ctx,
        ctx.tx,
        { type: 'list', ...list, groupId: list.groupId ?? undefined },
        'view',
        LIST_PERMISSIONS
      );

      return listsService.listItems(input.listId, ctx.user.hiveId);
    }),

    /**
     * Create an item in a list.
     * Requires: lists:create (or view access for shared lists)
     */
    createItem: hiveProcedure.input(createListItemSchema).mutation(async ({ ctx, input }) => {
      const list = await listsService.getById(input.listId, ctx.user.hiveId);
      if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });

      await requireResourceAccess(
        ctx,
        ctx.tx,
        { type: 'list', ...list, groupId: list.groupId ?? undefined },
        'edit',
        LIST_PERMISSIONS
      );

      const { personId, hiveId } = ctx.user;
      if (!personId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No person record found' });
      }

      try {
        return await listsService.createItem(
          input.listId,
          hiveId,
          personId,
          input.values as Record<string, unknown>
        );
      } catch (e) {
        throw mapPrismaError(e, 'Failed to create item');
      }
    }),

    /**
     * Update an item.
     * Creator can update their own item (UPDATE_OWN); admins can update any (UPDATE_ANY).
     */
    updateItem: hiveProcedure
      .input(z.object({ id: z.uuid(), data: updateListItemSchema }))
      .mutation(async ({ ctx, input }) => {
        // Load item to check ownership
        const items = await listsService.listItems(
          await getListIdForItem(ctx.user.hiveId, input.id, ctx.tx),
          ctx.user.hiveId
        );
        const item = items.find((i) => i.id === input.id);
        if (!item) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });

        const list = await listsService.getById(item.listId, ctx.user.hiveId);
        if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });

        await requireResourceAccess(
          ctx,
          ctx.tx,
          {
            type: 'list',
            ...list,
            groupId: list.groupId ?? undefined,
            // For OWN check: treat item creator as the relevant resource owner
            creatorId: item.creatorId,
          },
          'edit',
          LIST_PERMISSIONS
        );

        try {
          return await listsService.updateItem(input.id, ctx.user.hiveId, {
            values: input.data.values as Record<string, unknown> | undefined,
            sortOrder: input.data.sortOrder,
          });
        } catch (e) {
          throw mapPrismaError(e, 'Failed to update item');
        }
      }),

    /**
     * Bulk-reorder items within a list.
     *
     * The client is responsible for fractional-indexing arithmetic. When the
     * computed gap between neighbours falls below an acceptable epsilon
     * (typically < 1e-9), the client normalises all positions to integer
     * multiples (1000, 2000, …) and sends the full rebalanced list here.
     *
     * Requires: lists:edit on the list.
     */
    reorderItems: hiveProcedure.input(reorderListItemsSchema).mutation(async ({ ctx, input }) => {
      const list = await listsService.getById(input.listId, ctx.user.hiveId);
      if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });

      await requireResourceAccess(
        ctx,
        ctx.tx,
        { type: 'list', ...list, groupId: list.groupId ?? undefined },
        'edit',
        LIST_PERMISSIONS
      );

      await listsService.reorderItems(input.listId, ctx.user.hiveId, input.items);
      return { success: true as const };
    }),

    /**
     * Delete an item.
     * Creator can delete own item; admins can delete any.
     */
    deleteItem: hiveProcedure.input(z.uuid()).mutation(async ({ ctx, input: id }) => {
      const listId = await getListIdForItem(ctx.user.hiveId, id, ctx.tx);
      const list = await listsService.getById(listId, ctx.user.hiveId);
      if (!list) throw new TRPCError({ code: 'NOT_FOUND', message: 'List not found' });

      // Load item for creator check
      const itemRow = await ctx.tx.listItem.findFirst({
        where: { id, hiveId: ctx.user.hiveId },
        select: { creatorId: true },
      });
      if (!itemRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });

      await requireResourceAccess(
        ctx,
        ctx.tx,
        {
          type: 'list',
          ...list,
          groupId: list.groupId ?? undefined,
          creatorId: itemRow.creatorId,
        },
        'delete',
        LIST_PERMISSIONS
      );

      const removed = await listsService.removeItem(id, ctx.user.hiveId);
      if (!removed) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
      return { success: true as const };
    }),

    // ── Templates ──────────────────────────────────────────────────────────

    /**
     * List available templates (system + hive-specific).
     * Requires: lists:view
     */
    listTemplates: hiveProcedure.query(async ({ ctx }) => {
      requirePermission(ctx, HivePermission.LISTS_VIEW);
      return listsService.listTemplates(ctx.user.hiveId);
    }),
  });

export type ListsRouter = ReturnType<typeof listsRouter>;

// ============================================
// HELPERS
// ============================================

function mapPrismaError(e: unknown, fallbackMessage: string): TRPCError {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2025') {
      return new TRPCError({ code: 'NOT_FOUND', message: 'Record not found' });
    }
    return new TRPCError({ code: 'BAD_REQUEST', message: fallbackMessage });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected error' });
}

/** Look up the listId for a given item ID (needed for authorization). */
async function getListIdForItem(
  hiveId: string,
  itemId: string,
  tx: TransactionClient
): Promise<string> {
  const row = await tx.listItem.findFirst({
    where: { id: itemId, hiveId },
    select: { listId: true },
  });
  if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Item not found' });
  return row.listId;
}
