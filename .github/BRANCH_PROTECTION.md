# Branch Protection Configuration

This document describes the recommended branch protection rules for the Qoomb repository.

## Overview

Qoomb uses **GitHub Flow** with a single protected branch:

- **`main`**: Production-ready code, protected by CI checks and PR requirements
- **Feature branches**: Short-lived branches for development (`feat/`, `fix/`, `chore/`, etc.)

All changes reach `main` via pull requests. Release Please automates versioning and changelogs.

---

## Main Branch Protection

### 1. Require a pull request before merging

| Setting                    | Value                        | Why                                |
| -------------------------- | ---------------------------- | ---------------------------------- |
| Require PR                 | Yes                          | Ensures CI validation before merge |
| Required approvals         | 0 (solo) / 1 (team)          | Adjust based on team size          |
| Dismiss stale reviews      | Yes                          | Re-review after new pushes         |
| Require Code Owners review | Yes (when CODEOWNERS exists) | Domain expertise                   |
| Require last push approval | Yes                          | Prevents push-after-approve bypass |

### 2. Require status checks to pass

| Setting                     | Value |
| --------------------------- | ----- |
| Require checks before merge | Yes   |
| Require branch up to date   | Yes   |

**Required Status Checks:**

| Check                                        | Workflow          | Purpose                                             |
| -------------------------------------------- | ----------------- | --------------------------------------------------- |
| CI / Validate Commit Messages                | ci.yml            | Conventional Commits enforcement                    |
| CI / Code Quality                            | ci.yml            | Lint, format, type-check, build, Prisma consistency |
| CI / Tests                                   | ci.yml            | Unit/integration tests with PostgreSQL + Redis      |
| Version Check / Check Version Consistency    | version-check.yml | package.json version matches manifest               |
| Version Check / Prevent Manual Version Bumps | version-check.yml | Only Release Please changes versions                |
| CodeQL / Analyze                             | codeql.yml        | SAST security scanning                              |
| Trivy / Trivy Vulnerability Scan             | trivy.yml         | Dependency + config vulnerability scan              |
| Trivy / Trivy Repository Scan                | trivy.yml         | Secret detection                                    |

### 3. Additional settings

| Setting                | Value             | Why                                          |
| ---------------------- | ----------------- | -------------------------------------------- |
| Block force pushes     | Yes               | Protects history, required by Release Please |
| Restrict deletions     | Yes               | Main branch must never be deleted            |
| Require linear history | No                | Allows merge commits from PRs                |
| Require signed commits | No (enable later) | Optional for team/enterprise                 |

---

## Setup Instructions

### Via GitHub Web UI

1. Navigate to **Settings** > **Branches** > **Branch protection rules**
2. Click **Add rule**
3. Enter branch name pattern: `main`
4. Configure settings as described above
5. Click **Create** / **Save changes**

### Via GitHub CLI

```bash
gh api repos/COQOON-labs/qoomb/branches/main/protection \
  --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["CI / Code Quality","CI / Tests","CI / Validate Commit Messages","Version Check / Check Version Consistency","Version Check / Prevent Manual Version Bumps"]}' \
  --field enforce_admins=true \
  --field required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":false,"required_approving_review_count":0}' \
  --field restrictions=null \
  --field required_linear_history=false \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

---

## Workflow

```
1. Create feature branch from main
   git checkout main && git pull
   git checkout -b feat/my-feature

2. Develop, commit with conventional commits
   git commit -m "feat: Add new feature"

3. Push and create PR to main
   git push -u origin feat/my-feature

4. CI runs all checks automatically
   - Quality, tests, security scans, version validation

5. Merge to main (squash or merge commit)

6. Release Please analyzes commits and creates release PR
   - Automatic version bump + changelog
```

---

## Troubleshooting

### PR cannot be merged: "Required status check is expected"

- Check if the status check failed in the PR's Checks tab
- If check doesn't exist yet, it needs to run at least once before being added as required

### Force push blocked

- Use `git revert` instead of force-pushing to main
- Create a new PR with the corrected commits

### Branch is out of date

- Click **Update branch** in the PR, or rebase locally:
  ```bash
  git fetch origin && git rebase origin/main
  ```

---

**Last Updated:** 2026-02-15
**Maintainer:** Benjamin Groener (@Ben-Gee)
