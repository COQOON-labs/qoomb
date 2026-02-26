/**
 * Root ESLint Flat Config — ESLint 10+
 *
 * Minimal root config. Each workspace package has its own eslint.config.js
 * with the actual rules (via @qoomb/eslint-config).
 *
 * Previously this project used .eslintignore; those patterns are consolidated
 * here via the `ignores` property (flat config equivalent).
 */

module.exports = [
  {
    ignores: [
      // Build outputs
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.cache/**',

      // Dependencies & lockfiles
      '**/node_modules/**',
      'pnpm-lock.yaml',

      // Turbo cache
      '**/.turbo/**',

      // Test coverage
      '**/coverage/**',
      '**/.nyc_output/**',

      // Generated config files (not source TypeScript)
      '**/*.config.js',
      '**/*.config.cjs',
      '**/*.config.ts',

      // Environment files
      '.env',
      '.env.*',

      // Prisma generated migrations
      '**/prisma/migrations/**',
    ],
  },
];

