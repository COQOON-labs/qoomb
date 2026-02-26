import {
  AccessLevel,
  type HivePermission,
  hasPermissionWithOverrides,
  isAdminRole,
} from '@qoomb/types';
import { TRPCError } from '@trpc/server';

import { type PrismaService, type TransactionClient } from '../../prisma/prisma.service';
import { type TrpcContext } from '../../trpc/trpc.context';

/**
 * Database client type accepted by guard functions.
 * Allows passing either the full PrismaService singleton or a
 * transaction client from hiveProcedure (ctx.tx).
 */
type DbClient = PrismaService | TransactionClient;

// ============================================
// TYPES
// ============================================

export type ResourceAccessAction = 'view' | 'edit' | 'delete';

/** Required AccessLevel for each action. Higher level implies lower. */
const REQUIRED_LEVEL: Record<ResourceAccessAction, AccessLevel> = {
  view: AccessLevel.VIEW,
  edit: AccessLevel.EDIT,
  delete: AccessLevel.MANAGE,
};

export interface ResourceAccessInput {
  /** Resource type string, e.g. 'event' | 'task' | 'note' */
  type: string;
  /** UUID of the resource */
  id: string;
  /** personId of the resource creator */
  creatorId: string;
  /** Visibility setting: 'hive' | 'admins' | 'group' | 'private' */
  visibility: string;
  /** Required when visibility = 'group': the group this resource belongs to */
  groupId?: string;
}

/**
 * Resource-type-specific permissions passed by the caller (for role-based checks).
 * Used only for 'hive' and 'admins' visibility types where role-based access applies.
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
 * Resolution order:
 *   1. Load personal + group shares in parallel
 *      → effectiveShareLevel = max of all applicable shares (0 if none)
 *   2. visibility = 'private'
 *      → allow if creator OR effectiveShareLevel >= required
 *   3. visibility = 'group'
 *      → allow if creator OR (group member + action = view) OR effectiveShareLevel >= required
 *   4. visibility = 'admins'
 *      → allow if effectiveShareLevel >= required (explicit exception)
 *      → else require admin role, then fall through to role-based permission check
 *   5. visibility = 'hive' / 'admins' (admin confirmed)
 *      → allow if effectiveShareLevel >= required (additive)
 *      → else check role-based permission (ANY or OWN + creator)
 *
 * Key design decisions:
 * - Shares are ADDITIVE for 'hive'/'admins': they can only elevate, never restrict
 * - Shares are EXCLUSIVE for 'group'/'private': the only access path besides membership/creator
 * - No admin bypass for 'private': even parent/org_admin require a share or being the creator
 * - For 'group' resources, admins gain access by joining the group (visible in audit log)
 *
 * @throws TRPCError FORBIDDEN if access is denied
 */
export async function requireResourceAccess(
  ctx: TrpcContext,
  db: DbClient,
  resource: ResourceAccessInput,
  action: ResourceAccessAction,
  permissions: ResourcePermissions
): Promise<void> {
  const { hiveType, role, roleOverrides = [], personId, groupIds = [], hiveId } = ctx.user ?? {};

  // Fail-closed: missing context always denies
  if (!hiveType || !role || !personId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
  }

  const requiredLevel = REQUIRED_LEVEL[action];
  const groupIdsArr = [...groupIds];

  // Stage 1: Load personal share + all applicable group shares in parallel.
  // Defense-in-depth: filter by hiveId even though RLS already enforces this.
  const [personalShare, groupShareRows] = await Promise.all([
    db.personShare.findFirst({
      where: { resourceType: resource.type, resourceId: resource.id, personId, hiveId },
      select: { accessLevel: true },
    }),
    groupIdsArr.length > 0
      ? db.groupShare.findMany({
          where: {
            resourceType: resource.type,
            resourceId: resource.id,
            groupId: { in: groupIdsArr },
            hiveId,
          },
          select: { accessLevel: true },
        })
      : Promise.resolve([]),
  ]);

  // Effective share = max level across all applicable shares (0 if none)
  const effectiveShareLevel = Math.max(
    0,
    ...(personalShare ? [personalShare.accessLevel] : []),
    ...groupShareRows.map((s) => s.accessLevel)
  );

  const required = requiredLevel as number;

  // Stage 2: visibility = 'private' → creator OR share
  if (resource.visibility === 'private') {
    if (personId === resource.creatorId || effectiveShareLevel >= required) return;
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
  }

  // Stage 3: visibility = 'group' → creator OR group member (VIEW only) OR share
  // Admin bypass does NOT apply: admins join the group to gain access (auditable).
  if (resource.visibility === 'group') {
    if (personId === resource.creatorId) return;
    const isMember =
      resource.groupId !== null &&
      resource.groupId !== undefined &&
      groupIdsArr.includes(resource.groupId);
    if (isMember && (requiredLevel as number) <= (AccessLevel.VIEW as number)) return;
    if (effectiveShareLevel >= required) return;
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
  }

  // Stage 4: visibility = 'admins' → share grants exception, else require admin role
  if (resource.visibility === 'admins') {
    if (effectiveShareLevel >= required) return;
    if (!isAdminRole(hiveType, role)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Insufficient permissions' });
    }
    // Admin confirmed — fall through to Stage 5 for role-based permission check
  }

  // Stage 5: visibility = 'hive' or 'admins' (admin confirmed above)
  // Shares are additive: a share can elevate access beyond the role baseline.
  if (effectiveShareLevel >= required) return;

  // Role-based permission check with per-hive DB overrides applied
  const anyPermission = permissions[action];
  const ownPermission =
    action === 'edit'
      ? permissions.editOwn
      : action === 'delete'
        ? permissions.deleteOwn
        : undefined;

  if (hasPermissionWithOverrides(hiveType, role, anyPermission, roleOverrides)) return;

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
  groupIds: ReadonlyArray<string>;
}

