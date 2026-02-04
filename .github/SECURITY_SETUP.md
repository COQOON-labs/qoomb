# Security Setup Guide

This document explains the security scanning tools configured for the Qoomb project and how to enable GitHub's native security features.

## 🔐 Implemented Security Scans

### 1. ✅ Dependabot (Automated Dependency Updates)

**Status:** Configured via `.github/dependabot.yml`

**What it does:**

- Automatically checks for outdated dependencies weekly (every Monday)
- Creates PRs to update vulnerable or outdated packages
- Groups related updates together (e.g., all TypeScript packages, all NestJS packages)
- Ignores major version updates by default (to prevent breaking changes)

**Configuration:**

- Schedule: Weekly on Mondays at 06:00 UTC
- Groups: TypeScript, NestJS, React, Testing, Prisma, Patch updates
- Auto-labels PRs with `dependencies` and `automated`

**To enable:**

1. Go to your GitHub repository
2. Settings → Security → Dependabot → Enable Dependabot alerts
3. Settings → Security → Dependabot → Enable Dependabot security updates

---

### 2. ✅ CodeQL (Security Code Scanning)

**Status:** Configured via `.github/workflows/codeql.yml`

**What it does:**

- Static Application Security Testing (SAST)
- Scans TypeScript/JavaScript code for security vulnerabilities
- Detects common issues: SQL injection, XSS, insecure cryptography, etc.
- Uses `security-and-quality` query suite (comprehensive)

**Runs:**

- On every push to `main` and `develop`
- On every pull request
- Weekly on Mondays at 06:00 UTC

**Results:**

- Visible in GitHub Security tab → Code scanning alerts
- Automatically comments on PRs if issues found

**To view results:**

- Go to: Security → Code scanning → CodeQL

---

### 3. ✅ pnpm audit (Dependency Vulnerability Check)

**Status:** Integrated into `.github/workflows/ci.yml`

**What it does:**

- Checks for known vulnerabilities in npm dependencies
- Uses the National Vulnerability Database (NVD)
- Runs on every CI build

**Audit level:** Moderate (warns about moderate, high, critical vulnerabilities)

**Behavior:**

