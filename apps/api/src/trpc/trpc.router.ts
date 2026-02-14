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
export const hiveProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.user?.hiveId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Missing hive context' });
  }

  // Set RLS session variables
  await ctx.prisma.setHiveSchema(ctx.user.hiveId, ctx.user.id);

  // Parallel-fetch hive type, person role, and per-hive role permission overrides.
  // All hive overrides are loaded without a role filter so the query can run in parallel
  // (role is unknown until the person query completes). In-memory role filtering follows.
  // hive_role_permissions is a sparse RBAC config table — typically 0-20 rows per hive.
  const [hive, person, allHiveOverrides] = await Promise.all([
    ctx.prisma.hive.findUnique({
      where: { id: ctx.user.hiveId },
      select: { type: true },
    }),
    ctx.user.personId
      ? ctx.prisma.person.findUnique({
          where: { id: ctx.user.personId },
          select: { role: true },
        })
      : null,
    ctx.prisma.hiveRolePermission.findMany({
      where: { hiveId: ctx.user.hiveId },
      select: { role: true, permission: true, granted: true },
    }),
  ]);

  const personRole = person?.role ?? undefined;

  // Filter overrides to only those relevant for this person's role
  const roleOverrides = allHiveOverrides
    .filter((o) => o.role === personRole)
    .map(({ permission, granted }) => ({ permission, granted }));

  return next({
    ctx: {
      ...ctx,
      user: {
        ...ctx.user,
        hiveType: hive?.type,
        role: personRole,
        roleOverrides,
      },
    },
  });
});
