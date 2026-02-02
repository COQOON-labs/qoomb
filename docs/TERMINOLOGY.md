# Qoomb Terminology Guide 🐝

This document explains the core terminology used throughout Qoomb and the reasoning behind it.

## Core Concept: Hive 🐝

### Why "Hive"?

Qoomb's name is inspired by **honeycomb** (the structure bees build). Following this theme:
- **Qoomb** ≈ Comb (Wabe)
- **Hive** = Bienenstock (where the community lives)

A **hive** represents an organized group working together - primarily families, but the generic name allows for future flexibility (teams, clubs, etc.) without requiring code changes.

### What is a Hive?

A **Hive** is the top-level organizational unit in Qoomb. It represents a group of people organizing their events, tasks, and coordination.

```typescript
interface Hive {
  id: string;
  name: string;
}
```

**Examples:**
- "Mustermann Hive" (Familie Mustermann)
- "Schmidt Family Hive"
- "Müller Household"

---

## Terminology Mapping

### Old vs New

| Old Term | New Term | Deutsch | Notes |
| -------- | -------- | ------- | ----- |
| Family | **Hive** | Bienenstock / Gruppe | Generic name for any group |
| Family ID | **Hive ID** | Hive-ID | Unique identifier |
| Family member | **Hive member** | Mitglied | Person in a hive |
| Family schema | **Hive schema** | Schema | Database schema per hive |
| Multi-tenant | **Multi-hive** | Multi-Hive | Multiple isolated hives |

---

## Database Architecture

### Multi-Hive Isolation

Each hive gets its own PostgreSQL schema for complete data isolation:

```sql
-- Public schema (shared)
CREATE TABLE hives (
  id UUID PRIMARY KEY,
  name VARCHAR(255)
);

-- Per-hive schema (isolated)
CREATE SCHEMA hive_550e8400; -- UUID as schema name

CREATE TABLE hive_550e8400.persons (...);
CREATE TABLE hive_550e8400.events (...);
CREATE TABLE hive_550e8400.tasks (...);
```

**Benefits:**
- ✅ Complete data isolation
- ✅ Easy backups (per-hive)
- ✅ Scalable (can move hives to different databases)
- ✅ Simple permissions (schema-level access)

---

## Why "Hive" Instead of "Family"?

### 1. Future Flexibility
While families are the primary use case, using "Hive" allows the codebase to grow without major refactoring.

### 2. Consistent Theme
- Qoomb (≈ Comb/Wabe) 🐝
- Hive (Bienenstock) = where the community lives
- Members (Bienen) working together

### 3. Professional & Unique
- Not too generic ("Group", "Space")
- Not too specific ("Family")
- Memorable branding

### 4. Technical Benefits
- Clean, professional naming in code
- International (works in English & German)
- Extendable without breaking changes

---

## Quick Reference

| Term | What it is | Example |
| ---- | ---------- | ------- |
| **Hive** | Top-level organization | "Mustermann Hive" |
| **Person** | Member of a hive | "Max Mustermann" |
| **User** | Login account | max@example.com |
| **Hive ID** | Unique identifier | 550e8400-e29b-41d4-a716-446655440000 |
| **Hive Schema** | Database schema | `hive_550e8400` |

---

## FAQ

**Q: Is "family" still the primary use case?**
A: Absolutely! Most hives will be families. The generic term just provides flexibility for the future.

**Q: Why not just call it "Group" or "Space"?**
A: "Hive" is unique, ties into the Qoomb/bee theme, and feels more warm/collaborative.

**Q: Will the UI still say "Familie" in German?**
A: Yes! We can use context-aware labels in the UI while keeping "Hive" in the code.

---

🐝 **Remember:** A hive is where the community lives and works together!
