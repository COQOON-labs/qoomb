import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@qoomb/api/src/trpc/app.router';

// Create tRPC React hooks
export const trpc = createTRPCReact<AppRouter>();
