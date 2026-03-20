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

// jsdom does not implement HTMLDialogElement.showModal() / .close()
// Polyfill them so that <ConfirmDialog> works in tests.
if (typeof HTMLDialogElement !== 'undefined') {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  }

  if (!HTMLDialogElement.prototype.close) {
    HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
    };
  }
}
