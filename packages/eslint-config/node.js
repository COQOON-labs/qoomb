/**
 * Node.js / NestJS ESLint Configuration
 *
 * Extends base config with Node.js and NestJS specific rules.
 * Used by: apps/api, packages/validators, packages/types
 */

module.exports = {
  extends: [require.resolve('./index.js'), 'plugin:n/recommended'],
  plugins: ['n'],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    // Node.js specific
    'n/no-unsupported-features/es-syntax': 'off', // TypeScript transpiles
    'n/no-missing-import': 'off', // TypeScript handles this
    'n/no-unpublished-import': 'off', // Monorepo uses workspace protocol
    'n/no-extraneous-import': 'off', // pnpm workspaces handle this

    // NestJS patterns
    '@typescript-eslint/no-empty-function': 'off', // NestJS uses empty constructors
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      },
    ],

    // Allow devDependencies in test files
    'n/no-unpublished-require': 'off',
  },
  overrides: [
    {
      // Test files
      files: ['**/*.spec.ts', '**/*.test.ts', '**/test/**/*.ts'],
      env: {
        jest: true,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
  ],
};
