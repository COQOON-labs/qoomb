# Qoomb - Development Guidelines

## JSON Files

- **No comments in `.json` files.** JSON does not support comments (`//` or `/* */`). Do not add comments to any `.json` file, including `tsconfig.json`, `package.json`, and all other JSON configuration files. This is enforced by `eslint-plugin-jsonc` with the `jsonc/no-comments` rule.
- If you need to explain a JSON setting, use a `README.md` next to it, a commit message, or inline documentation in code that references the config.
- Run `pnpm lint:json` to check all JSON files for comments.

## Linting

- TypeScript/TSX: `pnpm lint` (runs ESLint via turbo across all packages)
- JSON: `pnpm lint:json` (runs `jsonc/no-comments` rule on all JSON files)
- Formatting: `pnpm format` (Prettier on ts, tsx, md, json files)
- Pre-commit hooks run both Prettier and JSON linting on staged files via lint-staged.

## Project Structure

- Monorepo managed with pnpm workspaces and Turborepo
- `apps/api` - NestJS backend
- `apps/web` - React frontend
- `apps/mobile` - Mobile app
- `packages/eslint-config` - Shared ESLint configuration
- `packages/types` - Shared TypeScript types
- `packages/ui` - Shared UI components
- `packages/validators` - Shared validation schemas
