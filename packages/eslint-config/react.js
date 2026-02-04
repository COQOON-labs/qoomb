/**
 * React ESLint Configuration
 *
 * Extends base config with React and React Hooks specific rules.
 * Used by: apps/web
 */

module.exports = {
  extends: [
    require.resolve('./index.js'),
    'plugin:react/recommended',
    'plugin:react/jsx-runtime', // React 17+ JSX transform
    'plugin:react-hooks/recommended',
  ],
  plugins: ['react', 'react-hooks'],
  env: {
    browser: true,
    es2022: true,
  },
  settings: {
    react: {
      version: 'detect',
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
  overrides: [
    {
      // Test files
      files: ['**/*.test.tsx', '**/*.test.ts', '**/*.spec.tsx', '**/*.spec.ts'],
      env: {
        jest: true,
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'react-hooks/rules-of-hooks': 'off', // Tests don't follow hook rules
      },
    },
  ],
};
