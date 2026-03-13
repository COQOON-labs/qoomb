/**
 * Tests for the resource access guard: buildVisibilityFilter and requireResourceAccess.
 *
 * These are the most security-critical functions in the RBAC system.
 * buildVisibilityFilter generates Prisma WHERE clauses for list queries.
 * requireResourceAccess enforces the 5-stage visibility resolution per-resource.
 */

import { AccessLevel, HivePermission } from '@qoomb/types';
import { TRPCError } from '@trpc/server';

import {
  buildVisibilityFilter,
  requireResourceAccess,
  type ResourcePermissions,
  type VisibilityFilterContext,
} from './resource-access.guard';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const LIST_PERMISSIONS: ResourcePermissions = {
  view: HivePermission.LISTS_VIEW,
  edit: HivePermission.LISTS_UPDATE_ANY,
  editOwn: HivePermission.LISTS_UPDATE_OWN,
  delete: HivePermission.LISTS_DELETE_ANY,
  deleteOwn: HivePermission.LISTS_DELETE_OWN,
};

const HIVE_ID = 'hive-001';
const PERSON_ID = 'person-001';
const OTHER_PERSON = 'person-999';
const GROUP_A = 'group-aaa';
const RESOURCE_ID = 'resource-abc';

// Helper: builds a minimal ctx.user for requireResourceAccess
function makeCtx(
  overrides: Partial<{
    hiveType: string;
    role: string;
    personId: string;
    groupIds: string[];
    hiveId: string;
    roleOverrides: ReadonlyArray<{ permission: string; granted: boolean }>;
  }> = {}
) {
  return {
    user: {
      id: 'user-001',
      email: 'test@example.com',
      hiveId: HIVE_ID,
      hiveType: 'family',
      role: 'parent',
      personId: PERSON_ID,
      groupIds: [] as string[],
      roleOverrides: [] as ReadonlyArray<{ permission: string; granted: boolean }>,
      ...overrides,
    },
  } as never; // Cast to satisfy TrpcContext type without importing full interface
}

// Mock database client — returns no shares by default
function makeDb(
  personalShare: { accessLevel: number } | null = null,
  groupShares: { accessLevel: number }[] = []
) {
  return {
    personShare: {
      findFirst: jest.fn().mockResolvedValue(personalShare),
      findMany: jest.fn().mockResolvedValue([]),
    },
    groupShare: {
      findMany: jest.fn().mockResolvedValue(groupShares),
    },
  } as never; // Cast to satisfy DbClient type
}

// ═══════════════════════════════════════════════════════════════════
// buildVisibilityFilter
// ═══════════════════════════════════════════════════════════════════

