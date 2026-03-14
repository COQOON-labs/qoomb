/**
 * Unit tests for requirePermission and requirePermissionOrOwnership.
 *
 * Coverage targets:
 * - requirePermission: allowed vs. forbidden for family and org hive roles
 * - requirePermission: missing ctx.user / hiveType throws FORBIDDEN
 * - requirePermission: per-hive DB role overrides (grant + revoke)
 * - requirePermissionOrOwnership: ANY permission allows any resource
 * - requirePermissionOrOwnership: OWN permission allows only when user is creator
 * - requirePermissionOrOwnership: neither permission → FORBIDDEN
 * - requirePermissionOrOwnership: missing ctx.user → FORBIDDEN
 */

import { HivePermission } from '@qoomb/types';
import { TRPCError } from '@trpc/server';

import type { TrpcContext } from '../../trpc/trpc.context';

import { requirePermission, requirePermissionOrOwnership } from './hive-permission.guard';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CREATOR_ID = 'person-creator';
const OTHER_ID = 'person-other';

/** Build a minimal TrpcContext stub. Cast avoids importing the full type graph. */
function makeCtx(
  overrides: Partial<{
    hiveType: string;
    role: string;
    personId: string;
    roleOverrides: ReadonlyArray<{ permission: string; granted: boolean }>;
  }> = {}
): TrpcContext {
  return {
    user: {
      id: 'user-001',
      email: 'test@example.com',
      hiveId: 'hive-001',
      hiveType: 'family',
      role: 'parent',
      personId: CREATOR_ID,
      groupIds: [],
      roleOverrides: [],
      ...overrides,
    },
  } as unknown as TrpcContext;
}

// ═══════════════════════════════════════════════════════════════════════════════
// requirePermission
// ═══════════════════════════════════════════════════════════════════════════════

describe('requirePermission — family hive', () => {
  it('allows parent to create events', () => {
    const ctx = makeCtx({ hiveType: 'family', role: 'parent' });
    expect(() => requirePermission(ctx, HivePermission.EVENTS_CREATE)).not.toThrow();
  });

  it('allows parent to manage members', () => {
    const ctx = makeCtx({ hiveType: 'family', role: 'parent' });
    expect(() => requirePermission(ctx, HivePermission.MEMBERS_MANAGE)).not.toThrow();
  });

  it('allows child to view events', () => {
    const ctx = makeCtx({ hiveType: 'family', role: 'child' });
    expect(() => requirePermission(ctx, HivePermission.EVENTS_VIEW)).not.toThrow();
  });

  it('allows child to create events', () => {
    const ctx = makeCtx({ hiveType: 'family', role: 'child' });
    expect(() => requirePermission(ctx, HivePermission.EVENTS_CREATE)).not.toThrow();
  });

  it('forbids child from managing members', () => {
    const ctx = makeCtx({ hiveType: 'family', role: 'child' });
    expect(() => requirePermission(ctx, HivePermission.MEMBERS_MANAGE)).toThrow(TRPCError);
  });

  it('forbids child from deleting any event', () => {
    const ctx = makeCtx({ hiveType: 'family', role: 'child' });
    expect(() => requirePermission(ctx, HivePermission.EVENTS_DELETE_ANY)).toThrow(TRPCError);
  });

  it('thrown error has FORBIDDEN code', () => {
    const ctx = makeCtx({ hiveType: 'family', role: 'child' });
    let caught: unknown;
    try {
      requirePermission(ctx, HivePermission.MEMBERS_MANAGE);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TRPCError);
    expect((caught as TRPCError).code).toBe('FORBIDDEN');
  });
});

describe('requirePermission — organization hive', () => {
  it('allows org_admin to manage members', () => {
    const ctx = makeCtx({ hiveType: 'organization', role: 'org_admin' });
    expect(() => requirePermission(ctx, HivePermission.MEMBERS_MANAGE)).not.toThrow();
  });

  it('allows manager to create events', () => {
    const ctx = makeCtx({ hiveType: 'organization', role: 'manager' });
    expect(() => requirePermission(ctx, HivePermission.EVENTS_CREATE)).not.toThrow();
  });

  it('allows member to view events', () => {
    const ctx = makeCtx({ hiveType: 'organization', role: 'member' });
    expect(() => requirePermission(ctx, HivePermission.EVENTS_VIEW)).not.toThrow();
  });

  it('allows member to create events', () => {
    const ctx = makeCtx({ hiveType: 'organization', role: 'member' });
    expect(() => requirePermission(ctx, HivePermission.EVENTS_CREATE)).not.toThrow();
  });

  it('allows guest to view events', () => {
    const ctx = makeCtx({ hiveType: 'organization', role: 'guest' });
    expect(() => requirePermission(ctx, HivePermission.EVENTS_VIEW)).not.toThrow();
  });

  it('forbids guest from creating events', () => {
    const ctx = makeCtx({ hiveType: 'organization', role: 'guest' });
    expect(() => requirePermission(ctx, HivePermission.EVENTS_CREATE)).toThrow(TRPCError);
  });

  it('forbids member from managing members', () => {
    const ctx = makeCtx({ hiveType: 'organization', role: 'member' });
    expect(() => requirePermission(ctx, HivePermission.MEMBERS_MANAGE)).toThrow(TRPCError);
  });

  it('forbids guest from managing members', () => {
    const ctx = makeCtx({ hiveType: 'organization', role: 'guest' });
    expect(() => requirePermission(ctx, HivePermission.MEMBERS_MANAGE)).toThrow(TRPCError);
  });
});

