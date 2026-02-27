/**
 * Feature Flag Registry
 *
 * Single source of truth for all feature flags in the web app.
 * All values are resolved once at module initialisation — they are build-time
 * constants that Vite substitutes before bundling, so dead branches are fully
 * eliminated by Rollup tree-shaking (no production bundle bloat).
 *
 * ── Flag categories ───────────────────────────────────────────────────────────
 *
 *  dev      → `import.meta.env.DEV`  — only in development builds
 *  preview  → `PREVIEW_FLAGS.has(name)` — opt-in via VITE_PREVIEW_FLAGS env var
 *             Useful for staging / beta without a code change:
 *             VITE_PREVIEW_FLAGS=newMembersUI,offlineSync pnpm build
 *  env      → `import.meta.env.VITE_FEATURE_*` — operator-controlled toggles
 *  stable   → `true` — always on; flag is pending cleanup/removal
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *
 *  // Non-React (routing, guards, utils):
 *  import { flag } from '../lib/flags';
 *  if (flag('devSketches')) { ... }
 *
 *  // React components:
 *  import { useFlag } from '../lib/flags';
 *  const enabled = useFlag('devSketches');
 *
 * ── Adding a new flag ─────────────────────────────────────────────────────────
 *
 *  1. Add an entry to FLAGS below with a description comment.
 *  2. TypeScript will enforce the name everywhere automatically.
 *  3. Remove the flag + all call sites once the feature is fully shipped.
 */

// ── Preview flags — opt-in via env ────────────────────────────────────────────

const rawPreviewFlags = (import.meta.env.VITE_PREVIEW_FLAGS as string | undefined) ?? '';
const PREVIEW_FLAGS = new Set(
  rawPreviewFlags
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

// ── Flag definitions ──────────────────────────────────────────────────────────

export const FLAGS = {
  /**
   * Dev-only design sketch routes (`/dev/sketch/*`).
   * Frozen UI prototypes with static dummy data — inspiration for real pages.
   * Never shipped to production.
   *
   * category: dev
   */
  devSketches: import.meta.env.DEV,

  // ── Template entries — uncomment and adapt as needed ─────────────────────

  // /**
  //  * New members list with avatar grid layout.
  //  * Opt-in via: VITE_PREVIEW_FLAGS=newMembersUi
  //  *
  //  * category: preview
  //  */
  // newMembersUi: PREVIEW_FLAGS.has('newMembersUi'),

  // /**
  //  * Offline sync (Phase 4). Enabled by operator env var.
  //  * category: env
  //  */
  // offlineSync: import.meta.env.VITE_FEATURE_OFFLINE_SYNC === 'true',
} as const satisfies Record<string, boolean>;

export type FlagName = keyof typeof FLAGS;

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Returns whether a feature flag is enabled.
 * Safe to call outside of React (routing, guards, plain utils).
 */
export function flag(name: FlagName): boolean {
  return FLAGS[name];
}

/**
 * React hook to read a feature flag.
 *
 * Currently flags are build-time constants so this is a thin wrapper,
 * but the hook boundary allows future server-driven or per-user flags
 * to be introduced without changing any call sites.
 *
 * @example
 * const showSketch = useFlag('devSketches');
 */
export function useFlag(name: FlagName): boolean {
  return FLAGS[name];
}

// Export for testing / DevPanel inspection
export { PREVIEW_FLAGS };