describe('buildVisibilityFilter', () => {
  it('includes hive visibility when user has view permission', () => {
    const ctx: VisibilityFilterContext = {
      personId: PERSON_ID,
      hiveType: 'family',
      role: 'parent', // parent has all permissions
      roleOverrides: [],
      groupIds: [],
    };

    const filter = buildVisibilityFilter(ctx, HivePermission.LISTS_VIEW);
    const orClauses = filter.OR as Record<string, unknown>[];
    expect(orClauses).toContainEqual({ visibility: 'hive' });
  });

  it('includes admins visibility for admin roles', () => {
    const ctx: VisibilityFilterContext = {
      personId: PERSON_ID,
      hiveType: 'family',
      role: 'parent',
      roleOverrides: [],
      groupIds: [],
    };

    const filter = buildVisibilityFilter(ctx, HivePermission.LISTS_VIEW);
    const orClauses = filter.OR as Record<string, unknown>[];
    expect(orClauses).toContainEqual({ visibility: 'admins' });
  });

  it('excludes admins visibility for non-admin roles', () => {
    const ctx: VisibilityFilterContext = {
      personId: PERSON_ID,
      hiveType: 'family',
      role: 'child',
      roleOverrides: [],
      groupIds: [],
    };

    const filter = buildVisibilityFilter(ctx, HivePermission.LISTS_VIEW);
    const orClauses = filter.OR as Record<string, unknown>[];
    expect(orClauses).not.toContainEqual({ visibility: 'admins' });
  });

  it('includes private filter for own resources only', () => {
    const ctx: VisibilityFilterContext = {
      personId: PERSON_ID,
      hiveType: 'family',
      role: 'child',
      roleOverrides: [],
      groupIds: [],
    };

    const filter = buildVisibilityFilter(ctx, HivePermission.LISTS_VIEW);
    const orClauses = filter.OR as Record<string, unknown>[];
    expect(orClauses).toContainEqual({ visibility: 'private', creatorId: PERSON_ID });
  });

  it('includes group filter when user belongs to groups', () => {
    const ctx: VisibilityFilterContext = {
      personId: PERSON_ID,
      hiveType: 'family',
      role: 'parent',
      roleOverrides: [],
      groupIds: [GROUP_A, 'group-bbb'],
    };

    const filter = buildVisibilityFilter(ctx, HivePermission.LISTS_VIEW);
    const orClauses = filter.OR as Record<string, unknown>[];
    expect(orClauses).toContainEqual({
      visibility: 'group',
      groupId: { in: [GROUP_A, 'group-bbb'] },
    });
  });

  it('excludes group filter when user has no groups', () => {
    const ctx: VisibilityFilterContext = {
      personId: PERSON_ID,
      hiveType: 'family',
      role: 'parent',
      roleOverrides: [],
      groupIds: [],
    };

    const filter = buildVisibilityFilter(ctx, HivePermission.LISTS_VIEW);
    const orClauses = filter.OR as Record<string, unknown>[];
    const hasGroupClause = orClauses.some(
      (c) => c && typeof c === 'object' && 'visibility' in c && c.visibility === 'group'
    );
    expect(hasGroupClause).toBe(false);
  });

  it('includes shared resource IDs when provided', () => {
    const ctx: VisibilityFilterContext = {
      personId: PERSON_ID,
      hiveType: 'family',
      role: 'child',
      roleOverrides: [],
      groupIds: [],
    };

    const filter = buildVisibilityFilter(ctx, HivePermission.LISTS_VIEW, ['shared-1', 'shared-2']);
    const orClauses = filter.OR as Record<string, unknown>[];
    expect(orClauses).toContainEqual({ id: { in: ['shared-1', 'shared-2'] } });
  });

  it('excludes shared IDs clause when empty', () => {
    const ctx: VisibilityFilterContext = {
      personId: PERSON_ID,
      hiveType: 'family',
      role: 'parent',
      roleOverrides: [],
      groupIds: [],
    };

    const filter = buildVisibilityFilter(ctx, HivePermission.LISTS_VIEW, []);
    const orClauses = filter.OR as Record<string, unknown>[];
    const hasIdClause = orClauses.some((c) => c && typeof c === 'object' && 'id' in c);
    expect(hasIdClause).toBe(false);
  });

  it('respects permission overrides that revoke view permission', () => {
    const ctx: VisibilityFilterContext = {
      personId: PERSON_ID,
      hiveType: 'family',
      role: 'parent',
      roleOverrides: [{ permission: HivePermission.LISTS_VIEW, granted: false }],
      groupIds: [],
    };

    const filter = buildVisibilityFilter(ctx, HivePermission.LISTS_VIEW);
    const orClauses = filter.OR as Record<string, unknown>[];

    // With view revoked, user should NOT see hive or admins visibility
    expect(orClauses).not.toContainEqual({ visibility: 'hive' });
    expect(orClauses).not.toContainEqual({ visibility: 'admins' });

    // Should still see own private
    expect(orClauses).toContainEqual({ visibility: 'private', creatorId: PERSON_ID });
  });
});

// ═══════════════════════════════════════════════════════════════════
// requireResourceAccess
// ═══════════════════════════════════════════════════════════════════

