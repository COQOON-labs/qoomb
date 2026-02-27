import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Vitest configuration for apps/web
// Shares the same React plugin as vite.config.ts, but excludes PWA plugin (not needed in tests).
// See docs/adr/0006-accessibility-standards.md for the accessibility testing strategy.
export default defineConfig({
  plugins: [tailwindcss(), react()],
  test: {
    // Use jsdom to simulate a real browser DOM
    environment: 'jsdom',

    // Global setup file: extends expect() with jest-dom matchers + vitest-axe matchers
    setupFiles: ['./src/test/setup.ts'],

    // Make vitest globals (describe, it, expect, vi) available without explicit imports
    globals: true,

    // Only match test files in src/ — exclude vite.config, vitest.config itself
    include: ['src/**/*.{test,spec}.{ts,tsx}'],

    // Inline CSS transforms so Tailwind class names are preserved in rendered HTML
    css: false,

    // Coverage (optional — run with `pnpm test:coverage`)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/test/**',
        'src/i18n/**', // Generated files
        'src/vite-env.d.ts',
        'src/main.tsx',
      ],
    },
  },
  // Define __APP_VERSION__ so components that reference it don't error in tests
  define: {
    __APP_VERSION__: JSON.stringify('0.0.0-test'),
  },
});
