/**
 * Accessibility tests for AppShell
 *
 * Verifies that the application shell (sidebar + mobile nav + main area)
 * has no axe violations and meets WCAG 2.1 AA requirements.
 *
 * See docs/adr/0006-accessibility-standards.md
 */

import { screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  renderWithProviders,
  mockCurrentPerson,
  mockUser,
  makeLLStub,
  expectNoAxeViolations,
} from '../test/test-utils';
import { AppShell } from '../layouts/AppShell';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../i18n/i18n-react', () => ({
  useI18nContext: () => ({ LL: makeLLStub() }),
}));

vi.mock('../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: mockUser, logout: vi.fn() }),
}));

vi.mock('../hooks/useCurrentPerson', () => ({
  useCurrentPerson: () => mockCurrentPerson,
}));

vi.mock('../lib/trpc/client', () => ({
  trpc: {
    persons: {
      list: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
    },
    auth: {
      getSystemConfig: {
        useQuery: () => ({ data: { allowPasskeys: true }, isLoading: false }),
      },
    },
  },
}));

// Stub heavy sub-components that have their own data dependencies
vi.mock('../components/layout/EmailVerificationBanner', () => ({
  EmailVerificationBanner: () => null,
}));

vi.mock('../components/layout/UserMenu', () => ({
  UserMenu: ({ displayName }: { displayName: string }) => (
    <button type="button" aria-label={`Benutzermenü: ${displayName}`}>
      {displayName}
    </button>
  ),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AppShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders(
      <AppShell>
        <h1>Test Content</h1>
      </AppShell>,
      { initialEntries: ['/dashboard'] }
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('has no axe violations on the dashboard route', async () => {
    const { container } = renderWithProviders(
      <AppShell>
        <div>
          <h1>Übersicht</h1>
          <p>Dashboard content</p>
        </div>
      </AppShell>,
      { initialEntries: ['/dashboard'] }
    );

    await expectNoAxeViolations(container);
  });

  it('has no axe violations on the tasks route', async () => {
    const { container } = renderWithProviders(
      <AppShell>
        <div>
          <h1>Aufgaben</h1>
        </div>
      </AppShell>,
      { initialEntries: ['/tasks'] }
    );

    await expectNoAxeViolations(container);
  });

  it('renders desktop sidebar navigation', () => {
    renderWithProviders(
      <AppShell>
        <div>Content</div>
      </AppShell>,
      { initialEntries: ['/dashboard'] }
    );

    // Sidebar nav exists (desktop — may be visually hidden on mobile via CSS)
    const navElements = screen.getAllByRole('navigation');
    expect(navElements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders hive name in sidebar', () => {
    renderWithProviders(
      <AppShell>
        <div>Content</div>
      </AppShell>,
      { initialEntries: ['/dashboard'] }
    );

    expect(screen.getByText('Mustermann Familie')).toBeInTheDocument();
  });

  it('all nav buttons are keyboard-accessible (have accessible name)', () => {
    renderWithProviders(
      <AppShell>
        <div>Content</div>
      </AppShell>,
      { initialEntries: ['/dashboard'] }
    );

    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      // Every button must have either textContent or aria-label
      const accessibleName =
        btn.getAttribute('aria-label') ??
        btn.getAttribute('aria-labelledby') ??
        btn.textContent?.trim();
      expect(accessibleName, `button "${btn.outerHTML}" has no accessible name`).toBeTruthy();
    });
  });

  it('renders the Qoomb logo text', () => {
    renderWithProviders(
      <AppShell>
        <div>Content</div>
      </AppShell>,
      { initialEntries: ['/dashboard'] }
    );

    expect(screen.getByText('Qoomb')).toBeInTheDocument();
  });
});
