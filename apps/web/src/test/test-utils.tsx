/**
 * Shared test utilities for accessibility tests.
 *
 * Provides a `renderWithProviders` helper that wraps components
 * with all required framework contexts (Router, i18n, Auth).
 * tRPC and auth are mocked in individual test files with vi.mock().
 *
 * See docs/adr/0006-accessibility-standards.md
 */

import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { expect } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, type MemoryRouterProps } from 'react-router-dom';

interface WrapperOptions extends RenderOptions {
  /** Initial URL path, defaults to '/' */
  initialEntries?: MemoryRouterProps['initialEntries'];
}

function AllProviders({
  children,
  initialEntries = ['/'],
}: {
  children: ReactNode;
  initialEntries?: MemoryRouterProps['initialEntries'];
}) {
  return <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>;
}

export function renderWithProviders(
  ui: ReactElement,
  { initialEntries, ...renderOptions }: WrapperOptions = {}
): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => (
      <AllProviders initialEntries={initialEntries}>{children}</AllProviders>
    ),
    ...renderOptions,
  });
}

// ── Axe assertion helper ──────────────────────────────────────────────────────

/**
 * Runs axe-core on a container element and expects no violations.
 *
 * Usage: `await expectNoAxeViolations(container)`
 *
 * Colour-contrast is disabled because jsdom does not compute CSS styles,
 * causing false positives. Contrast is verified via design-token review
 * instead (ADR-0006 §3).
 */
export async function expectNoAxeViolations(container: HTMLElement): Promise<void> {
  const results = await axe(container, {
    rules: {
      // jsdom doesn't compute CSS, so axe can't check contrast accurately.
      // Contrast is verified via manual design-token audit (ADR-0006 §3).
      'color-contrast': { enabled: false },
    },
  });

  if (results.violations.length === 0) return;

  const details = results.violations
    .map((v) => {
      const nodeInfo = v.nodes.map((n) => `  • ${n.html} (${n.failureSummary ?? ''})`).join('\n');
      return `[${v.id}] ${v.description}\n${nodeInfo}`;
    })
    .join('\n\n');

  expect.fail(`Expected no axe violations but found:\n\n${details}`);
}

// ── Reusable mock return values ───────────────────────────────────────────────

export const mockCurrentPerson = {
  displayName: 'Alice Mustermann',
  initials: 'AM',
  roleLabel: 'Elternteil',
  isLoading: false,
};

export const mockUser = {
  id: 'user-001',
  email: 'alice@example.com',
  hiveId: 'hive-001',
  personId: 'person-001',
  hiveName: 'Mustermann Familie',
  locale: 'de' as const,
};

/**
 * Minimal i18n LL stub — returns a callable proxy at any nesting depth.
 * Calling any leaf returns a string of dot-separated path segments.
 * Parameterised calls include the first param's values in the string.
 *
 * Examples:
 *   LL.common.save()                           → 'common.save'
 *   LL.dashboard.greeting({ name: 'Alice' })   → 'dashboard.greeting:{"name":"Alice"}'
 *   LL.dashboard.quickAdd.title()              → 'dashboard.quickAdd.title'
 */
export function makeLLStub(): Record<string, unknown> {
  function makeProxy(path: string): unknown {
    // The proxy target is a function so it's callable at any level
    const fn = (params?: Record<string, unknown>) =>
      params ? `${path}:${JSON.stringify(params)}` : path;
    fn.toString = () => path;

    return new Proxy(fn, {
      get(_target, prop: string) {
        if (prop === 'toString' || prop === Symbol.toPrimitive.toString()) return fn.toString;
        return makeProxy(`${path}.${String(prop)}`);
      },
      apply(_target, _thisArg, args: unknown[]) {
        const [params] = args as [Record<string, unknown> | undefined];
        return params ? `${path}:${JSON.stringify(params)}` : path;
      },
    });
  }

  return new Proxy(
    {},
    {
      get(_target, prop: string) {
        return makeProxy(String(prop));
      },
    }
  ) as Record<string, unknown>;
}
