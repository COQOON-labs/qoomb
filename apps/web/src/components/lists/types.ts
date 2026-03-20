/**
 * Shared tRPC-derived types for all list-related components.
 * Import these instead of re-deriving in every component file.
 */
import type { AppRouter } from '@qoomb/api/src/trpc/app.router';
import type { inferRouterOutputs } from '@trpc/server';

import type { useI18nContext } from '../../i18n/i18n-react';
import type { trpc } from '../../lib/trpc/client';

type RouterOutput = inferRouterOutputs<AppRouter>;

export type ListField = RouterOutput['lists']['get']['fields'][number];
export type ListItem = RouterOutput['lists']['listItems'][number];
export type ListDetail = RouterOutput['lists']['get'];
export type UpdateItemMutation = ReturnType<typeof trpc.lists.updateItem.useMutation>;
export type CreateItemMutation = ReturnType<typeof trpc.lists.createItem.useMutation>;
export type LLType = ReturnType<typeof useI18nContext>['LL'];