/**
 * Builds a Prisma WHERE filter that encodes the same visibility logic as
 * requireResourceAccess for VIEW access, suitable for findMany / search queries.
 *
 * Use this instead of calling requireResourceAccess per result (which would N+1).
 * The filter is also compatible with pgvector search queries (Phase 4).
 *
 * Share-based visibility uses pre-queried resource IDs (`sharedResourceIds`)
 * because PersonShare/GroupShare are polymorphic (no FK to Event/Task), so
 * Prisma relation-based filtering (`personShares: { some: ... }`) is not possible.
 * The caller queries the share tables first and passes the IDs here.
 *
 * @param ctx                - Populated from hiveProcedure context (user.*)
 * @param viewPermission     - The view permission for this resource type (e.g. EVENTS_VIEW)
 * @param sharedResourceIds  - Resource IDs the user has access to via personal or group shares
 *                             (pre-queried by the caller from PersonShare/GroupShare tables)
 *
 * @example
 * ```typescript
 * // 1. Pre-query share IDs (in the router)
 * const sharedIds = await getSharedResourceIds(ctx.tx, 'event', personId, groupIds);
 *
 * // 2. Build filter
 * const filter = buildVisibilityFilter(ctx.user, HivePermission.EVENTS_VIEW, sharedIds);
 *
 * // 3. Use in query
 * const events = await ctx.prisma.event.findMany({
 *   where: { hiveId: ctx.user.hiveId, ...filter },
 * });
 * ```
 */
export function buildVisibilityFilter(
  ctx: VisibilityFilterContext,
  viewPermission: HivePermission,
  sharedResourceIds: string[] = []
): { OR: unknown[] } {
  const { personId, hiveType, role, roleOverrides, groupIds } = ctx;
  const groupIdsArr = [...groupIds];

  const canViewAll = hasPermissionWithOverrides(hiveType, role, viewPermission, roleOverrides);
  const isAdmin = isAdminRole(hiveType, role);

  return {
    OR: [
      // 'hive': role has the view permission
      ...(canViewAll ? [{ visibility: 'hive' }] : []),

      // 'admins': admin role AND has view permission (admin role ≠ automatic access)
      ...(isAdmin && canViewAll ? [{ visibility: 'admins' }] : []),

      // 'group': person is a member of the resource's group
      ...(groupIdsArr.length > 0 ? [{ visibility: 'group', groupId: { in: groupIdsArr } }] : []),

      // 'private': own resources only
      { visibility: 'private', creatorId: personId },

      // Any visibility: resource IDs the user has access to via personal or group shares
      // (pre-queried by the caller from the polymorphic PersonShare/GroupShare tables)
      ...(sharedResourceIds.length > 0 ? [{ id: { in: sharedResourceIds } }] : []),
    ],
  };
}

/**
 * Pre-queries PersonShare + GroupShare tables to find all resource IDs
 * the user has at least VIEW access to, for a given resource type.
 *
 * Use this before calling buildVisibilityFilter() to supply the sharedResourceIds param.
 *
 * @param db           - PrismaService or transaction client from hiveProcedure
 * @param resourceType - Polymorphic resource type string (e.g. 'event', 'task')
 * @param personId     - Current user's personId
 * @param groupIds     - Current user's group memberships
 * @returns Deduplicated array of resource UUIDs accessible via shares
 */
export async function getSharedResourceIds(
  db: DbClient,
  resourceType: string,
  personId: string,
  groupIds: ReadonlyArray<string>
): Promise<string[]> {
  const groupIdsArr = [...groupIds];

  const [personShares, groupShares] = await Promise.all([
    db.personShare.findMany({
      where: { personId, resourceType, accessLevel: { gte: AccessLevel.VIEW } },
      select: { resourceId: true },
    }),
    groupIdsArr.length > 0
      ? db.groupShare.findMany({
          where: {
            groupId: { in: groupIdsArr },
            resourceType,
            accessLevel: { gte: AccessLevel.VIEW },
          },
          select: { resourceId: true },
        })
      : [],
  ]);

  // Deduplicate IDs from both share sources
  const idSet = new Set<string>();
  for (const s of personShares) idSet.add(s.resourceId);
  for (const s of groupShares) idSet.add(s.resourceId);
  return [...idSet];
}
