/**
 * Tests for GroupsPage
 *
 * Verifies that the groups page renders the group list,
 * create form, deletion, and group detail view correctly.
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

import { GroupsPage } from './GroupsPage';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockGroups = [
  {
    id: 'group-001',
    name: 'Projektteam',
    description: 'Alle Projektmitglieder',
    memberCount: 3,
    createdAt: new Date('2025-01-15'),
  },
  {
    id: 'group-002',
    name: 'Elternrat',
    description: null,
    memberCount: 0,
    createdAt: new Date('2025-02-01'),
  },
];

const mockGroupDetail = {
  id: 'group-001',
  name: 'Projektteam',
  description: 'Alle Projektmitglieder',
  createdAt: new Date('2025-01-15'),
  members: [
    {
      id: 'membership-001',
      personId: 'person-001',
      displayName: 'Alice Mustermann',
      joinedAt: new Date('2025-01-15'),
    },
    {
      id: 'membership-002',
      personId: 'person-002',
      displayName: 'Bob Mustermann',
      joinedAt: new Date('2025-01-16'),
    },
  ],
};

const mockPersons = [
  {
    id: 'person-001',
    role: 'parent',
    displayName: 'Alice Mustermann',
    avatarUrl: null,
    createdAt: new Date(),
  },
  {
    id: 'person-002',
    role: 'child',
    displayName: 'Bob Mustermann',
    avatarUrl: null,
    createdAt: new Date(),
  },
  {
    id: 'person-003',
    role: 'member',
    displayName: 'Charlie Test',
    avatarUrl: null,
    createdAt: new Date(),
  },
];

const mutateFn = vi.fn();

// ── Per-test overrides ────────────────────────────────────────────────────────

let groupsOverride: { data: typeof mockGroups; isLoading: boolean } | null = null;
let groupDetailOverride: { data: typeof mockGroupDetail | null; isLoading: boolean } | null = null;

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
      groups: {
        list: { invalidate: vi.fn() },
        get: { invalidate: vi.fn() },
      },
    }),
    groups: {
      list: {
        useQuery: () => groupsOverride ?? { data: mockGroups, isLoading: false },
      },
      get: {
        useQuery: () => groupDetailOverride ?? { data: mockGroupDetail, isLoading: false },
      },
      create: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (...args: unknown[]) => {
            mutateFn(...args);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      delete: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (...args: unknown[]) => {
            mutateFn(...args);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      addMember: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (...args: unknown[]) => {
            mutateFn(...args);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      removeMember: {
        useMutation: () => ({
          mutate: mutateFn,
          isPending: false,
        }),
      },
    },
    persons: {
      list: {
        useQuery: () => ({ data: mockPersons, isLoading: false }),
      },
    },
  },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GroupsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    groupsOverride = null;
    groupDetailOverride = null;
  });

  // ── List view ───────────────────────────────────────────────────────────

  it('renders without crashing', () => {
    renderWithProviders(<GroupsPage />, { initialEntries: ['/groups'] });
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<GroupsPage />, {
      initialEntries: ['/groups'],
    });
    await expectNoAxeViolations(container);
  });

  it('displays page title', () => {
    renderWithProviders(<GroupsPage />, { initialEntries: ['/groups'] });
    expect(screen.getByText('groups.title')).toBeInTheDocument();
  });

  it('renders group names', () => {
    renderWithProviders(<GroupsPage />, { initialEntries: ['/groups'] });
    expect(screen.getByText('Projektteam')).toBeInTheDocument();
    expect(screen.getByText('Elternrat')).toBeInTheDocument();
  });

  it('renders group descriptions', () => {
    renderWithProviders(<GroupsPage />, { initialEntries: ['/groups'] });
    expect(screen.getByText('Alle Projektmitglieder')).toBeInTheDocument();
  });

  it('renders member counts', () => {
    renderWithProviders(<GroupsPage />, { initialEntries: ['/groups'] });
    expect(screen.getByText(/groups\.memberCount.*3/)).toBeInTheDocument();
  });

  it('shows new group button', () => {
    renderWithProviders(<GroupsPage />, { initialEntries: ['/groups'] });
    expect(screen.getByRole('button', { name: /groups\.newGroup/ })).toBeInTheDocument();
  });

  it('shows delete buttons for groups', () => {
    renderWithProviders(<GroupsPage />, { initialEntries: ['/groups'] });
    const deleteButtons = screen.getAllByRole('button', { name: /groups\.deleteGroup/ });
    expect(deleteButtons).toHaveLength(2);
  });

  it('opens create form when new group button is clicked', () => {
    renderWithProviders(<GroupsPage />, { initialEntries: ['/groups'] });
    fireEvent.click(screen.getByRole('button', { name: /groups\.newGroup/ }));
    expect(screen.getByText(/groups\.groupNameLabel/)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    groupsOverride = { data: [], isLoading: true };
    renderWithProviders(<GroupsPage />, { initialEntries: ['/groups'] });
    expect(screen.getByText(/common\.loading/)).toBeInTheDocument();
  });

  it('shows empty state when no groups', () => {
    groupsOverride = { data: [], isLoading: false };
    renderWithProviders(<GroupsPage />, { initialEntries: ['/groups'] });
    expect(screen.getByText(/groups\.emptyState\b/)).toBeInTheDocument();
    expect(screen.getByText(/groups\.emptyStateHint/)).toBeInTheDocument();
  });

  // ── Detail view ─────────────────────────────────────────────────────────

  it('navigates to group detail when group is clicked', () => {
    renderWithProviders(<GroupsPage />, { initialEntries: ['/groups'] });
    fireEvent.click(screen.getByText('Projektteam'));
    // Should see the detail view with back link and member list
    expect(screen.getByText(/groups\.backToGroups/)).toBeInTheDocument();
  });

  it('shows group members in detail view', () => {
    renderWithProviders(<GroupsPage />, { initialEntries: ['/groups'] });
    fireEvent.click(screen.getByText('Projektteam'));
    expect(screen.getByText('Alice Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Bob Mustermann')).toBeInTheDocument();
  });

  it('shows add member button in detail view', () => {
    renderWithProviders(<GroupsPage />, { initialEntries: ['/groups'] });
    fireEvent.click(screen.getByText('Projektteam'));
    expect(screen.getByRole('button', { name: /groups\.addMember/ })).toBeInTheDocument();
  });

  it('shows remove buttons for group members', () => {
    renderWithProviders(<GroupsPage />, { initialEntries: ['/groups'] });
    fireEvent.click(screen.getByText('Projektteam'));
    const removeButtons = screen.getAllByRole('button', { name: /groups\.removeMember/ });
    expect(removeButtons).toHaveLength(2);
  });

  it('navigates back to list from detail', () => {
    renderWithProviders(<GroupsPage />, { initialEntries: ['/groups'] });
    fireEvent.click(screen.getByText('Projektteam'));
    fireEvent.click(screen.getByText(/groups\.backToGroups/));
    // Should see the list view again with title
    expect(screen.getByText('groups.title')).toBeInTheDocument();
    expect(screen.getByText('Elternrat')).toBeInTheDocument();
  });

  // ── Accessibility ───────────────────────────────────────────────────────

  it('all buttons have accessible names', () => {
    renderWithProviders(<GroupsPage />, { initialEntries: ['/groups'] });
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
