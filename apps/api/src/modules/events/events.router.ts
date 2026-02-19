import { Prisma } from '@prisma/client';
import { HivePermission } from '@qoomb/types';
import {
  eventIdSchema,
  createEventSchema,
  updateEventSchema,
  listEventsSchema,
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

import { type EventsService } from './events.service';

// ============================================
// PERMISSION CONSTANTS
// ============================================

/**
 * Permission mapping for event resource access checks.
 * Used by requireResourceAccess for the full 5-stage visibility + share resolution.
 */
const EVENT_PERMISSIONS: ResourcePermissions = {
  view: HivePermission.EVENTS_VIEW,
  edit: HivePermission.EVENTS_UPDATE_ANY,
  editOwn: HivePermission.EVENTS_UPDATE_OWN,
  delete: HivePermission.EVENTS_DELETE_ANY,
  deleteOwn: HivePermission.EVENTS_DELETE_OWN,
};

// ============================================
// ROUTER
// ============================================

export const eventsRouter = (eventsService: EventsService) =>
  router({
    /**
     * List events visible to the current user.
     *
     * Uses buildVisibilityFilter() which includes:
     * - Role-based visibility (hive / admins / group / private:own)
     * - Share-based visibility (personal shares + group shares)
     *
     * Requires: events:view
     */
    list: hiveProcedure.input(listEventsSchema).query(async ({ ctx, input }) => {
      requirePermission(ctx, HivePermission.EVENTS_VIEW);

      // Pre-query share IDs (PersonShare/GroupShare are polymorphic — no Prisma relations)
      const sharedIds = await getSharedResourceIds(
        ctx.prisma,
        'event',
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
        HivePermission.EVENTS_VIEW,
        sharedIds
      );

      return eventsService.list(ctx.user.hiveId, visibilityFilter as Prisma.EventWhereInput, {
        startAt: input.startAt ? new Date(input.startAt) : undefined,
        endAt: input.endAt ? new Date(input.endAt) : undefined,
        groupId: input.groupId,
      });
    }),

    /**
     * Get a single event by ID.
     * Full 5-stage resource access check (role + shares + visibility).
     * Requires: events:view (at minimum)
     */
    get: hiveProcedure.input(eventIdSchema).query(async ({ ctx, input: id }) => {
      const event = await eventsService.getById(id, ctx.user.hiveId);
      if (!event) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
      }
      await requireResourceAccess(
        ctx,
        ctx.prisma,
        { type: 'event', ...event, groupId: event.groupId ?? undefined },
        'view',
        EVENT_PERMISSIONS
      );
      return event;
    }),

    /**
     * Create a new event.
     * Sensitive text fields (title, description, location, url, category) are encrypted at rest.
     * Requires: events:create
     */
    create: hiveProcedure.input(createEventSchema).mutation(async ({ ctx, input }) => {
      requirePermission(ctx, HivePermission.EVENTS_CREATE);

      const { personId, hiveId } = ctx.user;
      if (!personId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'No person record found' });
      }

      // Re-validate time ordering (Zod refine runs at parse time, this is a belt-and-suspenders check)
      const startAt = new Date(input.startAt);
      const endAt = new Date(input.endAt);
      if (endAt <= startAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'End time must be after start time' });
      }

      try {
        return await eventsService.create(
          {
            title: sanitizeHtml(input.title),
            description: input.description ? sanitizeHtml(input.description) : undefined,
            startAt,
            endAt,
            allDay: input.allDay,
            location: input.location ? sanitizeHtml(input.location) : undefined,
            url: input.url ?? undefined,
            color: input.color ?? undefined,
            category: input.category ? sanitizeHtml(input.category) : undefined,
            visibility: input.visibility,
            groupId: input.groupId ?? undefined,
            recurrenceRule: input.recurrenceRule,
          },
          hiveId,
          personId
        );
      } catch (e) {
        throw mapPrismaError(e, 'Failed to create event');
      }
    }),

    /**
     * Update an existing event.
     * Creator can edit their own events (UPDATE_OWN); admins/managers can edit any (UPDATE_ANY).
     * Full 5-stage resource access check applied.
     */
    update: hiveProcedure
      .input(z.object({ id: eventIdSchema, data: updateEventSchema }))
      .mutation(async ({ ctx, input }) => {
        const event = await eventsService.getById(input.id, ctx.user.hiveId);
        if (!event) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
        }
        await requireResourceAccess(
          ctx,
          ctx.prisma,
          { type: 'event', ...event, groupId: event.groupId ?? undefined },
          'edit',
          EVENT_PERMISSIONS
        );

        // If both start and end are provided, validate ordering
        const startAt = input.data.startAt ? new Date(input.data.startAt) : undefined;
        const endAt = input.data.endAt ? new Date(input.data.endAt) : undefined;
        if (startAt && endAt && endAt <= startAt) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'End time must be after start time',
          });
        }

        try {
          return await eventsService.update(
            input.id,
            {
              ...(input.data.title !== undefined && {
                title: sanitizeHtml(input.data.title),
              }),
              ...('description' in input.data && {
                description: input.data.description ? sanitizeHtml(input.data.description) : null,
              }),
              startAt,
              endAt,
              ...(input.data.allDay !== undefined && { allDay: input.data.allDay }),
              ...('location' in input.data && {
                location: input.data.location ? sanitizeHtml(input.data.location) : null,
              }),
              ...('url' in input.data && { url: input.data.url ?? null }),
              ...('color' in input.data && { color: input.data.color ?? null }),
              ...('category' in input.data && {
                category: input.data.category ? sanitizeHtml(input.data.category) : null,
              }),
              ...(input.data.visibility !== undefined && { visibility: input.data.visibility }),
              ...('groupId' in input.data && { groupId: input.data.groupId ?? null }),
              ...('recurrenceRule' in input.data && {
                recurrenceRule:
                  (input.data.recurrenceRule as Record<string, unknown> | null) ?? null,
              }),
            },
            ctx.user.hiveId
          );
        } catch (e) {
          throw mapPrismaError(e, 'Failed to update event');
        }
      }),

    /**
     * Delete an event.
     * Creator can delete their own events (DELETE_OWN); admins/managers can delete any (DELETE_ANY).
     */
    delete: hiveProcedure.input(eventIdSchema).mutation(async ({ ctx, input: id }) => {
      const event = await eventsService.getById(id, ctx.user.hiveId);
      if (!event) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
      }
      await requireResourceAccess(
        ctx,
        ctx.prisma,
        { type: 'event', ...event, groupId: event.groupId ?? undefined },
        'delete',
        EVENT_PERMISSIONS
      );

      const removed = await eventsService.remove(id, ctx.user.hiveId);
      if (!removed) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
      }
      return { success: true as const };
    }),
  });

export type EventsRouter = ReturnType<typeof eventsRouter>;

// ============================================
// HELPERS
// ============================================

/**
 * Maps Prisma errors to appropriate TRPCErrors.
 * P2025 → NOT_FOUND (record not found)
 * Unknown → INTERNAL_SERVER_ERROR
 */
function mapPrismaError(e: unknown, fallbackMessage: string): TRPCError {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2025') {
      return new TRPCError({ code: 'NOT_FOUND', message: 'Event not found' });
    }
    return new TRPCError({ code: 'BAD_REQUEST', message: fallbackMessage });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected error' });
}
