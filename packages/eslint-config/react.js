/**
 * React ESLint Configuration
 *
 * Extends base config with React and React Hooks specific rules.
 * Used by: apps/web, packages/ui
 *
 * Flat Config array — ESLint 10+
 */

const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const globals = require('globals');
const base = require('./index.js');

module.exports = [
  ...base,
  reactPlugin.configs.flat.recommended,
  reactPlugin.configs.flat['jsx-runtime'],
  {
    plugins: { 'react-hooks': reactHooksPlugin },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    settings: {
      react: {
        // Explicit version avoids context.getFilename() call removed in ESLint 10
        version: '19.0.0',
      },
    },
    rules: {
      // React specific
      'react/prop-types': 'off', // Using TypeScript for prop types
      'react/react-in-jsx-scope': 'off', // React 17+ JSX transform
      'react/jsx-uses-react': 'off', // React 17+ JSX transform

      // React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // Accessibility
      'react/jsx-no-target-blank': 'error',

      // Performance
      'react/jsx-no-bind': [
        'warn',
        {
          allowArrowFunctions: true,
          allowBind: false,
          ignoreRefs: true,
        },
      ],

      // Code style
      'react/self-closing-comp': 'error',
      'react/jsx-curly-brace-presence': [
        'error',
        { props: 'never', children: 'never' },
      ],
    },
  },
  {
    // Test files
    files: ['**/*.test.tsx', '**/*.test.ts', '**/*.spec.tsx', '**/*.spec.ts'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'react-hooks/rules-of-hooks': 'off', // Tests don't follow hook rules
    },
  },
];
