# Branch Protection Configuration

This document describes the recommended branch protection rules for the Qoomb repository.

## Table of Contents

- [Overview](#overview)
- [Main Branch Protection](#main-branch-protection)
- [Develop Branch Protection](#develop-branch-protection)
- [Setup Instructions](#setup-instructions)
- [Rationale](#rationale)

---

## Overview

We use a **two-tier branch protection strategy**:

- **`main`**: Strict protection for production-ready code
- **`develop`**: Balanced protection for active development

Both branches require pull requests and CI checks, but with different approval requirements and flexibility levels.

---

## Main Branch Protection

### ✅ Required Settings

#### 1. Require a pull request before merging

**Configuration:**

- ✅ Require a pull request before merging
- Required number of approvals: **1** (team) / **0** (solo development)
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ✅ Require review from Code Owners (when CODEOWNERS file exists)
- ✅ Require approval of the most recent reviewable push
- ❌ Require conversation resolution before merging (optional, can enable later)

**Why:** Ensures code review process and CI validation before production deployment.

#### 2. Require status checks to pass

**Configuration:**

- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date before merging

**Required Status Checks:**

```
✓ CI / quality (Code Quality)
  - ESLint validation
  - Prettier formatting check
  - TypeScript type checking
  - Build verification

✓ CI / test (Tests)
  - Unit tests
  - Integration tests with PostgreSQL + Redis
  - Coverage reporting

✓ Version Check / version-consistency
  - Validates APP_VERSION matches release-please manifest

✓ Version Check / prevent-manual-bump
  - Prevents unauthorized version changes

✓ CodeQL (Security)
  - Static Application Security Testing (SAST)
  - JavaScript/TypeScript vulnerability scanning

✓ Trivy / security-scan (Vulnerability)
  - Container image scanning
  - Dependency vulnerability detection
  - Secret detection

✓ PR Checks / validate-commits (Commit Messages)
  - Conventional Commits validation
```

**Why:** Prevents broken code, security vulnerabilities, and policy violations from entering main.

#### 3. Block force pushes

**Configuration:**

- ✅ Do not allow force pushes
- Applies to: Everyone (including admins)

**Why:**

- Protects git history integrity
- **Critical for Release Please** - requires intact commit history
- Prevents accidental data loss
- Maintains audit trail

#### 4. Require linear history

**Configuration:**

- ❌ Do not require linear history

**Why:**

- Allows merge commits from PRs
- Compatible with Release Please workflow
- Preserves PR context in history
- Can be enabled later if needed

#### 5. Restrict deletions

**Configuration:**

- ✅ Restrict deletions
- Applies to: Everyone

**Why:** Main branch should never be deleted.

#### 6. Require signed commits

**Configuration:**

- ❌ Do not require signed commits (initially)
- ✅ Enable later for team/enterprise deployments

**Why:**

- Increases security and non-repudiation
- Proves author identity
- **Trade-off:** Requires GPG setup for all contributors
- Recommended for production/team environments

#### 7. Require code scanning results

**Configuration:**

- ✅ Require code scanning results
- Tools: CodeQL, Trivy
- Severity threshold: **Critical & High** only
- ❌ Do not block on Medium/Low (too restrictive)

**Why:** Prevents security vulnerabilities in production code.

---

## Develop Branch Protection

### ✅ Required Settings

#### 1. Require a pull request before merging

**Configuration:**

- ✅ Require a pull request before merging
- Required number of approvals: **0** (for faster iteration)
- ✅ Dismiss stale pull request approvals when new commits are pushed
- ❌ Require review from Code Owners (optional, more relaxed)
- ✅ Require approval of the most recent reviewable push
- ❌ Require conversation resolution before merging

**Difference from main:**

- **No required approvals** - allows solo developers to merge quickly
- More flexible review requirements
- Faster development cycle

#### 2. Require status checks to pass

**Configuration:**

- ✅ Require status checks to pass before merging
- ⚠️ **Do NOT** require branches to be up to date (more flexible)

**Required Status Checks:**

```
✓ CI / quality (Code Quality)
  - ESLint validation
  - Prettier formatting check
  - TypeScript type checking
  - Build verification

✓ CI / test (Tests)
  - Unit tests
  - Integration tests

✓ Version Check / version-consistency
  - Validates APP_VERSION consistency
```

**Difference from main:**

- **No strict "up to date" requirement** - allows parallel development
- **Fewer required checks** - no CodeQL/Trivy (run on main instead)
- Faster merge cycle for development

**Why:** Balances speed and quality for active development.

#### 3. Block force pushes

**Configuration:**

- ✅ Do not allow force pushes
- Applies to: Everyone (including admins)

**Why:**

- Protects git history even in development
- Prevents accidental loss of commits
- Maintains clean rebase/merge workflow

**Exception:** Admins can force-push if absolutely necessary (e.g., fixing broken history).

#### 4. Require linear history

**Configuration:**

- ❌ Do not require linear history

**Why:** Same as main - allows merge commits, preserves PR context.

#### 5. Restrict deletions

**Configuration:**

- ✅ Restrict deletions
- Applies to: Everyone

**Why:** Develop branch is long-lived and should not be deleted.

#### 6. Require signed commits

**Configuration:**

- ❌ Do not require signed commits

**Why:** Same as main - optional for later.

#### 7. Require code scanning results

**Configuration:**

- ❌ Do not require code scanning results on develop
- Security scans run on main instead

**Why:** Faster development cycle, security validated before production.

---

## Setup Instructions

### Via GitHub Web UI

1. Navigate to **Settings** → **Branches** → **Branch protection rules**
2. Click **Add rule**
3. Enter branch name pattern: `main`
4. Configure settings as per [Main Branch Protection](#main-branch-protection)
5. Click **Create** / **Save changes**
6. Repeat for `develop` branch with [Develop Branch Protection](#develop-branch-protection) settings

### Via GitHub CLI (gh)

```bash
# Install GitHub CLI if not already installed
# brew install gh (macOS)
# See: https://cli.github.com/

# Authenticate
gh auth login

# Create branch protection rule for main
gh api repos/:owner/:repo/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["CI / quality","CI / test","Version Check / version-consistency","Version Check / prevent-manual-bump","CodeQL","Trivy / security-scan"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":false,"required_approving_review_count":0}' \
  --field restrictions=null \
  --field required_linear_history=false \
  --field allow_force_pushes=false \
  --field allow_deletions=false

# Create branch protection rule for develop
gh api repos/:owner/:repo/branches/develop/protection \
  --method PUT \
  --field required_status_checks='{"strict":false,"contexts":["CI / quality","CI / test","Version Check / version-consistency"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":false,"required_approving_review_count":0}' \
  --field restrictions=null \
  --field required_linear_history=false \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

**Note:** Replace `:owner` and `:repo` with actual values (e.g., `coqoon/qoomb`).

### Via Terraform (Infrastructure as Code)

```hcl
resource "github_branch_protection" "main" {
  repository_id = github_repository.qoomb.node_id
  pattern       = "main"

  required_status_checks {
    strict   = true
    contexts = [
      "CI / quality",
      "CI / test",
      "Version Check / version-consistency",
      "Version Check / prevent-manual-bump",
      "CodeQL",
      "Trivy / security-scan",
    ]
  }

  required_pull_request_reviews {
    dismiss_stale_reviews           = true
    require_code_owner_reviews      = false
    required_approving_review_count = 0
    require_last_push_approval      = true
  }

  enforce_admins        = true
  require_linear_history = false
  allow_force_pushes    = false
  allow_deletions       = false
}

resource "github_branch_protection" "develop" {
  repository_id = github_repository.qoomb.node_id
  pattern       = "develop"

  required_status_checks {
    strict   = false
    contexts = [
      "CI / quality",
      "CI / test",
      "Version Check / version-consistency",
    ]
  }

  required_pull_request_reviews {
    dismiss_stale_reviews           = true
    require_code_owner_reviews      = false
    required_approving_review_count = 0
    require_last_push_approval      = true
  }

  enforce_admins        = false
  require_linear_history = false
  allow_force_pushes    = false
  allow_deletions       = false
}
```

---

## Rationale

### Why Two-Tier Protection?

**Main Branch:**

- Production-ready code only
- Strictest validation (all CI checks, security scans)
- Requires branch to be up-to-date (prevents integration issues)
- Code review recommended (configurable based on team size)

**Develop Branch:**

- Active development work
- Fast iteration (no required approvals)
- Flexible merging (no "up to date" requirement)
- Still requires CI quality checks
- Security validated later (on main)

### Why No Linear History Requirement?

- **Preserve PR context:** Merge commits show which changes were part of a PR
- **Release Please compatibility:** Works with merge commits
- **Team collaboration:** Easier for distributed teams
- **Can enable later:** If git history becomes messy, switch to rebase workflow

### Why Block Force Pushes (Even on Develop)?

- **Protect git history:** Prevents accidental loss of commits
- **Release Please dependency:** Requires intact commit history for version calculation
- **Team safety:** Other developers might have pulled the branch
- **Exception for emergencies:** Admins can still force-push if absolutely necessary

### Why No Code Scanning on Develop?

- **Performance:** Security scans can be slow (~2-5 minutes)
- **Developer experience:** Faster merge cycle for WIP features
- **Still validated:** All code goes through main before production
- **Trade-off:** Acceptable risk for development branch

---

## Comparison Table

| Setting                | Main Branch            | Develop Branch          | Reason for Difference               |
| ---------------------- | ---------------------- | ----------------------- | ----------------------------------- |
| **Require PR**         | ✅ Yes                 | ✅ Yes                  | Both need review process            |
| **Required approvals** | 0-1                    | 0                       | Develop allows faster iteration     |
| **Status checks**      | ✅ All checks          | ✅ Quality + Tests only | Main needs full security validation |
| **Strict up-to-date**  | ✅ Yes                 | ❌ No                   | Main prevents integration issues    |
| **Block force push**   | ✅ Yes                 | ✅ Yes                  | Both protect history                |
| **Restrict deletion**  | ✅ Yes                 | ✅ Yes                  | Both are long-lived branches        |
| **Linear history**     | ❌ No                  | ❌ No                   | Both allow merge commits            |
| **Signed commits**     | ❌ No (optional)       | ❌ No                   | Can enable later for both           |
| **Code scanning**      | ✅ Yes (Critical/High) | ❌ No                   | Main is security gate               |

---

## Workflow Example

### Feature Development

```bash
# 1. Create feature branch from develop
git checkout develop
git pull
git checkout -b feature/awesome-feature

# 2. Make changes, commit using conventional commits
git commit -m "feat: Add awesome feature"

# 3. Push and create PR to develop
git push -u origin feature/awesome-feature
gh pr create --base develop --title "feat: Add awesome feature"

# 4. CI runs: quality, tests, version-check
# 5. Merge to develop (no approval needed, CI must pass)

# 6. Later: Create PR from develop to main
gh pr create --base main --head develop --title "chore: Merge develop to main"

# 7. CI runs: ALL checks (quality, tests, security, version)
# 8. Review + approval (if required)
# 9. Merge to main
# 10. Release Please analyzes commits and creates release PR
```

---

## Exceptions and Overrides

### When to Override Protection

**Scenario 1: Emergency Hotfix**

- Create hotfix branch from main
- Fix critical bug
- Create PR directly to main
- All checks still apply, but can expedite review

**Scenario 2: Broken CI**

- If CI is broken due to external factors (e.g., npm registry down)
- Admin can temporarily disable protection
- Fix issue, re-enable protection immediately
- Document in PR why protection was bypassed

**Scenario 3: Initial Setup**

- When setting up the repository for the first time
- Can commit directly to main/develop
- Enable protection rules after initial setup

### Admin Bypass

- Admins can bypass all protection rules if absolutely necessary
- **Use sparingly** - defeats the purpose of protection
- Document reason in commit message or issue
- Re-enable strict protection after emergency

---

## Maintenance

### Review Branch Protection Quarterly

- Check if status checks are still relevant
- Adjust approval requirements based on team size
- Review security scanning thresholds
- Update this document with changes

### When to Update

**Add new status check:**

1. Update CI workflow to add new check
2. Wait for check to run successfully on a few PRs
3. Add to required status checks list
4. Update this document

**Remove status check:**

1. Confirm check is no longer needed
2. Remove from required status checks
3. Update CI workflow to stop running check
4. Update this document

**Change approval requirements:**

1. Discuss with team
2. Update branch protection settings
3. Announce change to team
4. Update this document

---

## Troubleshooting

### PR Cannot Be Merged

**Problem:** "Required status check 'X' is expected"

**Solution:**

- Check if the status check failed
- If check doesn't exist, update branch protection to remove it
- If check is queued, wait for it to complete

**Problem:** "Branch is out of date"

**Solution:**

- Click "Update branch" button in PR
- Or: `git rebase origin/main` (for main PRs)
- Or: Merge main/develop into your branch

**Problem:** "Review required"

**Solution:**

- Request review from code owner or team member
- Wait for approval
- Or: Admin can bypass (emergency only)

### Force Push Blocked

**Problem:** "Protected branch update failed"

**Solution:**

- **Don't force push to main/develop**
- Create a new PR with corrected commits
- Or: Admin can temporarily disable protection (emergency only)
- Or: Use `git revert` instead of force push

### Status Check Always Failing

**Problem:** CI check fails consistently on all PRs

**Solution:**

1. Fix underlying issue in codebase
2. If issue is with CI itself, fix CI workflow
3. Temporarily remove from required checks (last resort)
4. Document reason and plan to re-enable

---

## References

- [GitHub Branch Protection Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Release Please](https://github.com/googleapis/release-please)
- [CodeQL](https://codeql.github.com/)
- [Trivy](https://github.com/aquasecurity/trivy)

---

**Last Updated:** 2026-02-09
**Maintainer:** Benjamin Gröner (@bgroener)
**Version:** 1.0.0
