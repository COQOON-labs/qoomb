import { type HiveType } from './entities/hive';

// ============================================
// PERMISSIONS
// Global, in-code permission definitions.
// No DB table — zero-cost in-memory lookups.
// ============================================

export enum HivePermission {
  // Hive management
  HIVE_UPDATE = 'hive:update',
  HIVE_DELETE = 'hive:delete',

  // Member management
  MEMBERS_VIEW = 'members:view',
  MEMBERS_INVITE = 'members:invite',
  MEMBERS_MANAGE = 'members:manage',
  MEMBERS_REMOVE = 'members:remove',

  // Events
  EVENTS_VIEW = 'events:view',
  EVENTS_CREATE = 'events:create',
  EVENTS_UPDATE_OWN = 'events:update:own',
  EVENTS_UPDATE_ANY = 'events:update:any',
  EVENTS_DELETE_OWN = 'events:delete:own',
  EVENTS_DELETE_ANY = 'events:delete:any',

  // Tasks
  TASKS_VIEW = 'tasks:view',
  TASKS_CREATE = 'tasks:create',
  TASKS_UPDATE_OWN = 'tasks:update:own',
  TASKS_UPDATE_ANY = 'tasks:update:any',
  TASKS_DELETE_OWN = 'tasks:delete:own',
  TASKS_DELETE_ANY = 'tasks:delete:any',
}

const ALL_PERMISSIONS = Object.values(HivePermission);

// ============================================
// ROLE → PERMISSION MAPPING (global defaults)
// Per-hive overrides are stored in hive_role_permissions table
// and applied at runtime on top of these defaults.
// ============================================

export const HIVE_ROLE_PERMISSIONS: Record<string, Record<string, HivePermission[]>> = {
  family: {
    parent: ALL_PERMISSIONS,
    child: [
      HivePermission.MEMBERS_VIEW,
      HivePermission.EVENTS_VIEW,
      HivePermission.EVENTS_CREATE,
      HivePermission.EVENTS_UPDATE_OWN,
      HivePermission.EVENTS_DELETE_OWN,
      HivePermission.TASKS_VIEW,
      HivePermission.TASKS_CREATE,
      HivePermission.TASKS_UPDATE_OWN,
      HivePermission.TASKS_DELETE_OWN,
    ],
  },
  organization: {
    org_admin: ALL_PERMISSIONS,
    manager: [
      HivePermission.MEMBERS_VIEW,
      HivePermission.MEMBERS_INVITE,
      HivePermission.MEMBERS_REMOVE,
      HivePermission.EVENTS_VIEW,
      HivePermission.EVENTS_CREATE,
      HivePermission.EVENTS_UPDATE_OWN,
      HivePermission.EVENTS_UPDATE_ANY,
      HivePermission.EVENTS_DELETE_OWN,
      HivePermission.EVENTS_DELETE_ANY,
      HivePermission.TASKS_VIEW,
      HivePermission.TASKS_CREATE,
      HivePermission.TASKS_UPDATE_OWN,
      HivePermission.TASKS_UPDATE_ANY,
      HivePermission.TASKS_DELETE_OWN,
      HivePermission.TASKS_DELETE_ANY,
    ],
    member: [
      HivePermission.MEMBERS_VIEW,
      HivePermission.EVENTS_VIEW,
      HivePermission.EVENTS_CREATE,
      HivePermission.EVENTS_UPDATE_OWN,
      HivePermission.TASKS_VIEW,
      HivePermission.TASKS_CREATE,
      HivePermission.TASKS_UPDATE_OWN,
    ],
    guest: [HivePermission.MEMBERS_VIEW, HivePermission.EVENTS_VIEW, HivePermission.TASKS_VIEW],
  },
} as const;

// Valid roles per hive type — used for input validation
export const VALID_ROLES_BY_HIVE_TYPE: Record<string, string[]> = {
  family: ['parent', 'child'],
  organization: ['org_admin', 'manager', 'member', 'guest'],
};

// ============================================
// RESOURCE VISIBILITY
// Applied per resource instance (event, task, note, …).
// Resources carry a `visibility` field (default: 'hive').
//
// Resolution order (access check):
//   1. Load personal + group shares in parallel
//      → effective_share_level = max(personal, group_shares)
//   2. 'private'  → creator OR effective_share_level >= required
//   3. 'group'    → creator OR group-member (VIEW) OR effective_share_level >= required
//   4. 'admins'   → effective_share_level >= required OR (admin role + permission check)
//   5. 'hive'     → effective_share_level >= required OR role-based permission check
//
// Key rules:
//   - Shares are ADDITIVE for 'hive'/'admins': they only elevate, never restrict
//   - Shares are the ONLY mechanism for 'group'/'private' (beyond membership/creator)
//   - Admin roles have no universal bypass; 'private' always requires a share or creator
//   - For 'group' resources, admins gain access by joining the group (auditable)
// ============================================

/** Visibility values for resource instances (events, tasks, notes, …). */
export type ResourceVisibility = 'hive' | 'admins' | 'group' | 'private';

/**
 * Hierarchical access levels for PersonShare and GroupShare grants.
 * Higher levels imply lower levels: MANAGE (3) implies EDIT (2) implies VIEW (1).
 *
 * - VIEW (1):   Can read the resource
 * - EDIT (2):   Can read + edit the resource
 * - MANAGE (3): Can read + edit + delete + create/modify shares for this resource
 */
export enum AccessLevel {
  VIEW = 1,
  EDIT = 2,
  MANAGE = 3,
}

// ============================================
// HELPERS
// ============================================

export function getPermissionsForRole(hiveType: HiveType | string, role: string): HivePermission[] {
  return HIVE_ROLE_PERMISSIONS[hiveType]?.[role] ?? [];
}

export function hasPermission(
  hiveType: HiveType | string,
  role: string,
  permission: HivePermission
): boolean {
  return getPermissionsForRole(hiveType, role).includes(permission);
}

/**
 * Returns true if the role is an admin role for the given hive type.
 * Admin roles: 'parent' (family) and 'org_admin' (organization).
 *
 * Note: Being an admin does NOT grant universal access to all resources.
 * Private resources require a share or being the creator even for admins.
 * The 'admins' visibility type is restricted to admin roles specifically.
 */
export function isAdminRole(hiveType: string, role: string): boolean {
  return (
    (hiveType === 'family' && role === 'parent') ||
    (hiveType === 'organization' && role === 'org_admin')
  );
}

/**
 * Checks whether a role has a permission after applying per-hive DB overrides
 * on top of the global HIVE_ROLE_PERMISSIONS defaults.
 *
 * Overrides with granted=true add permissions beyond the defaults.
 * Overrides with granted=false revoke permissions from the defaults.
 */
export function hasPermissionWithOverrides(
  hiveType: string,
  role: string,
  permission: HivePermission,
  overrides: ReadonlyArray<{ permission: string; granted: boolean }>
): boolean {
  const effective = new Set<string>(getPermissionsForRole(hiveType, role).map((p) => p as string));
  for (const override of overrides) {
    if (override.granted) {
      effective.add(override.permission);
    } else {
      effective.delete(override.permission);
    }
  }
  return effective.has(permission as string);
}
