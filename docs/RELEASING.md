# Release Process

This document describes how releases are managed in the Qoomb project.

## Overview

Qoomb uses **GitHub Flow with Release Please** for automated release management. This approach combines simplicity with automation while giving maintainers full control over when releases are published.

```text
┌─────────────────────────────────────────────────────────┐
│  develop (Feature Development)                          │
│     ↓  PR/Merge                                         │
│  main (Release-Ready Code)                              │
│     ↓  Automatic                                        │
│  Release PR (created by Release Please bot)             │
│     ↓  Manual Merge                                     │
│  GitHub Release + Git Tag (v0.x.0)                      │
└─────────────────────────────────────────────────────────┘
```

## Branch Strategy

| Branch    | Purpose                                 | Protected |
| --------- | --------------------------------------- | --------- |
| `main`    | Release-ready code, production state    | ✅ Yes    |
| `develop` | Active development, feature integration | ✅ Yes    |
| `feat/*`  | Feature branches (short-lived)          | ❌ No     |
| `fix/*`   | Bug fix branches (short-lived)          | ❌ No     |

### Key Principles

1. **`main` is always deployable** - Every commit on `main` should be production-ready
2. **`develop` is the integration branch** - Features are merged here first
3. **Releases are explicit** - Only merging the Release PR creates a GitHub Release
4. **No release branches needed** - Release Please handles versioning automatically

## How to Create a Release

### Step 1: Develop Features

Work on `develop` or feature branches using [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git checkout develop
git checkout -b feat/my-feature

# Make changes...
git commit -m "feat: Add amazing new feature"
git commit -m "fix: Resolve edge case in feature"

git push origin feat/my-feature
# Create PR to develop
```

### Step 2: Merge to Main

When ready to prepare a release, merge `develop` into `main`:

```bash
# Option A: Via GitHub PR (recommended)
# Create PR: develop → main on GitHub

# Option B: Direct merge (if you have permissions)
git checkout main
git pull origin main
git merge develop
git push origin main
```

### Step 3: Release Please Creates a Release PR

After pushing to `main`, Release Please automatically:

1. Analyzes commits since last release
2. Determines version bump (major/minor/patch)
3. Generates changelog entries
4. Creates or updates a "Release PR"

The Release PR will look like:

- Title: `chore: Release v0.2.0`
- Contains: Updated `CHANGELOG.md`, version bumps

### Step 4: Review and Merge Release PR

When you're ready to publish the release:

1. Review the Release PR on GitHub
2. Verify the changelog looks correct
3. Merge the Release PR

**This triggers:**

- Git tag creation (e.g., `v0.2.0`)
- GitHub Release publication
- SBOM generation and attachment

## Version Numbering

Versions follow [Semantic Versioning](https://semver.org/) (SemVer):

```text
v MAJOR . MINOR . PATCH
    │       │       │
    │       │       └── Bug fixes (fix:)
    │       └────────── New features (feat:)
    └────────────────── Breaking changes (feat!: or BREAKING CHANGE:)
```

### Commit Type → Version Bump

| Commit Type | Example                    | Version Change |
| ----------- | -------------------------- | -------------- |
| `fix:`      | `fix: Resolve login issue` | 0.1.0 → 0.1.1  |
| `feat:`     | `feat: Add dark mode`      | 0.1.0 → 0.2.0  |
| `feat!:`    | `feat!: Redesign API`      | 0.1.0 → 1.0.0  |
| `docs:`     | `docs: Update README`      | No release\*   |
| `chore:`    | `chore: Update deps`       | No release\*   |
| `ci:`       | `ci: Fix workflow`         | No release\*   |

\*These are included in the next release but don't trigger one on their own.

## Conventional Commits Reference

All commits must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```text
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

| Type       | Description             | Appears in Changelog |
| ---------- | ----------------------- | -------------------- |
| `feat`     | New feature             | ✅ ✨ Features       |
| `fix`      | Bug fix                 | ✅ 🐛 Bug Fixes      |
| `perf`     | Performance improvement | ✅ ⚡ Performance    |
| `revert`   | Revert previous commit  | ✅ ⏪ Reverts        |
| `docs`     | Documentation only      | ✅ 📚 Documentation  |
| `style`    | Code style (formatting) | ❌ Hidden            |
| `refactor` | Code refactoring        | ❌ Hidden            |
| `test`     | Adding/updating tests   | ❌ Hidden            |
| `build`    | Build system changes    | ❌ Hidden            |
| `ci`       | CI/CD changes           | ❌ Hidden            |
| `chore`    | Maintenance tasks       | ❌ Hidden            |

### Examples

```bash
# Feature
git commit -m "feat(auth): Add OAuth2 login support"

# Bug fix
git commit -m "fix(api): Handle null values in response"

# Breaking change
git commit -m "feat(api)!: Change authentication endpoint"

# With body
git commit -m "fix(encryption): Resolve key rotation issue

The key rotation was failing silently when the old key
had already expired. This adds proper error handling.

Closes #123"
```

## Hotfix Process

For urgent fixes that need to bypass `develop`:

```bash
# 1. Create hotfix branch from main
git checkout main
git checkout -b fix/critical-security-issue

# 2. Make the fix
git commit -m "fix(security): Patch XSS vulnerability"

# 3. Create PR directly to main
# After merge, Release Please will create a patch release PR

# 4. Back-merge to develop
git checkout develop
git merge main
git push origin develop
```

## Configuration Files

| File                                                              | Purpose                              |
| ----------------------------------------------------------------- | ------------------------------------ |
| [release-please-config.json](../release-please-config.json)       | Changelog sections, release behavior |
| [.release-please-manifest.json](../.release-please-manifest.json) | Current version tracking             |
| [.github/workflows/release.yml](../.github/workflows/release.yml) | Release workflow                     |
| [.github/workflows/sbom.yml](../.github/workflows/sbom.yml)       | SBOM generation                      |
| [CHANGELOG.md](../CHANGELOG.md)                                   | Auto-generated changelog             |

## FAQ

### Why not use release branches?

Release branches (like `release/v1.0`) add complexity without benefit for our workflow:

- Small team doesn't need parallel release stabilization
- Release Please handles version bumping automatically
- Hotfixes can go directly to `main`

### Can I skip a release?

Yes! Simply don't merge the Release PR. Release Please will keep updating it with new commits until you're ready.

### How do I release documentation-only changes?

Documentation changes (`docs:` commits) don't trigger releases automatically. If you want to release them:

1. Include at least one `fix:` or `feat:` commit, OR
2. Manually edit the Release PR to force a version bump

### What if I need to release an older version?

For maintaining older versions (e.g., security patches for v1.x while v2.x is current):

1. Create a `v1.x` branch from the last v1 tag
2. Cherry-pick or apply fixes
3. Manually tag and release (Release Please focuses on latest)

### How do I see what will be in the next release?

Check the open Release PR on GitHub, or run:

```bash
git log main..develop --oneline
```

---

## Quick Reference

```bash
# See commits pending for next release
git log $(git describe --tags --abbrev=0)..HEAD --oneline

# List all releases
git tag -l "v*" --sort=-version:refname

# Check current version
cat package.json | grep '"version"'
```

---

Last updated: February 2026
