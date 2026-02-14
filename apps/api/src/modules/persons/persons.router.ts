import { Prisma } from '@prisma/client';
import { HivePermission, VALID_ROLES_BY_HIVE_TYPE } from '@qoomb/types';
import {
  inviteMemberSchema,
  personIdSchema,
  sanitizeHtml,
  updatePersonProfileSchema,
  updatePersonRoleSchema,
} from '@qoomb/validators';
import { TRPCError } from '@trpc/server';

import { requirePermission } from '../../common/guards';
import { router, hiveProcedure } from '../../trpc/trpc.router';
import { type AuthService } from '../auth/auth.service';

import { type PersonsService } from './persons.service';

// ============================================
// ROUTER
// ============================================

export const personsRouter = (personsService: PersonsService, authService: AuthService) =>
  router({
    /**
     * Get the current user's own Person record in this hive.
     * Returns the full PersonDetail including userId (own data).
     * No special permission required — any authenticated hive member can call this.
     */
    me: hiveProcedure.query(async ({ ctx }) => {
      const { personId, hiveId } = ctx.user ?? {};
      if (!personId || !hiveId) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing person context' });
      }
      const person = await personsService.getById(personId, hiveId);
      if (!person) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Person not found' });
      }
      return person;
    }),

    /**
     * List all persons in the hive, ordered by join date.
     * Returns PersonSummary (no userId — userId is a global identifier not exposed publicly).
     * Requires: members:view
     */
    list: hiveProcedure.query(async ({ ctx }) => {
      requirePermission(ctx, HivePermission.MEMBERS_VIEW);
      return personsService.list(ctx.user.hiveId);
    }),

    /**
     * Get a specific person by ID.
     * Returns PersonPublicDetail (no userId — userId is a global identifier not exposed
     * for other members' records to prevent cross-hive correlation).
     * Requires: members:view
     */
    get: hiveProcedure.input(personIdSchema).query(async ({ ctx, input: personId }) => {
      requirePermission(ctx, HivePermission.MEMBERS_VIEW);
      const person = await personsService.getById(personId, ctx.user.hiveId);
      if (!person) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Person not found' });
      }
      // Strip userId — global identifier not exposed for other members' profiles
      const { userId: _userId, ...publicPerson } = person;
      return publicPerson;
    }),

    /**
     * Update the current user's own profile (displayName, avatarUrl, birthdate).
     * No special permission — any authenticated hive member can update their own profile.
     * Role changes are not allowed here — use updateRole for admin role changes.
     *
     * Security:
     * - displayName is sanitized (strip HTML tags) before storage
     * - avatarUrl validated as HTTPS-only by schema
     * - birthdate parsed safely with NaN guard
     */
    updateProfile: hiveProcedure
      .input(updatePersonProfileSchema)
      .mutation(async ({ ctx, input }) => {
        const { personId } = ctx.user ?? {};
        if (!personId) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing person context' });
        }

        const data: { displayName?: string; avatarUrl?: string; birthdate?: Date } = {};

        if (input.displayName !== undefined) {
          // Sanitize: strip HTML tags to prevent stored XSS
          data.displayName = sanitizeHtml(input.displayName);
        }
        if (input.avatarUrl !== undefined) {
          data.avatarUrl = input.avatarUrl;
        }
        if (input.birthdate !== undefined) {
          const parsed = new Date(input.birthdate);
          if (isNaN(parsed.getTime())) {
            throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid birthdate format' });
          }
          data.birthdate = parsed;
        }

        try {
          return await personsService.updateProfile(personId, ctx.user.hiveId, data);
        } catch (e) {
          throw mapPrismaError(e, 'Failed to update profile');
        }
      }),

    /**
     * Change a hive member's role. Admin-only (requires members:manage).
     * Validates that the new role is appropriate for this hive type.
     * Cannot change own role — ask another admin (prevents accidental privilege loss).
     * Cannot downgrade the last admin — enforced by DB trigger `enforce_minimum_admin`.
     *
     * Returns PersonPublicDetail (no userId — admin changing another person's role
     * should not receive the target's global identifier in the response).
     */
    updateRole: hiveProcedure.input(updatePersonRoleSchema).mutation(async ({ ctx, input }) => {
      requirePermission(ctx, HivePermission.MEMBERS_MANAGE);

      const hiveType = ctx.user?.hiveType;
      if (!hiveType) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
      }

      const validRoles = VALID_ROLES_BY_HIVE_TYPE[hiveType] ?? [];
      if (!validRoles.includes(input.role)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Role is not valid for this hive type',
        });
      }

      // Prevent self-role-changes to avoid accidental privilege loss.
      // If you need your own role changed, ask another admin.
      if (input.personId === ctx.user?.personId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'You cannot change your own role. Ask another admin.',
        });
      }

      try {
        const person = await personsService.updateRole(input.personId, ctx.user.hiveId, input.role);
        // Strip userId — global identifier not exposed for other members' profiles
        const { userId: _userId, ...publicPerson } = person;
        return publicPerson;
      } catch (e) {
        throw mapPrismaError(e, 'Failed to update role');
      }
    }),

    /**
     * Remove a member from the hive. Requires members:remove.
     * A member cannot remove themselves — use hive leave flow for that.
     * Cannot remove the last admin — enforced by DB trigger `enforce_minimum_admin`.
     *
     * Defense-in-depth: passes hiveId to service (explicit filter on top of RLS).
     */
    remove: hiveProcedure.input(personIdSchema).mutation(async ({ ctx, input: personId }) => {
      requirePermission(ctx, HivePermission.MEMBERS_REMOVE);

      if (personId === ctx.user?.personId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot remove yourself from the hive',
        });
      }

      try {
        const removed = await personsService.remove(personId, ctx.user.hiveId);
        if (!removed) {
          throw new TRPCError({ code: 'NOT_FOUND', message: 'Person not found' });
        }
        return { success: true as const };
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        throw mapPrismaError(e, 'Failed to remove member');
      }
    }),

    /**
     * Invite a new member to this hive by email.
     * Requires MEMBERS_INVITE permission.
     *
     * Sends an invitation email with a token that lets the recipient
     * register (or log in if they already have an account) and join the hive.
     *
     * Invited users receive the default role for the hive type
     * (parent for family, member for organization).
     */
    invite: hiveProcedure.input(inviteMemberSchema).mutation(async ({ ctx, input }) => {
      requirePermission(ctx, HivePermission.MEMBERS_INVITE);

      // Get inviter's display name for the email template
      const inviterPerson = await personsService.getById(ctx.user.personId!, ctx.user.hiveId);
      const inviterName = inviterPerson?.displayName ?? ctx.user.email ?? 'A hive member';

      try {
        await authService.inviteMemberToHive(
          ctx.user.id,
          inviterName,
          input.email,
          ctx.user.hiveId
        );
        return { success: true as const };
      } catch (e) {
        if (e instanceof TRPCError) throw e;
        // BadRequestException from auth service (e.g., already a member)
        const message = e instanceof Error ? e.message : 'Failed to send invitation';
        throw new TRPCError({ code: 'BAD_REQUEST', message });
      }
    }),
  });

export type PersonsRouter = ReturnType<typeof personsRouter>;

// ============================================
// HELPERS
// ============================================

/**
 * Maps Prisma errors to appropriate TRPCErrors.
 * P2025 → NOT_FOUND (record not found)
 * DB trigger violations → BAD_REQUEST (e.g., removing last admin)
 * Unknown → INTERNAL_SERVER_ERROR
 */
function mapPrismaError(e: unknown, fallbackMessage: string): TRPCError {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2025') {
      return new TRPCError({ code: 'NOT_FOUND', message: 'Person not found' });
    }
    return new TRPCError({ code: 'BAD_REQUEST', message: fallbackMessage });
  }
  if (e instanceof Prisma.PrismaClientUnknownRequestError) {
    // Likely a DB trigger violation (e.g., enforce_minimum_admin)
    return new TRPCError({ code: 'BAD_REQUEST', message: fallbackMessage });
  }
  return new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected error' });
}
