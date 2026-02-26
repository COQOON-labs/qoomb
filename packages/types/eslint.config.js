/**
 * ESLint Flat Config for packages/types — ESLint 10+
 */

const base = require('@qoomb/eslint-config/node');

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
