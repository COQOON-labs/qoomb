# Contributing to Qoomb

Thank you for your interest in contributing to Qoomb! This guide explains the process for submitting changes and engaging with the project maintainers.

## Before You Start

- **Read the license.** Qoomb uses the [Fair Source License v1.0](LICENSE.md). By contributing, you agree to the [Contributor License Agreement (CLA)](LICENSE.md#contributor-license-agreement-cla).
- **Check existing issues.** Look through [open issues](https://github.com/COQOON-labs/qoomb/issues) to see if your idea or bug is already tracked.
- **Security vulnerabilities.** Do **not** open a public issue. Follow the [Security Policy](SECURITY.md) instead.

## Development Setup

### Prerequisites

- Node.js 24+
- pnpm 10+
- Docker & Docker Compose (for PostgreSQL + Redis)
- mkcert (for local HTTPS)

### Getting Started

```bash
# Clone your fork
git clone https://github.com/<your-username>/qoomb.git
cd qoomb

# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL + Redis)
docker compose up -d

# Run database migrations
pnpm --filter @qoomb/api db:migrate

# Start development servers
pnpm dev
```

For local HTTPS and mobile testing, see [docs/LOCAL_DEVELOPMENT.md](docs/LOCAL_DEVELOPMENT.md).

## Contribution Workflow

### 1. Fork & Branch

```bash
# Fork the repo on GitHub, then:
git checkout -b <type>/<short-description>
```

Branch naming convention:

| Prefix      | Use for                   |
| ----------- | ------------------------- |
| `feat/`     | New features              |
| `fix/`      | Bug fixes                 |
| `docs/`     | Documentation changes     |
| `refactor/` | Code restructuring        |
| `test/`     | Adding or improving tests |
| `chore/`    | Build, CI, tooling        |

### 2. Make Your Changes

- Follow the existing code patterns (see `claude.md` for architecture details)
- Use TypeScript — no `any` types
- Add Zod validation for new API inputs
- Use `@EncryptFields` / `@DecryptFields` for sensitive data
- Use `hiveProcedure` for hive-scoped operations

### 3. Commit

We enforce [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:** `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`, `revert`

**Examples:**

```text
feat(events): add recurrence rule support
fix(auth): prevent token reuse after rotation
docs: update security architecture guide
```

Pre-commit hooks will auto-format your code with Prettier. Pre-push hooks will validate types, tests, and build.

### 4. Open a Pull Request

- Target the `main` branch
- Fill in the PR template
- Ensure all CI checks pass (Code Quality, Tests, Commit Messages)
- Request a review from `@ben`

### What happens next

1. CI runs automatically (lint, type-check, test, build, security scans)
2. A maintainer reviews your PR
3. You may be asked to make changes — push additional commits to your branch
4. Once approved, the PR is merged via squash or merge commit

## Code Standards

| Rule                     | Enforced by          |
| ------------------------ | -------------------- |
| Formatting (Prettier)    | Pre-commit hook      |
| Linting (ESLint)         | CI + pre-push hook   |
| Type safety (TypeScript) | CI + pre-push hook   |
| Conventional Commits     | Commitlint + CI      |
| Security scanning        | CodeQL + Trivy in CI |
| No secrets in code       | Trivy secret scanner |

## Project Structure

```text
apps/api/        → NestJS backend (tRPC, Prisma, encryption)
apps/web/        → React 19 PWA frontend (Vite)
apps/mobile/     → Capacitor mobile wrapper
packages/types/  → Shared TypeScript types
packages/validators/ → Shared Zod schemas
packages/ui/     → Shared React components
packages/config/ → Shared tsconfig
packages/eslint-config/ → Shared ESLint rules
```

## Getting Help

- **Questions:** Open a [Discussion](https://github.com/COQOON-labs/qoomb/discussions) or an issue tagged `question`
- **Bugs:** Open an issue with steps to reproduce
- **Security:** Follow [SECURITY.md](SECURITY.md)
- **Maintainer:** Benjamin Gröner ([bgroener@coqoon.com](mailto:bgroener@coqoon.com))

## Recognition

All contributors are recognized in [CONTRIBUTORS.md](CONTRIBUTORS.md) and release notes. See the [contribution types](CONTRIBUTORS.md#contribution-types) for the different ways you can contribute.
