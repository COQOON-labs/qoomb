# ADR-0001: Use MADR for Architecture Decisions

**Status:** Accepted  
**Date:** 2026-02-20  
**Deciders:** Benjamin Gröner

## Context

As the Qoomb codebase grows, architectural decisions need to be documented so that:

- Future contributors (human and AI) understand **why** things are the way they are
- Decisions can be revisited with full context when circumstances change
- The project maintains consistency across modules and packages

Without formal records, rationale lives only in commit messages or people's heads — both are fragile.

## Decision

We adopt **MADR** (Markdown Architectural Decision Records) stored in `docs/adr/`.

**Conventions:**

- Files named `NNNN-short-slug.md` (zero-padded, sequential)
- Each ADR has: Status, Date, Context, Decision, Consequences
- Status lifecycle: `Proposed → Accepted → [Deprecated | Superseded by ADR-NNNN]`
- New ADRs are added to the index in `docs/adr/README.md`
- Referenced from `claude.md` and `.github/copilot-instructions.md` so AI assistants find them

## Consequences

### Easier

- Onboarding — new developers can read the "why" behind design choices
- AI context — Claude/Copilot can reference ADRs for consistent decisions
- Change management — revisiting a decision starts with reading the original ADR

### Harder

- Overhead — each significant decision requires writing an ADR (mitigated by the lightweight MADR format)
- Maintenance — index must be kept up to date (but it's a simple table)
