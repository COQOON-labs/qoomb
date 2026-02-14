import { type HivePermission, hasPermissionWithOverrides, isAdminRole } from '@qoomb/types';
import { TRPCError } from '@trpc/server';

import { type PrismaService } from '../../prisma/prisma.service';
import { type TrpcContext } from '../../trpc/trpc.context';

// ============================================
// TYPES
// ============================================

export type ResourceAccessAction = 'view' | 'edit' | 'delete';

export interface ResourceAccessInput {
  /** Resource type string, e.g. 'event' | 'task' | 'note' */
  type: string;
  /** UUID of the resource */
  id: string;
  /** personId of the resource creator */
  creatorId: string;
  /** Visibility setting: 'hive' | 'parents' | 'private' | 'shared' */
  visibility: string;
}

/**
 * Resource-type-specific permissions passed by the caller.
 * The caller provides permissions for all actions so the guard stays type-agnostic.
 *
 * Example for events:
 * ```typescript
 * const EVENT_PERMISSIONS: ResourcePermissions = {
 *   view:      HivePermission.EVENTS_VIEW,
 *   edit:      HivePermission.EVENTS_UPDATE_ANY,
 *   editOwn:   HivePermission.EVENTS_UPDATE_OWN,
 *   delete:    HivePermission.EVENTS_DELETE_ANY,
 *   deleteOwn: HivePermission.EVENTS_DELETE_OWN,
 * };
 * ```
 */
export interface ResourcePermissions {
  view: HivePermission;
  edit: HivePermission;
  /** Optional: permission to edit own resources only (e.g. EVENTS_UPDATE_OWN) */
  editOwn?: HivePermission;
  delete: HivePermission;
  /** Optional: permission to delete own resources only (e.g. EVENTS_DELETE_OWN) */
  deleteOwn?: HivePermission;
}

// ============================================
// RESOURCE ACCESS GUARD
// ============================================

/**
 * Asserts that the current user can perform the given action on a specific resource.
 *
 * Resolution order (first matching rule wins):
 *   1. Explicit ResourceShare for this person+resource → share.can* is the final answer
 *   2. visibility = 'private'  → creator has full control (no action permission check,
 *      no admin override — even parent/org_admin need a share)
 *   3. visibility = 'parents'  → must be admin role, then action permission is still checked
 *   4. visibility = 'hive', 'shared', or 'parents' (admin confirmed) → role-based with DB overrides
 *      a. Check anyPermission (e.g. UPDATE_ANY)
 *      b. Check ownPermission (e.g. UPDATE_OWN) + must be creator
 *
 * Key design decisions:
 * - Shares are EXCLUSIVE: if a share exists it is the final answer, role is not consulted.
 * - Private resources grant the creator full control (view/edit/delete) without
 *   action permission checks. "Your private stuff, your rules."
 * - The 'parents' visibility restricts WHO can act (admin roles only), not WHAT they can do.
 *   Action permissions (including per-hive overrides) are always enforced.
 *
 * @throws TRPCError FORBIDDEN if access is denied
 */
export async function requireResourceAccess(
  ctx: TrpcContext,
  prisma: PrismaService,
  resource: ResourceAccessInput,
  action: ResourceAccessAction,
  permissions: ResourcePermissions
): Promise<void> {
  const { hiveType, role, roleOverrides = [], personId } = ctx.user ?? {};

  // Fail-closed: missing context always denies
  if (!hiveType || !role || !personId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
  }

  // Stufe 1: Explicit ResourceShare for this person+resource
  // The share is the FINAL answer — no fallback to role if a share exists.
  // Defense-in-depth: filter by hiveId even though RLS should already enforce it.
  const hiveId = ctx.user?.hiveId;
  const share = await prisma.resourceShare.findFirst({
    where: {
      resourceType: resource.type,
      resourceId: resource.id,
      personId,
      hiveId,
    },
    select: { canView: true, canEdit: true, canDelete: true },
  });

  if (share !== null) {
    const allowed =
      (action === 'view' && share.canView) ||
      (action === 'edit' && share.canEdit) ||
      (action === 'delete' && share.canDelete);

    if (!allowed) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }

    return;
  }

  // Stufe 2: visibility = 'private' → only the creator
  // No admin override: even parent/org_admin need an explicit share.
  if (resource.visibility === 'private') {
    if (personId !== resource.creatorId) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }

    return;
  }

  // Stufe 3: visibility = 'parents' → must be admin role to proceed
  // Non-admins are denied immediately. Admins still need the action permission (Stufe 4).
  if (resource.visibility === 'parents') {
    if (!isAdminRole(hiveType, role)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }
    // Admin role confirmed — fall through to Stufe 4 for action permission check
  }

  // Stufe 4: visibility = 'hive', 'shared', or 'parents' (admin confirmed above)
  // → Role-based check with per-hive DB overrides applied.
  const anyPermission = permissions[action];
  const ownPermission =
    action === 'edit'
      ? permissions.editOwn
      : action === 'delete'
        ? permissions.deleteOwn
        : undefined;

  if (hasPermissionWithOverrides(hiveType, role, anyPermission, roleOverrides)) {
    return;
  }

  if (
    ownPermission !== undefined &&
    hasPermissionWithOverrides(hiveType, role, ownPermission, roleOverrides) &&
    personId === resource.creatorId
  ) {
    return;
  }

  throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
}

// ============================================
// VISIBILITY FILTER (for list / search queries)
// ============================================

export interface VisibilityFilterContext {
  personId: string;
  hiveType: string;
  role: string;
  roleOverrides: ReadonlyArray<{ permission: string; granted: boolean }>;
}

/**
 * Builds a Prisma WHERE filter that encodes the same visibility logic as
 * requireResourceAccess, suitable for findMany / search queries.
 *
 * Use this instead of calling requireResourceAccess per result (which would N+1).
 * The filter is also compatible with pgvector search queries (Phase 4).
 *
 * @param ctx            - Populated from hiveProcedure context (user.*)
 * @param viewPermission - The view permission for this resource type (e.g. EVENTS_VIEW)
 *
 * @example
 * ```typescript
 * const events = await ctx.prisma.event.findMany({
 *   where: {
 *     hiveId: ctx.user.hiveId,
 *     ...buildVisibilityFilter(ctx.user as VisibilityFilterContext, HivePermission.EVENTS_VIEW),
 *   },
 * });
 * ```
 */
export function buildVisibilityFilter(
  ctx: VisibilityFilterContext,
  viewPermission: HivePermission
): { OR: unknown[] } {
  const { personId, hiveType, role, roleOverrides } = ctx;

  const canViewAll = hasPermissionWithOverrides(hiveType, role, viewPermission, roleOverrides);
  const isAdmin = isAdminRole(hiveType, role);

  return {
    OR: [
      // 'hive' and 'shared' (no personal share): role-based access
      ...(canViewAll ? [{ visibility: 'hive' }, { visibility: 'shared' }] : []),

      // 'parents': admin roles WITH the view permission (admin != automatic access)
      ...(isAdmin && canViewAll ? [{ visibility: 'parents' }] : []),

      // 'private': only own resources
      { visibility: 'private', creatorId: personId },

      // Any visibility with an explicit view share for this person
      // (covers sharing into 'private', 'parents', 'hive', 'shared' resources)
      { resourceShares: { some: { personId, canView: true } } },
    ],
  };
}
