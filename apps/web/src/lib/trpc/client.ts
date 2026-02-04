import type { AppRouter } from '@qoomb/api/src/trpc/app.router';
import { createTRPCReact } from '@trpc/react-query';

// Create tRPC React hooks
export const trpc = createTRPCReact<AppRouter>();
