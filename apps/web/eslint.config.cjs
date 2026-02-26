/**
 * ESLint Flat Config for apps/web — ESLint 10+
 *
 * Uses .cjs extension because apps/web has "type": "module" in package.json.
 */

const base = require('@qoomb/eslint-config/react');

module.exports = [
  { ignores: ['dist/**', 'node_modules/**', 'dev-dist/**'] },
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
