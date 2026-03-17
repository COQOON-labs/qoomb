import { HivePermission } from '@qoomb/types';
import { updateHiveSchema, deleteHiveSchema, sanitizeHtml } from '@qoomb/validators';
import { TRPCError } from '@trpc/server';

import { requirePermission } from '../../common/guards';
import { router, hiveProcedure } from '../../trpc/trpc.router';

import { type HiveService } from './hive.service';

// ============================================
// ROUTER
// ============================================

export const hiveRouter = (hiveService: HiveService) =>
  router({
    /**
     * Get the current hive's details.
     * Every authenticated hive member can read hive info.
     * Requires: members:view (any member has this)
     */
    get: hiveProcedure.query(async ({ ctx }) => {
      requirePermission(ctx, HivePermission.MEMBERS_VIEW);

      const hive = await hiveService.getById(ctx.user.hiveId);
      if (!hive) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Hive not found' });
      }
      return hive;
    }),

    /**
     * Update hive name, locale, and/or settings.
     * Requires: hive:update (admins only)
     */
    update: hiveProcedure.input(updateHiveSchema).mutation(async ({ ctx, input }) => {
      requirePermission(ctx, HivePermission.HIVE_UPDATE);

      const hive = await hiveService.update(
        {
          name: input.name ? sanitizeHtml(input.name) : undefined,
          locale: input.locale,
          settings: input.settings,
        },
        ctx.user.hiveId
      );

      return hive;
    }),

    /**
     * Delete the hive and all its data (irreversible).
     * Requires explicit confirmation string ("DELETE").
     * Requires: hive:delete (admins only)
     */
    delete: hiveProcedure.input(deleteHiveSchema).mutation(async ({ ctx, input }) => {
      requirePermission(ctx, HivePermission.HIVE_DELETE);

      // Confirmation already validated by Zod (must equal "DELETE")
      void input.confirmation;

      const removed = await hiveService.remove(ctx.user.hiveId);
      if (!removed) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Hive not found' });
      }
      return { success: true as const };
    }),
  });

export type HiveRouter = ReturnType<typeof hiveRouter>;
