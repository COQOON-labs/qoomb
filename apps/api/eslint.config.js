/**
 * ESLint Flat Config for apps/api — ESLint 10+
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
    rules: {
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
    },
  },
];
