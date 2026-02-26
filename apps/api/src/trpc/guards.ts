import { TRPCError } from '@trpc/server';

/**
 * tRPC Guard Utilities
 *
 * Thin helpers that translate application-layer booleans into tRPC errors.
 * They intentionally contain no business logic — they only decide *how* a
 * failed check surfaces to the caller.
 *
 * ── Pattern ────────────────────────────────────────────────────────────────
 *
 *   Service layer  →  pure boolean getters (no framework imports)
 *   tRPC layer     →  guards that call those getters and throw TRPCError
 *
 * Usage in a router:
 *
 *   import { requireEnabled } from '../../trpc/guards';
 *
 *   someEndpoint: publicProcedure.mutation(async () => {
 *     requireEnabled(systemConfigService.isForgotPasswordAllowed(), 'Password reset is disabled.');
 *     // ... handler body
 *   }),
 *
 * ── Where to add new guards ─────────────────────────────────────────────────
 *
 *   - Operator feature flags           → requireEnabled()  (already here)
 *   - System-admin-only endpoints      → add requireSystemAdmin() here
 *   - Rate-limit pre-checks            → add requireNotRateLimited() here
 *
 * Do NOT import NestJS or business-logic services into this file.
 * Do NOT put guards inline inside individual router files.
 */

/**
 * Throws a FORBIDDEN TRPCError if `allowed` is false.
 *
 * Use this to enforce operator-controlled feature flags at the tRPC boundary.
 * The boolean should come from SystemConfigService (or equivalent service)
 * — never call getEnv() directly from a router.
 *
 * @param allowed  Result of a service getter, e.g. `systemConfigService.isPasskeysAllowed()`
 * @param message  User-facing reason shown in the error response
 */
export function requireEnabled(allowed: boolean, message: string): void {
  if (!allowed) {
    throw new TRPCError({ code: 'FORBIDDEN', message });
  }
}
