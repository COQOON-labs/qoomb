import { activityRouter } from '../modules/activity/activity.router';
import { type ActivityService } from '../modules/activity/activity.service';
import { authRouter } from '../modules/auth/auth.router';
import { type AuthService } from '../modules/auth/auth.service';
import { type PassKeyService } from '../modules/auth/passkey.service';
import { type SystemConfigService } from '../modules/auth/system-config.service';
import { eventsRouter } from '../modules/events/events.router';
import { type EventsService } from '../modules/events/events.service';
import { groupsRouter } from '../modules/groups/groups.router';
import { type GroupsService } from '../modules/groups/groups.service';
import { hiveRouter } from '../modules/hive/hive.router';
import { type HiveService } from '../modules/hive/hive.service';
import { listsRouter } from '../modules/lists/lists.router';
import { type ListsService } from '../modules/lists/lists.service';
import { messagingRouter } from '../modules/messaging/messaging.router';
import { type MessagingService } from '../modules/messaging/messaging.service';
import { notificationsRouter } from '../modules/notifications/notifications.router';
import { type NotificationsService } from '../modules/notifications/notifications.service';
import { personsRouter } from '../modules/persons/persons.router';
import { type PersonsService } from '../modules/persons/persons.service';

import { router, publicProcedure } from './trpc.router';

/**
 * Create the main application router.
 *
 * This function takes all required services and returns
 * the composed tRPC router with all sub-routers attached.
 */
export const createAppRouter = (
  authService: AuthService,
  systemConfigService: SystemConfigService,
  passKeyService: PassKeyService,
  personsServiceInstance: PersonsService,
  eventsServiceInstance: EventsService,
  groupsServiceInstance: GroupsService,
  listsServiceInstance: ListsService,
  hiveServiceInstance: HiveService,
  notificationsServiceInstance: NotificationsService,
  messagingServiceInstance: MessagingService,
  activityServiceInstance: ActivityService
) =>
  router({
    // Health check endpoint (public — used by load balancers / uptime monitors)
    health: publicProcedure.query(() => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })),

    // Authentication router
    auth: authRouter(authService, systemConfigService, passKeyService),

    // Persons router (hive member management + invitation management)
    persons: personsRouter(personsServiceInstance, authService),

    // Events router (Phase 2)
    events: eventsRouter(eventsServiceInstance),

    // Groups router (Phase 2)
    groups: groupsRouter(groupsServiceInstance),

    // Lists router (Phase 2)
    lists: listsRouter(listsServiceInstance),

    // Hive router (Phase 3) — get, update, delete
    hive: hiveRouter(hiveServiceInstance),

    // Notifications router (Phase 3) — in-app notifications + preferences
    notifications: notificationsRouter(notificationsServiceInstance),

    // Messaging router (Phase 3) — encrypted direct messages
    messaging: messagingRouter(messagingServiceInstance),

    // Activity router (Phase 3) — change feed / audit trail
    activity: activityRouter(activityServiceInstance),
  });

/**
 * App Router Type
 * This type is used by the tRPC client for type-safe API calls.
 */
export type AppRouter = ReturnType<typeof createAppRouter>;
