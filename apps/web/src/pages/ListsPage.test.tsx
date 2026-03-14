/**
 * Tests for ListsPage
 *
 * Verifies that the lists overview page renders correctly,
 * handles CRUD operations, and is accessible.
 *
 * See docs/adr/0006-accessibility-standards.md
 */

import { screen, fireEvent, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  renderWithProviders,
  mockUser,
  makeLLStub,
  expectNoAxeViolations,
} from '../test/test-utils';

import { ListsPage } from './ListsPage';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockLists = [
  {
    id: 'list-001',
    name: 'Shopping List',
    icon: '🛒',
    systemKey: null,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'list-002',
    name: 'Tasks',
    icon: null,
    systemKey: 'tasks',
    isArchived: false,
    createdAt: '2026-01-02T00:00:00.000Z',
  },
];

const mockTemplates = [
  { id: 'tpl-001', name: 'To-Do', icon: '✅', description: null },
  { id: 'tpl-002', name: 'Shopping', icon: '🛒', description: null },
];

const mutateFn = vi.fn();

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

// ── Per-test overrides for query data ──────────────────────────────────────────

let listQueryOverride: { data: unknown; isLoading: boolean } | null = null;

vi.mock('../lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      lists: {
        list: { invalidate: vi.fn() },
      },
    }),
    lists: {
      list: {
        useQuery: () => listQueryOverride ?? { data: mockLists, isLoading: false },
      },
      listTemplates: {
        useQuery: () => ({ data: mockTemplates, isLoading: false }),
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
        useMutation: () => ({
          mutate: mutateFn,
          isPending: false,
        }),
      },
    },
  },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ListsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listQueryOverride = null;
  });

  it('renders without crashing', () => {
    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<ListsPage />, {
      initialEntries: ['/lists'],
    });
    await expectNoAxeViolations(container);
  });

  it('displays the list title heading', () => {
    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toBeInTheDocument();
  });

  it('renders all lists from the query', () => {
    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });
    expect(screen.getByText('Shopping List')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });

  it('renders list icons', () => {
    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });
    expect(screen.getByText('🛒')).toBeInTheDocument();
    // Default icon for list without icon
    expect(screen.getByText('📋')).toBeInTheDocument();
  });

  it('shows the create form when "New list" button is clicked', () => {
    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });

    const newBtn = screen.getByRole('button', { name: /lists\.newList/i });
    fireEvent.click(newBtn);

    // Form should now be visible with an input and submit button
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('shows template picker in create form when templates exist', () => {
    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });

    const newBtn = screen.getByRole('button', { name: /lists\.newList/i });
    fireEvent.click(newBtn);

    // Template select should be present
    const select = screen.getByRole('combobox');
    expect(select).toBeInTheDocument();

    // Should have blank + 2 templates = 3 options
    const options = within(select).getAllByRole('option');
    expect(options).toHaveLength(3);
  });

  it('cancel button hides the create form', () => {
    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });

    // Open form
    fireEvent.click(screen.getByRole('button', { name: /lists\.newList/i }));
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // Cancel
    const cancelBtn = screen.getByRole('button', { name: /common\.cancel/i });
    fireEvent.click(cancelBtn);

    // Form should be hidden, "New list" button back
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('does not show delete button for system lists', () => {
    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });

    // The "Tasks" list has systemKey='tasks' — it should not have a delete button
    // Check that there's only one delete button (for Shopping List)
    const deleteButtons = screen.getAllByRole('button', { name: /lists\.deleteList/i });
    expect(deleteButtons).toHaveLength(1);
  });

  it('all interactive buttons have accessible names', () => {
    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });

    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      const name =
        btn.getAttribute('aria-label') ??
        btn.getAttribute('aria-labelledby') ??
        btn.textContent?.trim();
      expect(name, `button "${btn.outerHTML}" has no accessible name`).toBeTruthy();
    });
  });

  // ── Loading state ───────────────────────────────────────────────────────

  it('shows loading indicator while query is pending', () => {
    listQueryOverride = { data: undefined, isLoading: true };

    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });
    expect(screen.getByText(/common\.loading/)).toBeInTheDocument();
  });

  // ── Empty state ─────────────────────────────────────────────────────────

  it('shows empty state when no lists exist', () => {
    listQueryOverride = { data: [], isLoading: false };

    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });
    expect(screen.getByText(/lists\.emptyState\b/)).toBeInTheDocument();
    expect(screen.getByText(/lists\.emptyStateHint/)).toBeInTheDocument();
  });

  it('empty state has a create CTA that opens the create form', () => {
    listQueryOverride = { data: [], isLoading: false };

    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });
    // Empty state renders a "New list" CTA — click it
    const buttons = screen.getAllByRole('button', { name: /lists\.newList/ });
    fireEvent.click(buttons[0]);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  // ── Archived toggle ─────────────────────────────────────────────────────

  it('shows archive toggle button', () => {
    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });
    expect(
      screen.getByRole('button', { name: /lists\.(showArchived|hideArchived)/ })
    ).toBeInTheDocument();
  });

  it('shows archived badge for archived lists', () => {
    const archivedList = [
      {
        id: 'list-archived',
        name: 'Old List',
        icon: null,
        systemKey: null,
        isArchived: true,
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    ];
    listQueryOverride = { data: archivedList, isLoading: false };

    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });
    expect(screen.getByText(/lists\.archivedBadge/)).toBeInTheDocument();
  });

  // ── Create form submission ──────────────────────────────────────────────

  it('calls create mutation with entered name on submit', () => {
    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });

    // Open form
    fireEvent.click(screen.getByRole('button', { name: /lists\.newList/ }));

    // Type a name
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'My New List' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /lists\.createList/ });
    fireEvent.click(submitBtn);

    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'My New List', visibility: 'hive' })
    );
  });

  it('does not submit create form with empty name', () => {
    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });

    fireEvent.click(screen.getByRole('button', { name: /lists\.newList/ }));

    // Submit without entering a name
    const submitBtn = screen.getByRole('button', { name: /lists\.createList/ });
    fireEvent.click(submitBtn);

    expect(mutateFn).not.toHaveBeenCalled();
  });

  // ── Navigation ──────────────────────────────────────────────────────────

  it('lists are clickable to navigate to detail', () => {
    renderWithProviders(<ListsPage />, { initialEntries: ['/lists'] });
    // Each list card should render as a clickable element
    const listName = screen.getByText('Shopping List');
    expect(listName.closest('[class*="cursor-pointer"]')).toBeInTheDocument();
  });
});
