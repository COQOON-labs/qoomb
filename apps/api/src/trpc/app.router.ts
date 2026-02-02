import { router, publicProcedure } from './trpc.router';

// Import sub-routers (to be created)
// import { authRouter } from '../modules/auth/auth.router';
// import { eventsRouter } from '../modules/events/events.router';
// import { tasksRouter } from '../modules/tasks/tasks.router';
// import { personsRouter } from '../modules/persons/persons.router';

export const appRouter = router({
  // Health check
  health: publicProcedure.query(() => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }),

  // Sub-routers will be added here
  // auth: authRouter,
  // events: eventsRouter,
  // tasks: tasksRouter,
  // persons: personsRouter,
});

export type AppRouter = typeof appRouter;
