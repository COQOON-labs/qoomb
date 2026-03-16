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
        project: ['./tsconfig.json', './tsconfig.seed.json'],
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // Regression pattern Q-002: enforce getEnv() instead of process.env in application code.
      // env.validation.ts is the single place that reads process.env — everything else must
      // go through getEnv() so Zod validation runs at startup and gives a clear error message.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'MemberExpression[object.name="process"][property.name="env"]',
          message:
            'Use getEnv() from src/config/env.validation.ts instead of process.env directly. ' +
            'This ensures Zod startup validation runs and gives a clear error on misconfiguration.',
        },
      ],
    },
  },
  {
    // Legitimate process.env usages — these files ARE the infrastructure layer:
    // - env.validation.ts: the single place that reads + validates all env vars via Zod
    // - main.ts: bootstrap code that runs before NestJS DI is available
    // - config/security.config.ts: NestJS ConfigModule factory
    // - encryption/providers/*: Key providers whose job IS to read env vars directly
    // - email/transports/*: Transport factories configured before DI injection
    // - email/email.module.ts + email.service.ts: NestJS module setup / useFactory
    files: [
      'src/config/env.validation.ts',
      'src/config/security.config.ts',
      'src/main.ts',
      'src/modules/encryption/providers/*.ts',
      'src/modules/encryption/key-provider.factory.ts',
      'src/modules/email/transports/*.ts',
      'src/modules/email/email.module.ts',
      'src/modules/email/email.service.ts',
    ],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    // Test files set process.env directly for test fixture setup (e.g. KEY_PROVIDER,
    // ENCRYPTION_KEY) before modules are imported. This is unavoidable in Jest because
    // process.env must be set before the module registry resolves.
    files: ['**/*.test.ts', '**/*.spec.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
];

