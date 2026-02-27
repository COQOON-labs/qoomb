/**
 * Vitest global setup
 *
 * Extends the `expect()` API with @testing-library/jest-dom matchers.
 * Axe accessibility checks are done via `expectNoAxeViolations()` in test-utils
 * rather than a custom matcher, which avoids the vitest-axe type/runtime export mismatch.
 *
 * See docs/adr/0006-accessibility-standards.md
 */

import '@testing-library/jest-dom/vitest';
