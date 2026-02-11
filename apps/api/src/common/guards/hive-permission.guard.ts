import { type HivePermission, hasPermission } from '@qoomb/types';
import { TRPCError } from '@trpc/server';

import { type TrpcContext } from '../../trpc/trpc.context';

/**
 * Asserts that the current user has the given permission in their hive.
 * Call this inside hiveProcedure handlers after ctx.user.hiveType and ctx.user.role
 * have been populated by the hiveProcedure middleware.
 *
 * @throws TRPCError FORBIDDEN if the permission is not held
 */
export function requirePermission(ctx: TrpcContext, permission: HivePermission): void {
  const { hiveType, role } = ctx.user ?? {};

  if (!hiveType || !role || !hasPermission(hiveType, role, permission)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Insufficient permissions',
    });
  }
}
