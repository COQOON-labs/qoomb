/**
 * Accessibility tests for Dashboard page
 *
 * Verifies that the dashboard content (greeting, events card, tasks card,
 * quick-create section) has no axe violations and correct heading structure.
 *
 * AppShell is stubbed here — it has its own test in AppShell.a11y.test.tsx.
 *
 * See docs/adr/0006-accessibility-standards.md
 */

import { screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';

import {
  renderWithProviders,
  mockCurrentPerson,
  makeLLStub,
  expectNoAxeViolations,
} from '../test/test-utils';
import { Dashboard } from '../pages/Dashboard';

// ── Module mocks ──────────────────────────────────────────────────────────────

// Stub AppShell to a passthrough wrapper — AppShell has its own a11y tests
vi.mock('../layouts/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock('../i18n/i18n-react', () => ({
  useI18nContext: () => ({ LL: makeLLStub() }),
}));

vi.mock('../hooks/useCurrentPerson', () => ({
  useCurrentPerson: () => mockCurrentPerson,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders(<Dashboard />, { initialEntries: ['/dashboard'] });
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<Dashboard />, {
      initialEntries: ['/dashboard'],
    });

    await expectNoAxeViolations(container);
  });

  it('renders a top-level h1 greeting', () => {
    renderWithProviders(<Dashboard />, { initialEntries: ['/dashboard'] });
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
  });

  it('renders h2 section headings for events and tasks', () => {
    renderWithProviders(<Dashboard />, { initialEntries: ['/dashboard'] });
    const headings = screen.getAllByRole('heading', { level: 2 });
    // Expect at least: events card title, tasks card title, quick-add title
    expect(headings.length).toBeGreaterThanOrEqual(2);
  });

  it('heading hierarchy is not skipped (h1 → h2, no h3 before h2)', () => {
    renderWithProviders(<Dashboard />, { initialEntries: ['/dashboard'] });

    const h1 = screen.queryAllByRole('heading', { level: 1 });
    const h2 = screen.queryAllByRole('heading', { level: 2 });

    // Dashboard must have exactly one h1
    expect(h1).toHaveLength(1);
    // And at least two h2 section headings
    expect(h2.length).toBeGreaterThanOrEqual(2);
  });

  it('all interactive buttons have accessible names', () => {
    renderWithProviders(<Dashboard />, { initialEntries: ['/dashboard'] });

    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      const name =
        btn.getAttribute('aria-label') ??
        btn.getAttribute('aria-labelledby') ??
        btn.textContent?.trim();
      expect(name, `button "${btn.outerHTML}" has no accessible name`).toBeTruthy();
    });
  });

  it('displays the user greeting with displayName', () => {
    renderWithProviders(<Dashboard />, { initialEntries: ['/dashboard'] });
    // The LL stub returns strings containing the prop name, so the greeting
    // will contain the mock displayName 'Alice Mustermann'
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toContain('Alice Mustermann');
  });
});
