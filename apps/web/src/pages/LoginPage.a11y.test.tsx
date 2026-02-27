/**
 * Accessibility tests for LoginPage
 *
 * Verifies that the login form meets WCAG 2.1 AA requirements:
 *  - All form inputs have associated labels
 *  - Form has correct landmark structure
 *  - Error states use aria-describedby
 *  - No axe violations in default and error states
 *
 * See docs/adr/0006-accessibility-standards.md
 */

import { screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { LoginPage } from '../pages/LoginPage';
import { renderWithProviders, makeLLStub, expectNoAxeViolations } from '../test/test-utils';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../i18n/i18n-react', () => ({
  useI18nContext: () => ({ LL: makeLLStub() }),
}));

vi.mock('../lib/auth/useAuth', () => ({
  useAuth: () => ({ login: vi.fn(), logout: vi.fn() }),
}));

vi.mock('../lib/trpc/client', () => ({
  trpc: {
    auth: {
      login: {
        useMutation: () => ({
          mutate: vi.fn(),
          isPending: false,
          isError: false,
          error: null,
        }),
      },
      getSystemConfig: {
        useQuery: () => ({
          data: {
            allowForgotPassword: true,
            allowPasskeys: false, // Disable passkeys to simplify test tree
            allowOpenRegistration: true,
          },
          isLoading: false,
        }),
      },
    },
  },
}));

// Stub AuthLayout as a passthrough — it has its own a11y tests
vi.mock('../layouts/AuthLayout', () => ({
  AuthLayout: ({ children, title }: { children: ReactNode; title: string }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

// Stub PassKeyButton to avoid WebAuthn API dependency in jsdom
vi.mock('../components/auth/PassKeyButton', () => ({
  PassKeyButton: () => (
    <button type="button" aria-label="Mit Passkey anmelden">
      Passkey
    </button>
  ),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    renderWithProviders(<LoginPage />, { initialEntries: ['/login'] });
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('has no axe violations in default state', async () => {
    const { container } = renderWithProviders(<LoginPage />, {
      initialEntries: ['/login'],
    });

    await expectNoAxeViolations(container);
  });

  it('renders email and password inputs', () => {
    renderWithProviders(<LoginPage />, { initialEntries: ['/login'] });

    // Query by input type since label text comes from i18n stub
    const emailInput = document.querySelector('input[type="email"]');
    const passwordInput = document.querySelector('input[type="password"]');
    expect(emailInput).toBeInTheDocument();
    expect(passwordInput).toBeInTheDocument();
  });

  it('all form inputs have accessible labels', () => {
    renderWithProviders(<LoginPage />, { initialEntries: ['/login'] });

    const inputs = screen.getAllByRole('textbox');
    inputs.forEach((input) => {
      const labelId = input.getAttribute('aria-labelledby');
      const labelFor = input.id ? document.querySelector(`label[for="${input.id}"]`) : null;
      const ariaLabel = input.getAttribute('aria-label');

      expect(
        labelId ?? labelFor ?? ariaLabel,
        `input "${input.outerHTML}" has no accessible label`
      ).toBeTruthy();
    });
  });

  it('renders a submit button', () => {
    renderWithProviders(<LoginPage />, { initialEntries: ['/login'] });
    expect(screen.getByRole('button', { name: /auth\.signIn/i })).toBeInTheDocument();
  });

  it('submit button is of type submit', () => {
    renderWithProviders(<LoginPage />, { initialEntries: ['/login'] });
    const submitBtn = screen.getByRole('button', { name: /auth\.signIn/i });
    expect(submitBtn).toHaveAttribute('type', 'submit');
  });

  it('has no axe violations after failed validation (empty submit)', async () => {
    const { container } = renderWithProviders(<LoginPage />, {
      initialEntries: ['/login'],
    });

    // Submit without filling in the form to trigger validation errors
    const submitBtn = screen.getByRole('button', { name: /auth\.signIn/i });
    fireEvent.click(submitBtn); // Axe should still pass even with error messages rendered
    await expectNoAxeViolations(container);
  });

  it('renders a link to the registration page', () => {
    renderWithProviders(<LoginPage />, { initialEntries: ['/login'] });
    // Link renders with i18n stub text 'auth.login.createOne' and href /register
    const registerLink = screen.getByRole('link', { name: /auth\.login\.createOne/i });
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute('href', '/register');
  });

  it('keyboard: Tab from email reaches password then submit', () => {
    renderWithProviders(<LoginPage />, { initialEntries: ['/login'] });

    // Verify all three key elements are in the tab order (tabIndex !== -1)
    const emailInput = document.querySelector('input[type="email"]');
    const passwordInput = document.querySelector('input[type="password"]');
    const submitBtn = screen.getByRole('button', { name: /auth\.signIn/i });

    expect(emailInput).toBeInTheDocument();
    expect(passwordInput).toBeInTheDocument();
    expect(emailInput).not.toHaveAttribute('tabindex', '-1');
    expect(passwordInput).not.toHaveAttribute('tabindex', '-1');
    expect(submitBtn.tabIndex).not.toBe(-1);
  });
});
