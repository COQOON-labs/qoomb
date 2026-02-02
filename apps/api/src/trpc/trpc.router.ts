import { initTRPC, TRPCError } from '@trpc/server';
import { TrpcContext } from './trpc.context';
import superjson from 'superjson';

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

// Middleware to set hive schema context
export const hiveProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user?.hiveId) {
    await ctx.prisma.setHiveSchema(ctx.user.hiveId);
  }

  return next({ ctx });
});
