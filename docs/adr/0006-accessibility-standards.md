# ADR-0006: Frontend Accessibility Standards (WCAG 2.1 AA)

**Status:** Accepted  
**Date:** 2026-02-20  
**Deciders:** Benjamin Gröner

## Context

Qoomb is a hive organisation platform used by families and teams — including members who rely on
assistive technologies (screen readers, keyboard navigation, switch access, voice control). As a
privacy-first, open product that values inclusivity, accessibility is not optional.

Current state: the frontend lacks formal accessibility requirements, automated a11y testing, and
consistent semantic HTML patterns. Without a documented standard and automated enforcement,
regressions are invisible until reported by users.

Requirements:

1. **Legal compliance** — WCAG 2.1 Level AA is increasingly required by law (EU Accessibility
   Act 2025, EN 301 549). Non-compliance creates legal risk for commercial deployments.
2. **Assistive technology support** — screen readers (NVDA, JAWS, VoiceOver), keyboard-only
   navigation, and zoom/magnification must work without degradation.
3. **Mobile accessibility** — the app ships as a PWA and Capacitor native app. iOS VoiceOver and
   Android TalkBack must function correctly.
4. **Developer discipline** — accessibility rules must be enforced automatically (linting + tests)
   so individual developers do not have to rely on memory alone.
5. **Continuous regression prevention** — CI must block PRs that introduce a11y violations.

## Decision

We adopt **WCAG 2.1 Level AA** as the mandatory minimum standard for all user-facing frontend
code. Every component, page, and interaction pattern must meet this standard before merging.

### 1. Semantic HTML First

Use the most appropriate HTML element for every role. ARIA should augment HTML semantics, not
replace them.

```tsx
// ✅ GOOD: native semantics
<nav aria-label="Hauptnavigation">
  <ul>
    <li><a href="/dashboard" aria-current={isActive ? 'page' : undefined}>Übersicht</a></li>
  </ul>
</nav>

<button type="button" onClick={handleSubmit}>Speichern</button>

<main id="main-content">...</main>

// ❌ BAD: div soup with ARIA bolted on
<div role="navigation">
  <div role="listitem" onClick={...}>Übersicht</div>
</div>
<div role="button" onClick={handleSubmit}>Speichern</div>
```

**Rule:** Prefer `<button>`, `<a>`, `<nav>`, `<main>`, `<aside>`, `<header>`, `<section>`,
`<article>`, `<form>`, `<label>` over generic `<div>` / `<span>` with ARIA roles.

### 2. Keyboard Navigation

All interactive elements must be reachable and operable by keyboard alone.

- **Tab order** must follow visual reading order (left-to-right, top-to-bottom)
- **Focus indicators** must be visible (minimum 3:1 contrast ratio against adjacent colours)
- **Modal / dialog traps**: focus must be contained within an open dialog and restored on close
- **Skip links**: a "Skip to main content" link must be the first focusable element on every page
- **No `tabindex > 0`**: do not use positive `tabindex` values

```tsx
// ✅ GOOD: visible focus ring via Tailwind
<button className="... focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">

// ❌ BAD: globally removed focus outline
<button className="focus:outline-none">  // hides focus for keyboard users
```

### 3. Colour Contrast

All text and interactive components must meet WCAG AA contrast ratios:

| Element                             | Minimum ratio |
| ----------------------------------- | ------------- |
| Normal text (< 18pt or < 14pt bold) | 4.5 : 1       |
| Large text (≥ 18pt or ≥ 14pt bold)  | 3.0 : 1       |
| UI components and graphical objects | 3.0 : 1       |
| Focus indicators                    | 3.0 : 1       |

**Current design tokens to verify:**

- `primary` (`#F5C400`) on `foreground` (dark) — confirm via automated check
- `text-white/60` on `bg-foreground` — must meet 4.5:1 for body text
- `text-muted-foreground` on `bg-background` — must meet 4.5:1

### 4. ARIA Labels and Descriptions

Every interactive element without visible text must have an accessible name.

```tsx
// ✅ GOOD: icon-only button has aria-label
<button aria-label={LL.common.close()} onClick={onClose}>
  <XIcon className="w-4 h-4" />
</button>

// ✅ GOOD: landmark regions labelled
<nav aria-label={LL.nav.mainLabel()}>
<aside aria-label={LL.layout.sidebar()}>

// ✅ GOOD: dynamic content announced
<div role="status" aria-live="polite">{statusMessage}</div>

// ❌ BAD: icon-only button without label
<button onClick={onClose}>
  <XIcon />
</button>
```

### 5. Forms

- Every `<input>`, `<select>`, `<textarea>` must have an explicit `<label>` with matching `htmlFor`/`id`
- Do not use `placeholder` as the only label (it disappears on focus and has poor contrast)
- Error messages must be associated via `aria-describedby`
- Required fields must be indicated via `required` (or `aria-required="true"`) and communicated visually

```tsx
// ✅ GOOD
<label htmlFor="email">{LL.common.emailLabel()}</label>
<input
  id="email"
  type="email"
  required
  aria-describedby={error ? 'email-error' : undefined}
/>
{error && (
  <p id="email-error" role="alert" className="text-destructive text-sm">
    {error}
  </p>
)}

// ❌ BAD
<input type="email" placeholder="E-Mail" />
```

