import type { AppRouter } from '@qoomb/api/src/trpc/app.router';
import { createTRPCReact, type CreateTRPCReact } from '@trpc/react-query';

// Create tRPC React hooks
export const trpc: CreateTRPCReact<AppRouter, unknown> = createTRPCReact<AppRouter>();
