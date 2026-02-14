import { type HivePermission, hasPermissionWithOverrides } from '@qoomb/types';
import { TRPCError } from '@trpc/server';

import { type TrpcContext } from '../../trpc/trpc.context';

/**
 * Asserts that the current user has the given permission in their hive,
 * applying any per-hive DB overrides on top of the global role defaults.
 *
 * Call this inside hiveProcedure handlers after ctx.user.hiveType and ctx.user.role
 * have been populated by the hiveProcedure middleware.
 *
 * Use for operations without a specific resource ID (e.g. create, list).
 * For operations on a specific resource, use requireResourceAccess instead.
 *
 * @throws TRPCError FORBIDDEN if the permission is not held
 */
export function requirePermission(ctx: TrpcContext, permission: HivePermission): void {
  const { hiveType, role, roleOverrides = [] } = ctx.user ?? {};

  if (
    !hiveType ||
    !role ||
    !hasPermissionWithOverrides(hiveType, role, permission, roleOverrides)
  ) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Insufficient permissions',
    });
  }
}

/**
 * Asserts that the current user can perform an action on a resource,
 * either because they hold the unrestricted ("any") permission,
 * or because they hold the ownership ("own") permission AND are the creator.
 *
 * Applies per-hive DB overrides on top of global role defaults.
 *
 * Use for quick pre-checks before loading a resource. For full visibility
 * and share resolution on a loaded resource, use requireResourceAccess instead.
 *
 * @param anyPermission     - Permission that allows acting on any resource (e.g. EVENTS_UPDATE_ANY)
 * @param ownPermission     - Permission that allows acting on own resources only (e.g. EVENTS_UPDATE_OWN)
 * @param resourceCreatorId - personId of the resource creator
 *
 * @throws TRPCError FORBIDDEN if neither condition is met
 */
export function requirePermissionOrOwnership(
  ctx: TrpcContext,
  anyPermission: HivePermission,
  ownPermission: HivePermission,
  resourceCreatorId: string
): void {
  const { hiveType, role, roleOverrides = [], personId } = ctx.user ?? {};

  if (!hiveType || !role) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Insufficient permissions',
    });
  }

  if (hasPermissionWithOverrides(hiveType, role, anyPermission, roleOverrides)) {
    return;
  }

  if (
    hasPermissionWithOverrides(hiveType, role, ownPermission, roleOverrides) &&
    personId === resourceCreatorId
  ) {
    return;
  }

  throw new TRPCError({
    code: 'FORBIDDEN',
    message: 'Insufficient permissions',
  });
}
