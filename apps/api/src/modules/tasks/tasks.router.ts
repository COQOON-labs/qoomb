import { Prisma } from '@prisma/client';
import { HivePermission } from '@qoomb/types';
import {
  taskIdSchema,
  createTaskSchema,
  updateTaskSchema,
  listTasksSchema,
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
import { router, hiveProcedure } from '../../trpc/trpc.router';

import { type TasksService } from './tasks.service';

// ============================================
// PERMISSION CONSTANTS
// ============================================

/**
 * Permission mapping for task resource access checks.
 * Used by requireResourceAccess for the full 5-stage visibility + share resolution.
 */
const TASK_PERMISSIONS: ResourcePermissions = {
  view: HivePermission.TASKS_VIEW,
  edit: HivePermission.TASKS_UPDATE_ANY,
  editOwn: HivePermission.TASKS_UPDATE_OWN,
  delete: HivePermission.TASKS_DELETE_ANY,
  deleteOwn: HivePermission.TASKS_DELETE_OWN,
};

// ============================================
// ROUTER
// ============================================

export const tasksRouter = (tasksService: TasksService) =>
  router({
    /**
     * List tasks visible to the current user.
     *
     * Uses buildVisibilityFilter() which includes:
     * - Role-based visibility (hive / admins / group / private:own)
     * - Share-based visibility (personal shares + group shares)
     *
     * Requires: tasks:view
     */
    list: hiveProcedure.input(listTasksSchema).query(async ({ ctx, input }) => {
      requirePermission(ctx, HivePermission.TASKS_VIEW);

      // Pre-query share IDs (PersonShare/GroupShare are polymorphic — no Prisma relations)
      const sharedIds = await getSharedResourceIds(
        ctx.prisma,
        'task',
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
        HivePermission.TASKS_VIEW,
        sharedIds
      );

      return tasksService.list(ctx.user.hiveId, visibilityFilter as Prisma.TaskWhereInput, {
        status: input.status,
        assigneeId: input.assigneeId,
        groupId: input.groupId,
        eventId: input.eventId,
        dueBefore: input.dueBefore ? new Date(input.dueBefore) : undefined,
        dueAfter: input.dueAfter ? new Date(input.dueAfter) : undefined,
      });
    }),

    /**
     * Get a single task by ID.
     * Full 5-stage resource access check (role + shares + visibility).
     */
    get: hiveProcedure.input(taskIdSchema).query(async ({ ctx, input: id }) => {
      const task = await tasksService.getById(id, ctx.user.hiveId);
      if (!task) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }
      await requireResourceAccess(
        ctx,
        ctx.prisma,
        { type: 'task', ...task, groupId: task.groupId ?? undefined },
        'view',
        TASK_PERMISSIONS
      );
      return task;
    }),

    /**
     * Create a new task.
     * title and description are encrypted at rest.
     * Requires: tasks:create
     */
    create: hiveProcedure.input(createTaskSchema).mutation(async ({ ctx, input }) => {
      requirePermission(ctx, HivePermission.TASKS_CREATE);

      const { personId, hiveId } = ctx.user;
      if (!personId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No person record found' });
      }

      try {
        return await tasksService.create(
          {
            title: sanitizeHtml(input.title),
            description: input.description ? sanitizeHtml(input.description) : undefined,
            assigneeId: input.assigneeId,
            eventId: input.eventId,
            dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
            status: input.status,
            priority: input.priority,
            visibility: input.visibility,
            groupId: input.groupId,
          },
          hiveId,
          personId
        );
      } catch (e) {
        throw mapPrismaError(e, 'Failed to create task');
      }
    }),

    /**
     * Update an existing task.
     * Creator can update their own tasks (UPDATE_OWN); admins/managers can update any (UPDATE_ANY).
     */
    update: hiveProcedure
      .input(z.object({ id: taskIdSchema, data: updateTaskSchema }))
      .mutation(async ({ ctx, input }) => {
        const task = await tasksService.getById(input.id, ctx.user.hiveId);
        if (!task) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
        }
        await requireResourceAccess(
          ctx,
          ctx.prisma,
          { type: 'task', ...task, groupId: task.groupId ?? undefined },
          'edit',
          TASK_PERMISSIONS
        );

        try {
          return await tasksService.update(
            input.id,
            {
              ...(input.data.title !== undefined && {
                title: sanitizeHtml(input.data.title),
              }),
              ...('description' in input.data && {
                description: input.data.description ? sanitizeHtml(input.data.description) : null,
              }),
              ...('assigneeId' in input.data && { assigneeId: input.data.assigneeId ?? null }),
              ...('eventId' in input.data && { eventId: input.data.eventId ?? null }),
              ...('dueAt' in input.data && {
                dueAt: input.data.dueAt ? new Date(input.data.dueAt) : null,
              }),
              ...('completedAt' in input.data && {
                completedAt: input.data.completedAt ? new Date(input.data.completedAt) : null,
              }),
              ...(input.data.status !== undefined && { status: input.data.status }),
              ...(input.data.priority !== undefined && { priority: input.data.priority }),
              ...(input.data.visibility !== undefined && { visibility: input.data.visibility }),
              ...('groupId' in input.data && { groupId: input.data.groupId ?? null }),
            },
            ctx.user.hiveId
          );
        } catch (e) {
          throw mapPrismaError(e, 'Failed to update task');
        }
      }),

    /**
     * Mark a task as complete.
     * Shorthand for update with status='done' and completedAt=now.
     * Requires the same edit permission as update.
     */
    complete: hiveProcedure
      .input(z.object({ id: taskIdSchema, completedAt: z.string().datetime().optional() }))
      .mutation(async ({ ctx, input }) => {
        const task = await tasksService.getById(input.id, ctx.user.hiveId);
        if (!task) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
        }
        await requireResourceAccess(
          ctx,
          ctx.prisma,
          { type: 'task', ...task, groupId: task.groupId ?? undefined },
          'edit',
          TASK_PERMISSIONS
        );

        const completedAt = input.completedAt ? new Date(input.completedAt) : new Date();

        try {
          return await tasksService.update(
            input.id,
            { status: 'done', completedAt },
            ctx.user.hiveId
          );
        } catch (e) {
          throw mapPrismaError(e, 'Failed to complete task');
        }
      }),

    /**
     * Delete a task.
     * Creator can delete their own tasks (DELETE_OWN); admins/managers can delete any (DELETE_ANY).
     */
    delete: hiveProcedure.input(taskIdSchema).mutation(async ({ ctx, input: id }) => {
      const task = await tasksService.getById(id, ctx.user.hiveId);
      if (!task) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }
      await requireResourceAccess(
        ctx,
        ctx.prisma,
        { type: 'task', ...task, groupId: task.groupId ?? undefined },
        'delete',
        TASK_PERMISSIONS
      );

      const removed = await tasksService.remove(id, ctx.user.hiveId);
      if (!removed) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
      }
      return { success: true as const };
    }),
  });

export type TasksRouter = ReturnType<typeof tasksRouter>;

// ============================================
// HELPERS
// ============================================

function mapPrismaError(e: unknown, fallbackMessage: string): TRPCError {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2025') {
      return new TRPCError({ code: 'NOT_FOUND', message: 'Task not found' });
    }
    return new TRPCError({ code: 'BAD_REQUEST', message: fallbackMessage });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected error' });
}
