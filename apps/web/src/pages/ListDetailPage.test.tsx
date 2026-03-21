/**
 * Tests for ListDetailPage
 *
 * Verifies that the list detail page renders fields, items,
 * inline editing, and field management correctly.
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

import { ListDetailPage } from './ListDetailPage';

// ── Mock data ─────────────────────────────────────────────────────────────────

const mockList = {
  id: 'list-001',
  name: 'Shopping List',
  icon: '🛒',
  systemKey: null as string | null,
  isArchived: false,
  visibility: 'hive' as string,
  fields: [
    { id: 'field-001', name: 'Item', fieldType: 'text', sortOrder: 0, config: null },
    { id: 'field-002', name: 'Quantity', fieldType: 'number', sortOrder: 1, config: null },
    { id: 'field-003', name: 'Done', fieldType: 'checkbox', sortOrder: 2, config: null },
  ],
  views: [] as { id: string; name: string }[],
};

const mockItems = [
  {
    id: 'item-001',
    listId: 'list-001',
    creatorId: 'person-001',
    values: [
      { fieldId: 'field-001', value: 'Milk' },
      { fieldId: 'field-002', value: '2' },
      { fieldId: 'field-003', value: 'false' },
    ],
  },
  {
    id: 'item-002',
    listId: 'list-001',
    creatorId: 'person-001',
    values: [
      { fieldId: 'field-001', value: 'Bread' },
      { fieldId: 'field-002', value: '1' },
      { fieldId: 'field-003', value: 'true' },
    ],
  },
];

const mutateFn = vi.fn();

// ── Per-test overrides ────────────────────────────────────────────────────────

let listOverride: { data: typeof mockList | null; isLoading: boolean } | null = null;
let itemsOverride: { data: typeof mockItems; isLoading: boolean } | null = null;

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

vi.mock('../lib/toast', () => ({
  addToast: vi.fn(),
}));

// Mock useParams to return list-001
vi.mock('react-router-dom', async () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ id: 'list-001' }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../lib/trpc/client', () => ({
  trpc: {
    useUtils: () => ({
      lists: {
        get: { invalidate: vi.fn() },
        list: { invalidate: vi.fn() },
        listItems: { invalidate: vi.fn() },
      },
    }),
    persons: {
      list: {
        useQuery: () => ({ data: [], isLoading: false }),
      },
    },
    lists: {
      get: {
        useQuery: () => listOverride ?? { data: mockList, isLoading: false },
      },
      listItems: {
        useQuery: () => itemsOverride ?? { data: mockItems, isLoading: false },
      },
      createField: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (...args: unknown[]) => {
            mutateFn(...args);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      deleteField: {
        useMutation: () => ({
          mutate: mutateFn,
          isPending: false,
        }),
      },
      createItem: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (...args: unknown[]) => {
            mutateFn(...args);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      deleteItem: {
        useMutation: () => ({
          mutate: mutateFn,
          isPending: false,
        }),
      },
      update: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (...args: unknown[]) => {
            mutateFn(...args);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      updateItem: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (...args: unknown[]) => {
            mutateFn(...args);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      updateField: {
        useMutation: (opts?: { onSuccess?: () => void }) => ({
          mutate: (...args: unknown[]) => {
            mutateFn(...args);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
      createView: {
        useMutation: (opts?: { onSuccess?: (data: { id: string }) => void }) => ({
          mutate: (...args: unknown[]) => {
            mutateFn(...args);
            opts?.onSuccess?.({ id: 'view-001' });
          },
          isPending: false,
        }),
      },
      reorderItems: {
        useMutation: () => ({
          mutate: mutateFn,
          isPending: false,
        }),
      },
      reorderFields: {
        useMutation: () => ({
          mutate: mutateFn,
          isPending: false,
        }),
      },
    },
  },
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ListDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listOverride = null;
    itemsOverride = null;
  });

  it('renders without crashing', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithProviders(<ListDetailPage />, {
      initialEntries: ['/lists/list-001'],
    });
    await expectNoAxeViolations(container);
  });

  it('displays the list name and icon', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });
    expect(screen.getByText('Shopping List')).toBeInTheDocument();
    expect(screen.getByText('🛒')).toBeInTheDocument();
  });

  it('renders field column headers', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });
    expect(screen.getByText('Item')).toBeInTheDocument();
    expect(screen.getByText('Quantity')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('renders item values in the table', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Bread')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders checkbox values as check marks', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });
    // Bread has Done=true → ✓, Milk has Done=false → ✗
    expect(screen.getByText('✓')).toBeInTheDocument();
    expect(screen.getByText('✗')).toBeInTheDocument();
  });

  it('shows back-to-lists button', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });
    expect(screen.getByText(/lists\.backToLists/)).toBeInTheDocument();
  });

  it('shows delete buttons for items on hover', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });
    const deleteButtons = screen.getAllByRole('button', { name: /lists\.deleteItem/ });
    // One delete button per item
    expect(deleteButtons).toHaveLength(2);
  });

  it('shows add-field button', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });
    const addFieldBtn = screen.getByRole('button', { name: /lists\.addField/ });
    expect(addFieldBtn).toBeInTheDocument();
  });

  it('opens add field form', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

    fireEvent.click(screen.getByRole('button', { name: /lists\.addField/ }));

    // Should show field name input and type selector
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('shows add-item row', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });
    const addItemBtn = screen.getByRole('button', { name: /lists\.addItem/ });
    expect(addItemBtn).toBeInTheDocument();
  });

  it('name is click-to-edit for non-system lists', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

    // Click on the list name button to start editing
    const nameButton = screen.getByRole('button', { name: /Shopping List/ });
    fireEvent.click(nameButton);

    // Should now show an input field with the current name
    const input = screen.getByDisplayValue('Shopping List');
    expect(input).toBeInTheDocument();
  });

  it('all buttons have accessible names', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

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

  it('shows loading text while data is loading', () => {
    listOverride = { data: null, isLoading: true };
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });
    expect(screen.getByText(/common\.loading/)).toBeInTheDocument();
  });

  // ── Not found ─────────────────────────────────────────────────────────

  it('shows not-found message when list does not exist', () => {
    listOverride = { data: null, isLoading: false };
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });
    expect(screen.getByText(/lists\.notFound/)).toBeInTheDocument();
  });

  // ── System list restrictions ────────────────────────────────────────────

  it('disables rename button for system lists', () => {
    listOverride = {
      data: { ...mockList, systemKey: 'tasks' },
      isLoading: false,
    };
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

    const nameButton = screen.getByRole('button', { name: /Shopping List/ });
    expect(nameButton).toBeDisabled();
  });

  it('hides archive button for system lists', () => {
    listOverride = {
      data: { ...mockList, systemKey: 'tasks' },
      isLoading: false,
    };
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

    expect(screen.queryByText(/lists\.archive\b/)).not.toBeInTheDocument();
  });

  // ── Archive toggle ──────────────────────────────────────────────────────

  it('shows archive button for non-system lists', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });
    expect(screen.getByText(/lists\.archive\b/)).toBeInTheDocument();
  });

  it('shows archived notice and unarchive button when list is archived', () => {
    listOverride = {
      data: { ...mockList, isArchived: true },
      isLoading: false,
    };
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

    expect(screen.getByText(/lists\.archivedNotice/)).toBeInTheDocument();
    expect(screen.getByText(/lists\.unarchive/)).toBeInTheDocument();
  });

  it('calls update mutation when archive button is clicked', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

    fireEvent.click(screen.getByText(/lists\.archive\b/));
    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'list-001', data: { isArchived: true } })
    );
  });

  // ── Icon picker ─────────────────────────────────────────────────────────

  it('opens icon picker on icon click', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

    const iconButton = screen.getByRole('button', { name: /lists\.editIcon/ });
    fireEvent.click(iconButton);

    // Should show a grid of emoji options
    expect(screen.getByText('✅')).toBeInTheDocument();
    expect(screen.getByText('🎯')).toBeInTheDocument();
  });

  it('calls update mutation when icon is selected', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

    fireEvent.click(screen.getByRole('button', { name: /lists\.editIcon/ }));
    fireEvent.click(screen.getByText('⭐'));

    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'list-001', data: { icon: '⭐' } })
    );
  });

  // ── Empty items ─────────────────────────────────────────────────────────

  it('shows empty items message when no items exist', () => {
    itemsOverride = { data: [], isLoading: false };
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

    expect(screen.getByText(/lists\.emptyItems/)).toBeInTheDocument();
  });

  // ── Inline name editing ─────────────────────────────────────────────────

  it('saves name on Enter key and calls mutation', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

    // Enter edit mode
    fireEvent.click(screen.getByRole('button', { name: /Shopping List/ }));
    const input = screen.getByDisplayValue('Shopping List');

    // Change name and press Enter
    fireEvent.change(input, { target: { value: 'Groceries' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'list-001', data: { name: 'Groceries' } })
    );
  });

  it('cancels name editing on Escape key', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

    // Enter edit mode
    fireEvent.click(screen.getByRole('button', { name: /Shopping List/ }));
    const input = screen.getByDisplayValue('Shopping List');

    // Press Escape
    fireEvent.keyDown(input, { key: 'Escape' });

    // Should return to non-editing state (button visible again)
    expect(screen.getByRole('button', { name: /Shopping List/ })).toBeInTheDocument();
    expect(mutateFn).not.toHaveBeenCalled();
  });

  // ── Checkbox interaction ────────────────────────────────────────────────

  it('calls updateItem mutation when checkbox cell is clicked', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

    // Click on the ✗ checkbox value (Milk → Done=false)
    const unchecked = screen.getByText('✗');
    const td = unchecked.closest('td');
    expect(td).not.toBeNull();
    fireEvent.click(td as Element);

    expect(mutateFn).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'item-001',
        data: { values: { 'field-003': true } },
      })
    );
  });

  // ── Field type options display ──────────────────────────────────────────

  it('shows all field type options in add-field form', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

    fireEvent.click(screen.getByRole('button', { name: /lists\.addField/ }));
    const combobox = screen.getByRole('combobox');
    const options = combobox.querySelectorAll('option');

    // Should have all 8 field types
    expect(options).toHaveLength(8);
  });

  // ── Delete item ─────────────────────────────────────────────────────────

  it('calls deleteItem mutation when delete button is clicked with confirmation', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

    const deleteButtons = screen.getAllByRole('button', { name: /lists\.deleteItem/ });
    fireEvent.click(deleteButtons[0]);

    // ConfirmDialog should appear with the confirm button
    const confirmBtn = screen.getByRole('button', { name: /common\.remove/ });
    fireEvent.click(confirmBtn);

    expect(mutateFn).toHaveBeenCalledWith('item-001');
  });

  it('does not delete item when confirmation is cancelled', () => {
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

    const deleteButtons = screen.getAllByRole('button', { name: /lists\.deleteItem/ });
    fireEvent.click(deleteButtons[0]);

    // Cancel the dialog
    const cancelBtn = screen.getByRole('button', { name: /Cancel/ });
    fireEvent.click(cancelBtn);

    expect(mutateFn).not.toHaveBeenCalled();
  });

  // ── Remove field ────────────────────────────────────────────────────────

  // ── No-fields state ─────────────────────────────────────────────────────

  it('shows no-fields empty state with add-field CTA', () => {
    listOverride = {
      data: { ...mockList, fields: [] },
      isLoading: false,
    };
    renderWithProviders(<ListDetailPage />, { initialEntries: ['/lists/list-001'] });

    expect(screen.getByText(/lists\.noFields/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /lists\.addField/ })).toBeInTheDocument();
  });
});