### 6. Images and Icons

- Decorative images: `alt=""` (empty)
- Informative images: descriptive `alt` text
- Icons used as buttons: sibling `<span className="sr-only">` or `aria-label` on parent button

```tsx
// ✅ GOOD: decorative icon, label on button
<button aria-label={LL.common.addEvent()}>
  <PlusIcon aria-hidden="true" />
</button>

// ✅ GOOD: informative image
<img src={avatarUrl} alt={`${displayName} Profilbild`} />

// ✅ GOOD: decorative image
<img src={decorativeBanner} alt="" />
```

### 7. Motion and Animation

Respect the `prefers-reduced-motion` media query. Transitions and animations must either be
disabled or reduced when the user has enabled this preference.

```css
/* In Tailwind / global CSS */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
  }
}
```

### 8. Live Regions

Use `aria-live` to announce dynamic content changes (form errors, loading states, notifications)
to screen readers.

```tsx
// ✅ Status messages (non-urgent)
<div role="status" aria-live="polite" aria-atomic="true">
  {savedMessage}
</div>

// ✅ Error alerts (urgent)
<div role="alert" aria-live="assertive">
  {criticalError}
</div>
```

### 9. Page Titles

Every route must set a descriptive `<title>` element. The format is:
`{Page Name} · Qoomb`

```tsx
// ✅ GOOD
<title>Übersicht · Qoomb</title>
<title>Aufgaben · Qoomb</title>
<title>Anmelden · Qoomb</title>
```

### 10. Testing Strategy

Accessibility is verified at three levels:

#### Level 1 — Automated (CI-enforced)

**Tool:** `vitest` + `vitest-axe` (wraps axe-core)

Every component and page must include an axe scan assertion:

```ts
import { axe } from 'vitest-axe';
import { render } from '@testing-library/react';

it('has no axe violations', async () => {
  const { container } = render(<MyComponent />);
  expect(await axe(container)).toHaveNoViolations();
});
```

Axe catches ~57% of WCAG issues automatically (missing labels, invalid ARIA, colour contrast,
missing alt text, etc.). CI will fail on any axe violation.

#### Level 2 — Keyboard smoke tests (CI-enforced)

Using `@testing-library/user-event` to simulate Tab, Enter, Escape, and Arrow key navigation
through critical flows (login, dashboard navigation, form submission).

#### Level 3 — Manual audits (release-gated)

Before each minor release:

- Screen reader walkthrough with VoiceOver (macOS / iOS) and NVDA (Windows)
- Keyboard-only navigation of all flows
- Zoom to 200% — no horizontal scroll, no content clipping
- Filed as a GitHub issue checklist item in the release PR

### 11. ESLint Enforcement

The `eslint-plugin-jsx-a11y` rules are enabled in `packages/eslint-config/react.js`:

- `jsx-a11y/alt-text` — images must have alt
- `jsx-a11y/aria-props` — valid ARIA attribute names
- `jsx-a11y/aria-role` — valid ARIA role values
- `jsx-a11y/interactive-supports-focus` — interactive elements must be focusable
- `jsx-a11y/label-has-associated-control` — labels must be associated with controls
- `jsx-a11y/no-autofocus` — warn on autofocus (can disorient screen reader users)
- `jsx-a11y/click-events-have-key-events` — click handlers need keyboard equivalents

### 12. Component Checklist

Every new component PR must pass this checklist before merge:

- [ ] Passes axe scan (`it('has no axe violations', ...)`)
- [ ] All interactive elements reachable by Tab
- [ ] Colour contrast verified (automated or design token audit)
- [ ] Icon-only buttons have `aria-label`
- [ ] Form inputs have associated `<label>`
- [ ] Error states use `role="alert"` or `aria-describedby`
- [ ] Decorative images have `alt=""`
- [ ] Respects `prefers-reduced-motion`
- [ ] Works at 200% browser zoom

## Consequences

### Positive

- Users who rely on assistive technologies can use Qoomb fully
- Legal compliance with EU Accessibility Act (EAA) for commercial deployments
- Automated enforcement prevents regressions without manual audit overhead
- Better HTML semantics improve SEO and overall code quality
- Screen reader users get correct announcements for all dynamic content

### Negative / Tradeoffs

- Existing components require an accessibility audit pass (one-time debt)
- All new components require axe tests — adds ~10-20 lines per component test file
- Some current `<button>` elements (icon-only in AppShell) need `aria-label` additions
- ESLint plugin adds ~5-10 new lint rules that may surface existing issues to fix

### Migration Plan

1. Install `eslint-plugin-jsx-a11y` and enable rules in `packages/eslint-config/react.js`
2. Fix surfaced ESLint errors in existing components
3. Install `vitest`, `@testing-library/react`, `vitest-axe`, configure `vitest.config.ts`
4. Add axe smoke tests for `AppShell`, `Dashboard`, `LoginPage`, `RegisterPage`
5. Add axe tests for all new components going forward (enforced in PR checklist)
6. Manual VoiceOver audit before 0.2.0 release