describe('requireResourceAccess', () => {
  // ── Context validation ────────────────────────────────────────
  it('denies when context has no personId (fail-closed)', async () => {
    const ctx = makeCtx({ personId: undefined as unknown as string });
    const db = makeDb();
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: PERSON_ID,
      visibility: 'hive',
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'view', LIST_PERMISSIONS)
    ).rejects.toThrow(TRPCError);
  });

  // ── Visibility: hive ──────────────────────────────────────────
  it('allows parent viewing hive-visible resource', async () => {
    const ctx = makeCtx();
    const db = makeDb();
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'hive',
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'view', LIST_PERMISSIONS)
    ).resolves.toBeUndefined();
  });

  it('allows child viewing hive-visible resource (child has LISTS_VIEW)', async () => {
    const ctx = makeCtx({ role: 'child' });
    const db = makeDb();
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'hive',
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'view', LIST_PERMISSIONS)
    ).resolves.toBeUndefined();
  });

  it('allows creator to edit own hive-visible resource (UPDATE_OWN)', async () => {
    const ctx = makeCtx({ role: 'child' });
    const db = makeDb();
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: PERSON_ID, // same as ctx.user.personId
      visibility: 'hive',
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'edit', LIST_PERMISSIONS)
    ).resolves.toBeUndefined();
  });

  it('denies child editing another persons hive-visible resource', async () => {
    const ctx = makeCtx({ role: 'child' });
    const db = makeDb();
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'hive',
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'edit', LIST_PERMISSIONS)
    ).rejects.toThrow(TRPCError);
  });

  // ── Visibility: private ───────────────────────────────────────
  it('allows creator to view private resource', async () => {
    const ctx = makeCtx();
    const db = makeDb();
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: PERSON_ID,
      visibility: 'private',
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'view', LIST_PERMISSIONS)
    ).resolves.toBeUndefined();
  });

  it('denies admin viewing another persons private resource without share', async () => {
    const ctx = makeCtx({ role: 'parent' });
    const db = makeDb(); // no shares
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'private',
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'view', LIST_PERMISSIONS)
    ).rejects.toThrow(TRPCError);
  });

  it('allows access to private resource via personal share', async () => {
    const ctx = makeCtx();
    const db = makeDb({ accessLevel: AccessLevel.VIEW }); // personal share grants VIEW
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'private',
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'view', LIST_PERMISSIONS)
    ).resolves.toBeUndefined();
  });

  it('denies edit on private resource when share only grants VIEW', async () => {
    const ctx = makeCtx();
    const db = makeDb({ accessLevel: AccessLevel.VIEW });
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'private',
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'edit', LIST_PERMISSIONS)
    ).rejects.toThrow(TRPCError);
  });

  // ── Visibility: group ─────────────────────────────────────────
  it('allows group member to view group-visible resource', async () => {
    const ctx = makeCtx({ groupIds: [GROUP_A] });
    const db = makeDb();
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'group',
      groupId: GROUP_A,
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'view', LIST_PERMISSIONS)
    ).resolves.toBeUndefined();
  });

  it('denies non-member viewing group-visible resource', async () => {
    const ctx = makeCtx({ groupIds: [] });
    const db = makeDb();
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'group',
      groupId: GROUP_A,
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'view', LIST_PERMISSIONS)
    ).rejects.toThrow(TRPCError);
  });

  it('denies admin viewing group-visible resource without membership', async () => {
    // Key design rule: admins must join the group — no bypass
    const ctx = makeCtx({ role: 'parent', groupIds: [] });
    const db = makeDb();
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'group',
      groupId: GROUP_A,
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'view', LIST_PERMISSIONS)
    ).rejects.toThrow(TRPCError);
  });

  it('allows group member with EDIT share to edit group resource', async () => {
    const ctx = makeCtx({ groupIds: [GROUP_A] });
    const db = makeDb(null, [{ accessLevel: AccessLevel.EDIT }]); // group share
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'group',
      groupId: GROUP_A,
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'edit', LIST_PERMISSIONS)
    ).resolves.toBeUndefined();
  });

  // ── Visibility: admins ────────────────────────────────────────
  it('allows admin to view admins-visibility resource', async () => {
    const ctx = makeCtx({ role: 'parent' });
    const db = makeDb();
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'admins',
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'view', LIST_PERMISSIONS)
    ).resolves.toBeUndefined();
  });

  it('denies non-admin viewing admins-visibility resource', async () => {
    const ctx = makeCtx({ role: 'child' });
    const db = makeDb();
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'admins',
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'view', LIST_PERMISSIONS)
    ).rejects.toThrow(TRPCError);
  });

  it('allows non-admin with share to view admins-visibility resource (share exception)', async () => {
    const ctx = makeCtx({ role: 'child' });
    const db = makeDb({ accessLevel: AccessLevel.VIEW });
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'admins',
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'view', LIST_PERMISSIONS)
    ).resolves.toBeUndefined();
  });

  // ── Share elevation ───────────────────────────────────────────
  it('share elevates child to edit on hive-visible resource', async () => {
    const ctx = makeCtx({ role: 'child' });
    const db = makeDb({ accessLevel: AccessLevel.EDIT }); // personal share grants EDIT
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'hive',
    };

    // Without share, child cannot edit (only UPDATE_OWN for creators)
    // With EDIT share, access is granted additively
    await expect(
      requireResourceAccess(ctx, db, resource, 'edit', LIST_PERMISSIONS)
    ).resolves.toBeUndefined();
  });

  it('uses max of personal and group shares', async () => {
    const ctx = makeCtx({ role: 'child', groupIds: [GROUP_A] });
    // Personal share = VIEW(1), Group share = MANAGE(3) → effective = MANAGE(3)
    const db = makeDb({ accessLevel: AccessLevel.VIEW }, [{ accessLevel: AccessLevel.MANAGE }]);
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'hive',
    };

    // MANAGE >= MANAGE (delete requires MANAGE) → allowed
    await expect(
      requireResourceAccess(ctx, db, resource, 'delete', LIST_PERMISSIONS)
    ).resolves.toBeUndefined();
  });

  // ── Org hive roles ────────────────────────────────────────────
  it('allows org_admin to edit any hive-visible resource', async () => {
    const ctx = makeCtx({ hiveType: 'organization', role: 'org_admin' });
    const db = makeDb();
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'hive',
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'edit', LIST_PERMISSIONS)
    ).resolves.toBeUndefined();
  });

  it('denies guest editing hive-visible resource (guest has no edit permission)', async () => {
    const ctx = makeCtx({ hiveType: 'organization', role: 'guest' });
    const db = makeDb();
    const resource = {
      type: 'list',
      id: RESOURCE_ID,
      creatorId: OTHER_PERSON,
      visibility: 'hive',
    };

    await expect(
      requireResourceAccess(ctx, db, resource, 'edit', LIST_PERMISSIONS)
    ).rejects.toThrow(TRPCError);
  });
});
