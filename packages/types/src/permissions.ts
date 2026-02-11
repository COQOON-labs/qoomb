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
// Resources will carry a `visibility` field defaulting to 'hive'.
//
// Resolution order (canDo check):
//   1. Explicit ResourceShare for person+resource → use share permissions
//   2. 'private'  → creator + parents / org_admin only
//   3. 'parents'  → parents / org_admin only
//   4. 'hive' / 'shared' (no direct share) → evaluate role permissions
//      a. Load global HIVE_ROLE_PERMISSIONS defaults
//      b. Apply hive_role_permissions DB overrides (grant/revoke)
//      c. Check resulting set includes the required permission
// Note: parents / org_admin always see everything.
// ============================================

export type ResourceVisibility = 'hive' | 'parents' | 'private' | 'shared';

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
