import { HivePermission } from '@qoomb/types';
import { listActivitySchema } from '@qoomb/validators';

import { requirePermission } from '../../common/guards';
import { router, hiveProcedure } from '../../trpc/trpc.router';

import { type ActivityService } from './activity.service';

// ============================================
// ROUTER
// ============================================

export const activityRouter = (activityService: ActivityService) =>
  router({
    /**
     * List the hive's activity events.
     * Supports filtering by resource type, resource ID, or actor.
     * Requires: activity:view
     */
    list: hiveProcedure.input(listActivitySchema).query(async ({ ctx, input }) => {
      requirePermission(ctx, HivePermission.ACTIVITY_VIEW);

      return activityService.list(ctx.user.hiveId, {
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        actorPersonId: input.actorPersonId,
        limit: input.limit,
        page: input.page,
      });
    }),
  });

export type ActivityRouter = ReturnType<typeof activityRouter>;
