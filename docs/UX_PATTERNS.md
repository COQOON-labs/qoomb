# Qoomb UX Patterns

This document defines the UI/UX conventions we apply consistently across the Qoomb frontend.
It serves as the reference for all new components and reviews.

---

## 1. Icon Button Visibility

### Pattern: Always-visible at reduced opacity

**Problem:** Hiding action icons completely with `opacity-0` until hover (`group-hover:opacity-100`) makes
the UI feel clean but breaks two things:

1. **Touch screens have no hover state** — icons are permanently invisible on mobile/tablet
2. **Discoverability** — users don't know actions exist unless they accidentally hover

**Our rule:** Action icons are always visible at **40% opacity** at rest, reaching **100% on hover/focus/active**.

```tsx
// ✅ CORRECT — always discoverable, subtly present
className = 'opacity-40 hover:opacity-100 transition-opacity';

// Or with colour context:
className = 'text-muted-foreground/40 hover:text-destructive transition-colors';

// ❌ WRONG — invisible on touch devices
className = 'opacity-0 group-hover:opacity-100';
```

**Applied to:** star (favorite) button, trash (delete) button, drag handle.

---

## 2. Touch Target Size

### Minimum 44 × 44 px (WCAG 2.5.5)

All interactive elements must meet the WCAG 2.5.5 "Target Size" criterion.
The minimum recommended touch target is **44 × 44 px**.

```tsx
// ✅ CORRECT — p-2 (8px padding) + w-5 h-5 (20px icon) = 36px hit area
// Acceptable for dense list views; supplement with sufficient row height
<button type="button" className="p-2 rounded-md ...">
  <TrashIcon className="w-5 h-5" />
</button>

// ✅ BETTER for standalone targets — explicit min-size
<button type="button" className="min-w-[44px] min-h-[44px] flex items-center justify-center ...">
  <TrashIcon className="w-5 h-5" />
</button>

// ❌ WRONG — 28px total (p-1.5 + w-4 h-4), too small for touch
<button type="button" className="p-1.5 rounded-md ...">
  <TrashIcon className="w-4 h-4" />
</button>
```

**Row height compensates:** In dense list rows (`py-2.5`, total row ≥ 44 px), a single icon button with
`p-2` is acceptable. Standalone buttons outside rows must be `min-h-[44px]`.

---

## 3. Drag Handle Position

### Trailing (right side) for list items

**Problem:** A leading drag handle (leftmost position) misaligns content when the handle is hidden in
rows that don't support DnD — e.g., favorites have handles, non-favorites don't.

**Our rule:** Drag handles are placed **at the trailing (right) edge** of the row, after all other actions.

```
[emoji] [name / subtitle]  [star]  [trash]  [drag ≡]   ← SortableFavoriteRow
[emoji] [name / subtitle]  [star]  [trash]             ← regular ListRow
```

Benefits:

- Left edge of content (emoji) is **always aligned** across all rows
- Trailing drag handle matches iOS/iPadOS conventions (Apple Reminders, Things 3)
- Right thumb reaches the handle naturally on mobile
- Less risk of accidentally triggering drag when tapping to navigate

```tsx
// ✅ CORRECT — drag handle last
<div className="flex items-center gap-2 px-3 py-2.5">
  <span>{/* emoji */}</span>
  <div className="flex-1">{/* name */}</div>
  <button>{/* star */}</button>
  <button>{/* trash */}</button>
  <button {...listeners}>{/* drag handle — last */}</button>
</div>

// ❌ WRONG — drag handle first, creates spacing gap in rows without DnD
<div className="flex items-center gap-2 px-3 py-2.5">
  <button {...listeners}>{/* drag handle — first */}</button>
  <span>{/* emoji */}</span>
  ...
</div>
```

---

## 4. Search Behaviour in Lists

### Flat results during search; grouped sections at rest

When a user is searching, grouping / sectioning is disabled:

- Show a **flat, sorted list** of all matching items (favorites first, then alphabetical)
- Favorite items show a **filled star** so users can still toggle them
- Drag-to-reorder is **disabled during search** (reordering from filtered results is confusing)
- Section headings ("Favoriten", "Alle Listen") are hidden during search

When the search field is empty, return to the normal **two-section view** (favorites section with DnD +
all-lists section below).

```tsx
{q ? (
  // Flat search results — no DnD, star still works
  <div className="flex flex-col gap-2">
    {sortedLists.map((list) => <ListRow key={list.id} list={list} {...listRowProps} />)}
  </div>
) : (
  // Normal grouped view with DnD for favorites
  <>
    {favorites && <FavoritesDndSection ... />}
    {nonFavorites && <AllListsSection ... />}
  </>
)}
```

---

## 5. Star / Favorite Button States

| State                | Visual                                      |
| -------------------- | ------------------------------------------- |
| Not a favorite       | Outline star, `text-muted-foreground/40`    |
| Not favorite (hover) | Outline star, `text-primary` (full opacity) |
| Is a favorite        | Filled star, `fill-primary stroke-primary`  |
| Loading / pending    | Star disabled, opacity reduced              |

The filled state is always shown at full opacity — it's a confirmation of user action, not a secondary affordance.

---

## 6. Destructive Action Visibility

Trash (delete) and similarly destructive buttons follow the same opacity rules as other icon buttons:

- **At rest:** `text-muted-foreground/40` — present but unobtrusive
- **On hover/focus:** `text-destructive bg-destructive/10` — clear destructive signal

```tsx
// ✅ CORRECT
className =
  'p-2 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors';
```

Destructive actions always require **confirmation** (ConfirmDialog) before executing.

---

## 7. Row Padding Consistency

All list rows use the same padding so the content grid aligns visually:

```
px-3 py-2.5   — standard list row (ListRow, SortableFavoriteRow)
px-4 py-3.5   — ❌ do not use for list rows (causes visual discrepancy)
```

Icon sizes in list rows: `w-5 h-5` consistently.  
Emoji/icon column width: `w-8` (`text-xl leading-none w-8 text-center shrink-0`).

---

## References

- [WCAG 2.5.5 Target Size](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)
- [Apple HIG — Hit Targets](https://developer.apple.com/design/human-interface-guidelines/accessibility)
- [Material Design — Touch targets](https://m3.material.io/foundations/interaction/states/overview)
- [Tailwind opacity utilities](https://tailwindcss.com/docs/opacity)
