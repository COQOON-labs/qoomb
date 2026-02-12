# Qoomb Design System

> Canonical reference for visual language, design tokens, and component usage.
>
> **Stack:** Tailwind CSS v4 (CSS-first) · Radix UI Primitives · Class Variance Authority (CVA)

---

## Design Direction

**"Lifestyle sport × lofi charme"** — bold, flat, graphic. Inspired by Adidas Archive:
strong typographic hierarchy, high-contrast yellow/black, clean surfaces. Not corporate,
not clinical — confident and personal.

### Key Principles

| Principle         | Expression                                                                       |
| ----------------- | -------------------------------------------------------------------------------- |
| **Bold**          | `font-black` (900) for headings and labels; no timid weights                     |
| **Flat**          | No gradients. Solid color blocks for emphasis (yellow date column, dark sidebar) |
| **Graphic**       | Uppercase tracking-wide for section labels; geometric shapes over organic        |
| **High contrast** | Yellow `#F5C400` on black `#000000` as the primary signal                        |
| **Personal**      | Rounded avatars, human-first layout (people strip before content)                |

---

## Color Tokens

Defined in [apps/web/src/styles/index.css](../apps/web/src/styles/index.css) as CSS
variables, mapped to Tailwind utilities via `@theme inline`.

### Light Mode (default)

| Token                     | CSS var                | Value     | Usage                                         |
| ------------------------- | ---------------------- | --------- | --------------------------------------------- |
| `bg-primary`              | `--primary`            | `#F5C400` | Buttons, active nav, date block, progress bar |
| `bg-primary-hover`        | `--primary-hover`      | `#D9AE00` | Hover state for primary elements              |
| `text-primary-foreground` | `--primary-foreground` | `#000000` | Text **on** primary (black on yellow)         |
| `bg-background`           | `--background`         | `#F8F7F5` | Page background (clean warm-white)            |
| `text-foreground`         | `--foreground`         | `#111110` | Primary text (near-black)                     |
| `bg-muted`                | `--muted`              | `#EFEEEB` | Hover states, secondary fills                 |
| `text-muted-foreground`   | `--muted-foreground`   | `#6B6B65` | Secondary/placeholder text                    |
| `border-border`           | `--border`             | `#DDDCDA` | Dividers, input borders, card borders         |
| `ring-ring`               | `--ring`               | `#F5C400` | Focus ring (matches primary)                  |
| `bg-card`                 | `--card`               | `#FFFFFF` | Card surfaces                                 |
| `text-card-foreground`    | `--card-foreground`    | `#111110` | Text inside cards                             |
| `bg-destructive`          | `--destructive`        | `#DC2626` | Delete, error states                          |
| `bg-success`              | `--success`            | `#16A34A` | Online status, completion states              |

### Dark Mode

Applied via `.dark` class or `@media (prefers-color-scheme: dark)`.
Only surface tokens change — primary yellow is unchanged in both modes.

| Token                | Dark value |
| -------------------- | ---------- |
| `--background`       | `#0F0F0E`  |
| `--foreground`       | `#FAFAF9`  |
| `--muted`            | `#1C1C1A`  |
| `--muted-foreground` | `#A8A29E`  |
| `--border`           | `#292524`  |
| `--card`             | `#1C1C1A`  |
| `--card-foreground`  | `#FAFAF9`  |

### Sidebar / DevTools (dark panel — always dark)

The sidebar and Dev Tools panel are always dark regardless of the app's light/dark mode.
Two CSS tokens are defined in `:root` (never inside a media query) and mapped to Tailwind
via `@theme inline` as `bg-dev-bg` and `bg-dev-surface`:

| Token          | CSS var         | Value     | Tailwind class      | Usage                        |
| -------------- | --------------- | --------- | ------------------- | ---------------------------- |
| Dev background | `--dev-bg`      | `#111110` | `bg-dev-bg`         | Panel background             |
| Dev surface    | `--dev-surface` | `#1A1A18` | `bg-dev-surface`    | Section fills, sticky header |
| Dividers       | —               | —         | `border-white/8`    | Section separators           |
| Primary text   | —               | —         | `text-white/75`     | Labels, values               |
| Muted text     | —               | —         | `text-white/40`     | Secondary labels             |
| Hover fill     | —               | —         | `hover:bg-white/10` | Interactive hover state      |

### Glow Utilities (status indicators)

Custom `@utility` classes in `index.css` for status dot glow effects.
Use these on status indicator dots — never inline `box-shadow` or arbitrary shadow values.

| Class              | `box-shadow`                       | Semantic meaning        |
| ------------------ | ---------------------------------- | ----------------------- |
| `glow-success`     | `0 0 8px var(--color-emerald-500)` | Online, healthy         |
| `glow-destructive` | `0 0 8px var(--color-red-500)`     | Offline, error          |
| `glow-primary`     | `0 0 8px var(--color-primary)`     | Unknown / warning       |
| `glow-muted`       | `0 0 8px rgb(255 255 255 / 0.4)`   | Loading / indeterminate |

```tsx
// ✅ Correct usage
<div
  className={cn(
    'w-2.5 h-2.5 rounded-full',
    isOnline ? 'bg-emerald-500 glow-success' : 'bg-red-500 glow-destructive'
  )}
/>
```

---

## Typography

**Font:** Inter (variable) — `--font-sans: "Inter", system-ui, sans-serif`