describe('requirePermission — missing context', () => {
  it('throws FORBIDDEN when ctx.user is undefined', () => {
    const ctx = { user: undefined } as unknown as TrpcContext;
    expect(() => requirePermission(ctx, HivePermission.EVENTS_VIEW)).toThrow(TRPCError);
  });

  it('throws FORBIDDEN when hiveType is missing', () => {
    const ctx = makeCtx({ hiveType: undefined as unknown as string });
    expect(() => requirePermission(ctx, HivePermission.EVENTS_VIEW)).toThrow(TRPCError);
  });

  it('throws FORBIDDEN when role is missing', () => {
    const ctx = makeCtx({ role: undefined as unknown as string });
    expect(() => requirePermission(ctx, HivePermission.EVENTS_VIEW)).toThrow(TRPCError);
  });
});

describe('requirePermission — per-hive role overrides', () => {
  it('grants a normally-forbidden permission when override has granted=true', () => {
    const ctx = makeCtx({
      hiveType: 'organization',
      role: 'guest',
      roleOverrides: [{ permission: HivePermission.EVENTS_CREATE, granted: true }],
    });
    expect(() => requirePermission(ctx, HivePermission.EVENTS_CREATE)).not.toThrow();
  });

  it('revokes a normally-allowed permission when override has granted=false', () => {
    const ctx = makeCtx({
      hiveType: 'family',
      role: 'parent',
      roleOverrides: [{ permission: HivePermission.EVENTS_CREATE, granted: false }],
    });
    expect(() => requirePermission(ctx, HivePermission.EVENTS_CREATE)).toThrow(TRPCError);
  });

  it('applies multiple overrides independently', () => {
    const ctx = makeCtx({
      hiveType: 'organization',
      role: 'member',
      roleOverrides: [
        { permission: HivePermission.MEMBERS_MANAGE, granted: true },
        { permission: HivePermission.EVENTS_CREATE, granted: false },
      ],
    });
    // Granted override: member can now manage members
    expect(() => requirePermission(ctx, HivePermission.MEMBERS_MANAGE)).not.toThrow();
    // Revoked override: member can no longer create events
    expect(() => requirePermission(ctx, HivePermission.EVENTS_CREATE)).toThrow(TRPCError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// requirePermissionOrOwnership
// ═══════════════════════════════════════════════════════════════════════════════

describe('requirePermissionOrOwnership', () => {
  function callGuard(
    ctx: TrpcContext,
    resourceCreatorId: string,
    anyPerm = HivePermission.EVENTS_UPDATE_ANY,
    ownPerm = HivePermission.EVENTS_UPDATE_OWN
  ) {
    return () => requirePermissionOrOwnership(ctx, anyPerm, ownPerm, resourceCreatorId);
  }

  it('allows user with ANY permission on a resource they do not own', () => {
    const ctx = makeCtx({ hiveType: 'family', role: 'parent', personId: CREATOR_ID });
    expect(callGuard(ctx, OTHER_ID)).not.toThrow();
  });

  it('allows user with ANY permission on their own resource', () => {
    const ctx = makeCtx({ hiveType: 'family', role: 'parent', personId: CREATOR_ID });
    expect(callGuard(ctx, CREATOR_ID)).not.toThrow();
  });

  it('allows user with only OWN permission when they ARE the creator', () => {
    // child has EVENTS_UPDATE_OWN but not EVENTS_UPDATE_ANY
    const ctx = makeCtx({ hiveType: 'family', role: 'child', personId: CREATOR_ID });
    expect(callGuard(ctx, CREATOR_ID)).not.toThrow();
  });

  it('forbids user with only OWN permission when they are NOT the creator', () => {
    const ctx = makeCtx({ hiveType: 'family', role: 'child', personId: CREATOR_ID });
    expect(callGuard(ctx, OTHER_ID)).toThrow(TRPCError);
  });

  it('forbids user with neither ANY nor OWN permission even on their own resource', () => {
    const ctx = makeCtx({ hiveType: 'organization', role: 'guest', personId: CREATOR_ID });
    expect(callGuard(ctx, CREATOR_ID)).toThrow(TRPCError);
  });

  it('throws FORBIDDEN when ctx.user is undefined', () => {
    const ctx = { user: undefined } as unknown as TrpcContext;
    expect(callGuard(ctx, CREATOR_ID)).toThrow(TRPCError);
  });

  it('throws FORBIDDEN when hiveType is missing', () => {
    const ctx = makeCtx({ hiveType: undefined as unknown as string });
    expect(callGuard(ctx, CREATOR_ID)).toThrow(TRPCError);
  });

  it('thrown error code is FORBIDDEN', () => {
    const ctx = makeCtx({ hiveType: 'organization', role: 'guest', personId: CREATOR_ID });
    let caught: unknown;
    try {
      requirePermissionOrOwnership(
        ctx,
        HivePermission.EVENTS_UPDATE_ANY,
        HivePermission.EVENTS_UPDATE_OWN,
        OTHER_ID
      );
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TRPCError);
    expect((caught as TRPCError).code).toBe('FORBIDDEN');
  });

  it('respects per-hive roleOverrides for the ANY permission check', () => {
    // guest normally cannot update any event, but override grants it
    const ctx = makeCtx({
      hiveType: 'organization',
      role: 'guest',
      personId: CREATOR_ID,
      roleOverrides: [{ permission: HivePermission.EVENTS_UPDATE_ANY, granted: true }],
    });
    expect(callGuard(ctx, OTHER_ID)).not.toThrow();
  });

  it('respects per-hive roleOverrides for the OWN permission check', () => {
    // guest normally cannot update own events, but override grants it
    const ctx = makeCtx({
      hiveType: 'organization',
      role: 'guest',
      personId: CREATOR_ID,
      roleOverrides: [{ permission: HivePermission.EVENTS_UPDATE_OWN, granted: true }],
    });
    expect(callGuard(ctx, CREATOR_ID)).not.toThrow();
  });
});
