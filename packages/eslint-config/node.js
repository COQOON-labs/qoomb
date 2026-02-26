/**
 * Node.js / NestJS ESLint Configuration
 *
 * Extends base config with Node.js and NestJS specific rules.
 * Used by: apps/api, packages/validators, packages/types
 *
 * Flat Config array — ESLint 10+
 */

const nPlugin = require('eslint-plugin-n');
const globals = require('globals');
const base = require('./index.js');

module.exports = [
  ...base,
  nPlugin.configs['flat/recommended'],
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
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
  },
  {
    // Test files
    files: ['**/*.spec.ts', '**/*.test.ts', '**/test/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
];
