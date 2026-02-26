# ADR-0003: Branching & Release Strategy

**Status:** Accepted  
**Date:** 2026-02-26  
**Deciders:** Benjamin Gröner

## Context

As the codebase grows and CI/CD matures, a clear branching strategy is needed to:

- Keep `main` in a continuously deployable state
- Avoid long-lived divergent branches that cause painful merge conflicts
- Enable automated, changelog-driven releases without manual version management
- Work efficiently with a small team (currently solo / very small)
- Support AI-assisted development (Copilot, Claude) where branch naming must be consistent

Several strategies were evaluated: **Gitflow**, **GitHub Flow**, and **Trunk-Based Development
(TBD)**. Pure TBD (commits directly on `main`) was considered too high-risk without comprehensive
test coverage across all modules. Full Gitflow was considered over-engineered for the current
team size and deployment model.

## Decision

We adopt **Scaled Trunk-Based Development** (also known as GitHub Flow) as our branching
strategy, combined with **Release Please** for automated versioning and changelog generation.

### Branching Rules

1. **Single protected trunk:** `main` is the only long-lived branch. There is no `develop`,
   `staging`, or `release/*` branch.

2. **Short-lived feature branches:** All work happens on branches named with a standard prefix:

   | Prefix      | Use for                                 |
   | ----------- | --------------------------------------- |
   | `feat/`     | New features                            |
   | `fix/`      | Bug fixes                               |
   | `docs/`     | Documentation only                      |
   | `refactor/` | Code restructuring, no behaviour change |
   | `test/`     | Tests                                   |
   | `chore/`    | Build, CI, tooling, dependencies        |
   | `perf/`     | Performance improvements                |

   Non-standard prefixes (`claude/`, `ai/`, `hotfix/`, etc.) are **not permitted**.

3. **Branch lifetime:** Branches must be merged within **1–2 days**. If a task takes longer,
   it must be split into multiple sequential PRs (see Expand/Contract below).

4. **`main` is always releasable:** Every merge to `main` must leave the codebase in a state
   that could be deployed to production immediately.

### Merge Strategy

Both **squash merge** and **merge commit** are permitted when merging PRs to `main`. The
preferred default is squash merge for most PRs to keep history readable; merge commits are
acceptable when the PR's individual commits carry meaningful context.

In either case, the resulting commit(s) on `main` must follow **Conventional Commits** format
(enforced by `commitlint` on PR commits and used by Release Please for changelog generation).

### Handling Large Changes: Expand/Contract Pattern

When a change is too large to land in a single 1–2 day PR, we use the **Expand/Contract**
pattern instead of long-lived feature branches or feature flags:

```
Phase 1 — EXPAND
  Add the new behaviour alongside the old.
  Both exist in parallel; main stays green.
  Example: new API field added, old field still returned.

Phase 2 — CONTRACT
  Remove the old behaviour once all consumers are migrated.
  Example: old API field removed.
```

This approach means:

- Each PR is small, reviewable, and independently mergeable
- `main` never contains a broken or half-implemented change
- No feature flag infrastructure is required for development purposes

### Feature Flags: Why We Don't Use a Flag Platform

Dedicated feature flag platforms (LaunchDarkly, Unleash, GrowthBook) were deliberately **not
adopted**. The reasoning:

| Concern                        | Our approach                                           |
| ------------------------------ | ------------------------------------------------------ |
| Hiding in-progress work        | Expand/Contract — never merge incomplete work          |
| Operational on/off switches    | Environment variables validated by Zod (see below)     |
| Runtime toggles without deploy | Not needed at current team size and deployment cadence |

A flag platform adds significant infrastructure overhead (SDK, dashboard, state management) that
is not justified for a small team with infrequent deploys.

### Operational Configuration (ALLOW*\* / ENABLE*\* env vars)

Operator-level on/off decisions (e.g. `ALLOW_OPEN_REGISTRATION`, `ALLOW_PASSKEYS`) are
expressed as **environment variables**, not UI toggles or runtime flags. This is intentional:

- **Changes require a deliberate deployment** — misconfiguration is caught before the app starts
- **Zod validates at startup** — typos like `ALLOW_PASSKEYS=treu` cause a hard startup failure
  rather than a silent fallback to a potentially insecure default
- **No plaintext fallbacks** for security-critical settings — see ADR-0004 and ADR-0005

These vars are documented in `.env.example` with explanations of the consequences of each
setting.

### Release Strategy

Releases are fully automated via **Release Please**:

- Conventional Commits on `main` are analysed by Release Please
- Release Please opens a PR bumping `package.json` version and updating `CHANGELOG.md`
- Merging that PR creates a GitHub Release and git tag
- No manual version bumps — ever (enforced by `version-check.yml` CI workflow)

## Consequences

### Easier

- **No merge hell** — small, frequent integrations keep divergence minimal
- **Transparent progress** — all work-in-progress is visible on `main` via small PRs
- **Automated releases** — zero manual versioning overhead
- **AI tooling compatible** — consistent branch naming works well with Copilot / Claude

### Harder

- **Discipline required** — large tasks must be consciously split into small PRs; this is a
  habit, not a tooling constraint
- **No long-lived experiment branches** — exploratory or throwaway work must either be
  time-boxed to 2 days or remain local until ready to integrate

## References

- [Trunk-Based Development](https://trunkbaseddevelopment.com/)
- [Expand/Contract pattern](https://martinfowler.com/bliki/ParallelChange.html)
- [Release Please](https://github.com/googleapis/release-please)
- [Conventional Commits](https://www.conventionalcommits.org/)
- `.github/BRANCH_PROTECTION.md` — GitHub branch protection setup instructions
- `CONTRIBUTING.md` — contributor-facing workflow guide
