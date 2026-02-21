import { useMemo } from 'react';

import { getInitials, ROLE_I18N_KEYS, type RoleI18nKey } from '@qoomb/types';

import { useI18nContext } from '../i18n/i18n-react';
import { useAuth } from '../lib/auth/useAuth';
import { trpc } from '../lib/trpc/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CurrentPerson {
  /** Display name — falls back to email, then '—' */
  displayName: string;
  /** 1–2 letter initials derived from displayName (or email fallback) */
  initials: string;
  /** Database role value (e.g. 'parent', 'org_admin') */
  role: string;
  /** Localised role label (e.g. 'Elternteil', 'Admin') */
  roleLabel: string;
  /** Whether the person data is still loading */
  isLoading: boolean;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Fetches the current person's data (via `persons.me`) and derives
 * display-ready values: displayName, initials, and localised role label.
 *
 * Encapsulates the tRPC query + all presentation logic in one place
 * so consumers (Dashboard, Sidebar, UserMenu, …) stay thin.
 *
 * @example
 * const { displayName, initials, roleLabel } = useCurrentPerson();
 */
export function useCurrentPerson(): CurrentPerson {
  const { LL } = useI18nContext();
  const { user } = useAuth();

  const { data: person, isLoading } = trpc.persons.me.useQuery(undefined, {
    enabled: !!user,
  });

  const displayName = person?.displayName ?? user?.email ?? '—';

  const initials = useMemo(
    () => getInitials(person?.displayName, user?.email ?? '?'),
    [person?.displayName, user?.email],
  );

  const role = person?.role ?? 'member';

  const roleLabel = useMemo(() => {
    const i18nKey = ROLE_I18N_KEYS[role as keyof typeof ROLE_I18N_KEYS] as RoleI18nKey | undefined;
    return LL.roles[i18nKey ?? 'member']();
  }, [LL, role]);

  return { displayName, initials, role, roleLabel, isLoading };
}
