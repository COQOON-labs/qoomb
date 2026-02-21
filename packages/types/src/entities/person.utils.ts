import { PersonRole } from './person';

// ── Display Utilities ─────────────────────────────────────────────────────────

/**
 * Derive up to 2 initials from a display name.
 * Falls back to the first character of `fallback` (typically the user's email).
 *
 * @example
 * getInitials('John Doe', 'j@example.com')  // → 'JD'
 * getInitials(null, 'j@example.com')         // → 'J'
 * getInitials('Emma', 'e@example.com')       // → 'E'
 */
export function getInitials(name: string | null | undefined, fallback: string): string {
  if (!name) return fallback.slice(0, 1).toUpperCase();
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// ── Role → i18n Key Mapping ───────────────────────────────────────────────────

/**
 * Maps database role values (PersonRole) to the corresponding i18n key name
 * used in the `roles` namespace of typesafe-i18n translations.
 *
 * This is the single source of truth for the role→label bridge.
 * Frontend code uses these keys to call `LL.roles[key]()`.
 *
 * @example
 * const key = ROLE_I18N_KEYS[PersonRole.PARENT]; // → 'parent'
 * const key = ROLE_I18N_KEYS[PersonRole.ORG_ADMIN]; // → 'orgAdmin'
 */
export const ROLE_I18N_KEYS = {
  [PersonRole.PARENT]: 'parent',
  [PersonRole.CHILD]: 'child',
  [PersonRole.GUEST]: 'guest',
  [PersonRole.ORG_ADMIN]: 'orgAdmin',
  [PersonRole.MANAGER]: 'manager',
  [PersonRole.MEMBER]: 'member',
} as const;

/** Union type of valid role i18n key names */
export type RoleI18nKey = (typeof ROLE_I18N_KEYS)[PersonRole];
