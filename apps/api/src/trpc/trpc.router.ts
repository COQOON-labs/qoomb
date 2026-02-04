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

// Middleware to set hive schema context with RLS enforcement
export const hiveProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user?.hiveId) {
    // Set hive schema context AND user context for Row-Level Security
    await ctx.prisma.setHiveSchema(ctx.user.hiveId, ctx.user.id);
  }

  return next({ ctx });
});
