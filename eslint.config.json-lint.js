const jsoncPlugin = require('eslint-plugin-jsonc');
const jsoncParser = require('jsonc-eslint-parser');

module.exports = [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**', '**/.turbo/**'],
  },
  {
    files: ['**/*.json'],
    plugins: { jsonc: jsoncPlugin },
    languageOptions: { parser: jsoncParser },
    rules: { 'jsonc/no-comments': 'error' },
  },
];
