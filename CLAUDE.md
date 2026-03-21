# Claude Code — Qoomb

> **All project guidelines live in [`AGENTS.md`](./AGENTS.md).**
> This file contains only Claude-specific configuration.
> Do **not** duplicate content from AGENTS.md here.

## Include Project Guidelines

Claude Code automatically reads `CLAUDE.md`. The universal project rules are in `AGENTS.md`.
Claude must read and follow `AGENTS.md` as if its contents were part of this file.

## MCP Servers

GitNexus is configured in `.mcp.json` (project-scope) and provides a code knowledge graph.
Use GitNexus tools (`query`, `context`, `impact`, `detect_changes`, `rename`, `cypher`) for
code understanding, debugging, impact analysis, and refactoring tasks.

Before any architecture or refactoring task:

1. Read `gitnexus://repo/qoomb/context` — check index freshness
2. Match your task to a skill in `.claude/skills/gitnexus/` and follow its workflow

## Claude-Specific Rules

- **Co-Authored-By trailers:** NEVER add `Co-Authored-By:` trailers to commit messages — not for Claude, not for any AI tool. This is enforced by the `commit-msg` hook.
- **Version bumps:** NEVER increment version numbers in `package.json` or `.release-please-manifest.json`. Only Release Please manages versions.
- **Commit style:** Follow Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, etc.). The `commit-msg` hook enforces this via commitlint.
