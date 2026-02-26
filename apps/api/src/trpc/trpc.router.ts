import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';

import { type TrpcContext } from './trpc.context';

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape }) {
    return shape;
  },
});

// Base router and procedure
export const router = t.router;
export const publicProcedure = t.procedure;

// Protected procedure - requires authentication
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'Not authenticated',
    });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// Middleware to set hive schema context with RLS enforcement,
// and eagerly fetch hiveType + person.role for permission checks.
//
// SECURITY: Wraps the entire downstream handler in a Prisma interactive
// transaction so that SET LOCAL app.hive_id is pinned to a single DB
// connection for the whole request.  The transaction client is exposed as
// ctx.tx — guards and routers should use ctx.tx for hive-scoped queries
// to guarantee the correct RLS context.
export const hiveProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user?.hiveId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing hive context' });
  }

  const hiveId = ctx.user.hiveId;
  const userId = ctx.user.id;

  // Validate UUIDs before entering the transaction (fail fast)
  await ctx.prisma.setHiveSchemaValidation(hiveId, userId);

  // Open an interactive transaction that pins a single DB connection.
  // SET LOCAL scopes the variable to this transaction — it's automatically
  // reset when the transaction completes, so no pool contamination.
  return ctx.prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.hive_id = '${hiveId}'`);
      await tx.$executeRawUnsafe(`SET LOCAL app.user_id = '${userId}'`);

      // Parallel-fetch hive type, person role, per-hive permission overrides,
      // and group memberships — all on the same pinned connection.
      const [hive, person, allHiveOverrides, groupMemberships] = await Promise.all([
        tx.hive.findUnique({
          where: { id: hiveId },
          select: { type: true },
        }),
        ctx.user.personId
          ? tx.person.findUnique({
              where: { id: ctx.user.personId },
              select: { role: true },
            })
          : null,
        tx.hiveRolePermission.findMany({
          where: { hiveId },
          select: { role: true, permission: true, granted: true },
        }),
        ctx.user.personId
          ? tx.hiveGroupMember.findMany({
              where: { personId: ctx.user.personId, hiveId },
              select: { groupId: true },
            })
          : [],
      ]);

      const personRole = person?.role ?? undefined;

      const roleOverrides = allHiveOverrides
        .filter((o) => o.role === personRole)
        .map(({ permission, granted }) => ({ permission, granted }));

      const groupIds = groupMemberships.map(({ groupId }) => groupId);

      // Pass both the transaction client (tx) and the enriched user context
      // downstream.  Route handlers use ctx.tx for hive-scoped queries.
      return next({
        ctx: {
          ...ctx,
          tx,
          user: {
            ...ctx.user,
            hiveType: hive?.type,
            role: personRole,
            roleOverrides,
            groupIds,
          },
        },
      });
    },
    { timeout: 15_000 } // 15s — generous for API requests
  );
});