- Continues on error (doesn't fail the build)
- Logs warnings for review

**Run locally:**

```bash
pnpm audit
pnpm audit --fix  # Auto-fix vulnerabilities
```

---

### 4. ✅ Trivy (Multi-purpose Security Scanner)

**Status:** Configured via `.github/workflows/trivy.yml`

**What it does:**

- **Filesystem scan:** Checks dependencies for known vulnerabilities (CVEs)
- **Configuration scan:** Detects IaC misconfigurations (Docker, K8s, Terraform)
- **Secret scan:** Finds accidentally committed secrets (API keys, passwords)

**Runs:**

- On every push to `main` and `develop`
- On every pull request
- Weekly on Mondays at 07:00 UTC

**Severity levels:** Critical, High, Medium

**Results:**

- Uploaded to GitHub Security tab (SARIF format)
- Separate categories: `trivy-filesystem`, `trivy-config`, `trivy-secrets`

**Run locally:**

```bash
# Install Trivy
brew install aquasecurity/trivy/trivy

# Scan filesystem
trivy fs .

# Scan for secrets
trivy fs --scanners secret .

# Scan config files
trivy config .
```

---

### 5. ⚠️ Secret Scanning (GitHub Native - Manual Setup)

**Status:** Requires manual activation in GitHub

**What it does:**

- Automatically scans commits for known secret patterns
- Detects: API keys, tokens, private keys, passwords, etc.
- Partner program: Alerts service providers when their tokens leak
- Push protection: Prevents pushing commits with secrets

**To enable:**

#### Step 1: Enable Secret Scanning

1. Go to your GitHub repository
2. Settings → Security → Code security and analysis
3. Enable "Secret scanning"

#### Step 2: Enable Push Protection (Recommended)

1. Same location as above
2. Enable "Push protection"
3. This prevents accidental commits with secrets

#### Step 3: Configure Notifications

1. Settings → Security → Code security and analysis
2. Configure where alerts are sent (email, Slack, etc.)

**Supported secrets:**

- GitHub tokens
- AWS credentials
- Azure keys
- Google Cloud keys
- Stripe API keys
- Slack tokens
- And 200+ other patterns

**To view alerts:**

- Go to: Security → Secret scanning

---

## 📊 Security Dashboard

After enabling all features, your GitHub Security tab will show:

```
Security
├── Overview (Summary of all security issues)
├── Dependabot alerts (Vulnerable dependencies)
├── Code scanning (CodeQL + Trivy findings)
├── Secret scanning (Leaked credentials)
└── Security advisories (Your own advisories)
```

---

## 🔔 Notification Setup

### Recommended Notification Settings:

1. **Dependabot alerts:**
   - Notify on: High/Critical vulnerabilities
   - Channel: Email + GitHub notifications

2. **Code scanning:**
   - Notify on: All new alerts
   - Channel: PR comments + Email

3. **Secret scanning:**
   - Notify on: All alerts immediately
   - Channel: Email + Slack (if configured)

**To configure:**
Settings → Notifications → Security alerts

---

## 🚨 Handling Security Alerts

### Priority Levels:

| Severity     | Response Time   | Action                           |
| ------------ | --------------- | -------------------------------- |
| **Critical** | Within 24 hours | Immediate fix + hotfix release   |
| **High**     | Within 1 week   | Schedule fix in next sprint      |
| **Medium**   | Within 1 month  | Add to backlog                   |
| **Low**      | Best effort     | Review during dependency updates |

### Workflow:

1. **Alert received** → Investigate in GitHub Security tab
2. **Assess impact** → Is this actually exploitable in our code?
3. **Fix or dismiss:**
   - **Fix:** Update dependency, apply patch, refactor code
   - **Dismiss:** Document why (false positive, not applicable, etc.)
4. **Verify:** Re-run scans to confirm fix
5. **Document:** Add to CHANGELOG if user-facing

---

## 🛡️ Best Practices

### For Developers:

1. **Review Dependabot PRs weekly**
   - Don't let them pile up
   - Test thoroughly before merging

2. **Never commit secrets**
   - Use environment variables
   - Use `.env` files (gitignored)
   - Use secret management tools (Vault, AWS Secrets Manager)

3. **Fix security issues before features**
   - Security bugs are higher priority
   - Don't accumulate security debt

4. **Run security scans locally**

   ```bash
   pnpm audit
   trivy fs .
   ```

5. **Keep dependencies up-to-date**
   - Review outdated packages monthly
   - Don't stay on EOL versions

### For Repository Admins:

1. **Enable branch protection:**
   - Require status checks to pass
   - Include security scans in required checks

2. **Set up security policy:**
   - Create `SECURITY.md` with vulnerability reporting process
   - Define security contact email

3. **Regular security reviews:**
   - Review Security tab weekly
   - Triage and assign alerts

4. **Enable two-factor authentication (2FA):**
   - Require 2FA for all contributors
   - Use hardware security keys for admins

---

## 📖 Additional Resources

- [GitHub Security Best Practices](https://docs.github.com/en/code-security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [npm Security Best Practices](https://docs.npmjs.com/security-best-practices)
- [Trivy Documentation](https://aquasecurity.github.io/trivy/)
- [CodeQL Documentation](https://codeql.github.com/docs/)

---

## 🔧 Troubleshooting

### Dependabot PRs not appearing?

Check:

- Is Dependabot enabled? (Settings → Security → Dependabot)
- Are there updates available? (Check `pnpm outdated`)
- Is the repository public/private? (Private repos need GitHub Advanced Security)

### CodeQL failing?

Check:

- Does the code compile? (CodeQL needs buildable code)
- Are dependencies installed? (pnpm install should run first)
- Check workflow logs for specific errors

### Trivy reporting too many false positives?

Create `.trivyignore` file:

```
# Example: Ignore specific CVE
CVE-2021-12345

# Ignore all low severity
SEVERITY:LOW
```

### pnpm audit showing unfixable vulnerabilities?

Options:

1. Wait for upstream fix
2. Find alternative package
3. Override with `pnpm.overrides` in package.json (risky!)
4. Accept risk if not exploitable in your use case

---

**Last updated:** 2026-02-04
