/**
 * Tests for MembersPage
 *
 * Verifies that the members page renders the member list,
 * invite form, role changes, and removal correctly.
 *
 * See docs/adr/0006-accessibility-standards.md
 */

import { screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  renderWithProviders,
  mockUser,
  makeLLStub,
  expectNoAxeViolations,
} from '../test/test-utils';

import { MembersPage } from './MembersPage';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockMembers = [
  {
    id: 'person-001',
    role: 'parent',
    displayName: 'Alice Mustermann',
    avatarUrl: null,
    createdAt: new Date('2025-01-01'),
  },
  {
    id: 'person-002',
    role: 'child',
    displayName: 'Bob Mustermann',
    avatarUrl: null,
    createdAt: new Date('2025-02-01'),
  },
  {
    id: 'person-003',
    role: 'member',
    displayName: null,
    avatarUrl: null,
    createdAt: new Date('2025-03-01'),
  },
];

const mutateFn = vi.fn();

// ── Per-test overrides ────────────────────────────────────────────────────────

let membersOverride: { data: typeof mockMembers; isLoading: boolean } | null = null;

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../layouts/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock('../i18n/i18n-react', () => ({
  useI18nContext: () => ({ LL: makeLLStub() }),
}));

vi.mock('../lib/auth/useAuth', () => ({
  useAuth: () => ({ user: mockUser, login: vi.fn(), logout: vi.fn() }),
}));

vi.mock('../lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      persons: {
        list: { invalidate: vi.fn() },
      },
    }),
    persons: {
      list: {
        useQuery: () => membersOverride ?? { data: mockMembers, isLoading: false },
      },
      invite: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (...args: unknown[]) => {
            mutateFn(...args);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      updateRole: {
        useMutation: () => ({
          mutate: mutateFn,
          isPending: false,
        }),
      },
      remove: {
        useMutation: () => ({
          mutate: mutateFn,
          isPending: false,
        }),
      },
      listInvitations: {
        useQuery: () => ({ data: [], isLoading: false, refetch: vi.fn() }),
      },
      resendInvitation: {
        useMutation: () => ({ mutate: mutateFn, isPending: false }),
      },
      revokeInvitation: {
        useMutation: () => ({ mutate: mutateFn, isPending: false }),
      },
    },
  },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MembersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    membersOverride = null;
  });

  it('renders without crashing', () => {
    renderWithProviders(<MembersPage />, { initialEntries: ['/members'] });
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<MembersPage />, {
      initialEntries: ['/members'],
    });
    await expectNoAxeViolations(container);
  });

  it('displays page title', () => {
    renderWithProviders(<MembersPage />, { initialEntries: ['/members'] });
    expect(screen.getByText('members.title')).toBeInTheDocument();
  });

  it('renders all member names', () => {
    renderWithProviders(<MembersPage />, { initialEntries: ['/members'] });
    expect(screen.getByText('Alice Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Bob Mustermann')).toBeInTheDocument();
    // Third member has no displayName — shows fallback
    expect(screen.getAllByText('—')).toHaveLength(1);
  });

  it('shows "(Du)" badge for current user', () => {
    renderWithProviders(<MembersPage />, { initialEntries: ['/members'] });
    // person-001 matches mockUser.personId
    expect(screen.getByText(/members\.you/)).toBeInTheDocument();
  });

  it('shows remove buttons only for other members', () => {
    renderWithProviders(<MembersPage />, { initialEntries: ['/members'] });
    const removeButtons = screen.getAllByRole('button', { name: /members\.removeMember/ });
    // Should have 2 remove buttons (not for current user person-001)
    expect(removeButtons).toHaveLength(2);
  });

  it('shows role selectors for other members', () => {
    renderWithProviders(<MembersPage />, { initialEntries: ['/members'] });
    const roleSelectors = screen.getAllByRole('combobox', { name: /members\.changeRole/ });
    expect(roleSelectors).toHaveLength(2);
  });

  it('shows invite button', () => {
    renderWithProviders(<MembersPage />, { initialEntries: ['/members'] });
    expect(screen.getByRole('button', { name: /members\.invite/ })).toBeInTheDocument();
  });

  it('opens invite form when invite button is clicked', () => {
    renderWithProviders(<MembersPage />, { initialEntries: ['/members'] });
    fireEvent.click(screen.getByRole('button', { name: /members\.invite/ }));
    expect(screen.getByText(/members\.inviteEmailLabel/)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    membersOverride = { data: [], isLoading: true };
    renderWithProviders(<MembersPage />, { initialEntries: ['/members'] });
    expect(screen.getByText(/common\.loading/)).toBeInTheDocument();
  });

  it('shows empty state when no members', () => {
    membersOverride = { data: [], isLoading: false };
    renderWithProviders(<MembersPage />, { initialEntries: ['/members'] });
    expect(screen.getByText(/members\.emptyState/)).toBeInTheDocument();
  });

  it('all buttons have accessible names', () => {
    renderWithProviders(<MembersPage />, { initialEntries: ['/members'] });
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      const name =
        btn.getAttribute('aria-label') ??
        btn.getAttribute('aria-labelledby') ??
        (btn.textContent ?? '').trim();
      expect(name, `button "${btn.outerHTML}" has no accessible name`).toBeTruthy();
    });
  });
});