| Role                   | Classes                                      | Example                  |
| ---------------------- | -------------------------------------------- | ------------------------ |
| Hero heading           | `text-3xl font-black tracking-tight`         | Dashboard greeting       |
| Section label          | `text-sm font-black uppercase tracking-wide` | "WEITERE TERMINE"        |
| Nav label              | `text-xs font-bold uppercase tracking-wider` | "ÜBERSICHT"              |
| Card title / body bold | `text-sm font-bold` or `text-lg font-bold`   | Event title              |
| Body                   | `text-sm`                                    | Task title, descriptions |
| Meta / caption         | `text-xs text-muted-foreground`              | Date labels, timestamps  |
| Ghost decoration       | `text-[88px] font-black text-foreground/10`  | Large date number        |

**Rule:** Section-level labels are always uppercase + tracking-wide. Body copy is mixed-case.

---

## Spacing & Shape

| Element                   | Border radius   | Notes                        |
| ------------------------- | --------------- | ---------------------------- |
| Buttons                   | `rounded-lg`    | Square-ish, not pill         |
| Cards                     | `rounded-xl`    | Slightly softer than buttons |
| Avatar circles            | `rounded-full`  | Circular — never square      |
| Nav items                 | `rounded-xl`    | Pill-ish for hover target    |
| Inputs                    | `rounded-lg`    | Matches button radius        |
| Logo box / hive box       | `rounded-lg`    | Slightly geometric           |
| Progress bar / checkboxes | `rounded` (2px) | Very square — graphic feel   |
| Tags / badges             | `rounded`       | Square — no pill tags        |

---

## Component Variants

### Button (`@qoomb/ui`)

```tsx
<Button variant="primary" size="md">    // bg-primary, text-primary-foreground
<Button variant="secondary">           // bg-muted, text-foreground
<Button variant="outline">             // border-border, transparent bg
<Button variant="ghost">               // transparent, hover:bg-muted
<Button variant="destructive">         // bg-destructive, text-destructive-foreground

// Sizes: sm (h-8), md (h-10, default), lg (h-12)
// Props: asChild (Slot), isLoading (spinner), fullWidth
```

### Input (`@qoomb/ui`)

```tsx
<Input placeholder="..." />                 // default border-border
<Input state="error" error="Required" />    // border-destructive + red ring
// Props: label, error, helperText
```

### Card (`@qoomb/ui`)

```tsx
<Card padding="md">          // default — p-5
<Card padding="none">        // no padding (used for custom layouts)
<Card padding="sm">          // p-3
<Card padding="lg">          // p-8
<Card hoverable>             // transition-shadow hover:shadow-md cursor-pointer
```

---

## Layout Patterns

### App Shell

```
┌─────────────┬────────────────────────────────┐
│             │  Topbar (h-14, yellow stripe)  │
│  Sidebar    ├────────────────────────────────┤
│  (dark      │                                │
│  bg-        │  Main content                  │
│  foreground)│  (bg-background)               │
│             │                                │
└─────────────┴────────────────────────────────┘
```

**Sidebar** (`w-60`, `bg-foreground` = `#111110`):

- Always dark — yellow accents only
- Logo: yellow `rounded-lg` box + white brand text
- Active nav: `bg-primary text-primary-foreground` (yellow fill with black text)
- Inactive nav: `text-white/60 hover:text-white hover:bg-white/10`
- Dividers: `border-white/10`

**Topbar** (`h-14`, `bg-background`):

- Yellow 2px bottom border: `border-b-2 border-primary` — the "racing stripe"
- Notification dot: `bg-primary` circle

### People Strip (Locket-style)

Large circular avatars at the top — people before content. Each member has a distinct
saturated color (`bg-amber-400`, `bg-rose-400`, `bg-sky-400`, etc.) with online/offline dot.

### Date Block

The "next event" card uses a **solid yellow column** (`bg-primary`) as the left block
with the day number in `text-3xl font-black text-primary-foreground` (black on yellow).
This is the defining graphic moment of the content area.

### Editorial Ghost Number

A `text-[88px] font-black text-foreground/10` date number as a decorative backdrop
to the greeting — lofi editorial detail.

---

## Dev Tools Panel

Located in [apps/web/src/components/dev/](../apps/web/src/components/dev/).
**Dev mode only** — zero impact on production builds.

Uses the same dark panel aesthetic as the sidebar (`#111110`, `#F5C400`, `white/XX` text)
but implemented with inline styles (no Tailwind dependency from outside the app).

The floating tab button (`DEV` label) sits at the right edge: `#111110` → fills `#F5C400`
on hover, 2px yellow border always visible.

---

## Tailwind v4 Notes

- **No `tailwind.config.ts`** — configured entirely in CSS via `@theme inline`
- **`@source`** directive in `index.css` scans `packages/ui/src` to include shared component classes
- **Canonical v4 classes**: use `bg-linear-to-br` (not `bg-gradient-to-br`), `w-18` (not `w-[72px]`)
- **Type scale**: use `text-sm`, `text-xs` etc. — avoid `text-[13px]` / `text-[11px]` (px bypasses user font size preferences)
- **Tracking scale**: use `tracking-widest`, `tracking-wider` etc. — avoid `tracking-[0.08em]`
- **Custom utilities** (`@utility` in `index.css`): for semantic effects not in Tailwind's scale (e.g. `glow-success`, `glow-destructive`). Prefer this over arbitrary shadow values.
- **Intentional arbitrary values** (Dashboard only):
  - `text-[88px]` — ghost date decoration, no canonical step
  - `text-[10px]` — tiny date labels in the yellow date column, no canonical step
  - Directional panel shadows (`shadow-[-4px_0_16px_...]`) — offset colored shadows have no canonical class

---

## PWA Theme Color

`theme_color: '#F5C400'` in [apps/web/vite.config.ts](../apps/web/vite.config.ts).
Matches the primary brand yellow — shows in mobile browser chrome.

---

**Last Updated:** 2026-02-12
**Applies to:** Phase 1 design system (Dashboard prototype)
**Next review:** Phase 2 — Auth + full page layouts
