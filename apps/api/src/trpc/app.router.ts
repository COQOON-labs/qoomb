import { authRouter } from '../modules/auth/auth.router';
import { type AuthService } from '../modules/auth/auth.service';
import { type PassKeyService } from '../modules/auth/passkey.service';
import { type SystemConfigService } from '../modules/auth/system-config.service';
import { eventsRouter } from '../modules/events/events.router';
import { type EventsService } from '../modules/events/events.service';
import { groupsRouter } from '../modules/groups/groups.router';
import { type GroupsService } from '../modules/groups/groups.service';
import { listsRouter } from '../modules/lists/lists.router';
import { type ListsService } from '../modules/lists/lists.service';
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
  listsServiceInstance: ListsService
) =>
  router({
    // Health check endpoint (public — used by load balancers / uptime monitors)
    health: publicProcedure.query(() => ({
      status: 'ok',
      timestamp: new Date().toISOString(),
    })),

    // Authentication router
    auth: authRouter(authService, systemConfigService, passKeyService),

    // Persons router (hive member management)
    persons: personsRouter(personsServiceInstance, authService),

    // Events router (Phase 2)
    events: eventsRouter(eventsServiceInstance),

    // Groups router (Phase 2)
    groups: groupsRouter(groupsServiceInstance),

    // Lists router (Phase 3)
    lists: listsRouter(listsServiceInstance),
  });

/**
 * App Router Type
 * This type is used by the tRPC client for type-safe API calls.
 */
export type AppRouter = ReturnType<typeof createAppRouter>;
