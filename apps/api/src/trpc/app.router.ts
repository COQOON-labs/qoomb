import * as os from 'os';

import { authRouter } from '../modules/auth/auth.router';
import { type AuthService } from '../modules/auth/auth.service';
import { type PassKeyService } from '../modules/auth/passkey.service';
import { type SystemConfigService } from '../modules/auth/system-config.service';

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
export const createAppRouter = (
  authService: AuthService,
  systemConfigService: SystemConfigService,
  passKeyService: PassKeyService
) =>
  router({
    // Health check endpoint
    health: publicProcedure.query(() => {
      // Get server's local network IP address (for mobile testing)
      const getLocalIp = (): string | null => {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
          const iface = interfaces[name];
          if (!iface) continue;

          for (const addr of iface) {
            // Skip internal (localhost) and non-IPv4 addresses
            if (addr.family === 'IPv4' && !addr.internal) {
              return addr.address;
            }
          }
        }
        return null;
      };

      const localIp = getLocalIp();

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        localIp: localIp,
      };
    }),

    // Authentication router
    auth: authRouter(authService, systemConfigService, passKeyService),

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
