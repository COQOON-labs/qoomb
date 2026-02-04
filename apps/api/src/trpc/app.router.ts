import { authRouter } from '../modules/auth/auth.router';
import { type AuthService } from '../modules/auth/auth.service';

import { router, publicProcedure } from './trpc.router';

// Import sub-routers (to be created in future)
// import { eventsRouter } from '../modules/events/events.router';
// import { tasksRouter } from '../modules/tasks/tasks.router';
// import { personsRouter } from '../modules/persons/persons.router';

/**
 * Create the main application router
 *
 * This function takes all required services and returns
 * the composed tRPC router with all sub-routers attached.
 */
export const createAppRouter = (authService: AuthService) =>
  router({
    // Health check endpoint
    health: publicProcedure.query(() => {
      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
      };
    }),

    // Authentication router
    auth: authRouter(authService),

    // Future sub-routers will be added here:
    // events: eventsRouter(eventsService),
    // tasks: tasksRouter(tasksService),
    // persons: personsRouter(personsService),
  });

/**
 * App Router Type
 * This type is used by the tRPC client for type-safe API calls
 */
export type AppRouter = ReturnType<typeof createAppRouter>;
