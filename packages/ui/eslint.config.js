/**
 * ESLint Flat Config for packages/ui — ESLint 10+
 */

const base = require('@qoomb/eslint-config/react');

module.exports = [
  { ignores: ['dist/**', 'node_modules/**'] },
  ...base,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
  },
];
