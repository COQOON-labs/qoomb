// Why Jest and not Vitest?
// NestJS compiles to CommonJS ("module": "commonjs" in tsconfig.json) and relies on
// emitDecoratorMetadata + reflect-metadata, which work reliably with Jest/ts-jest in
// CJS mode. Vitest would require @swc/core as a decorator transformer and additional
// ESM/CJS bridging — non-trivial to configure correctly with NestJS. Jest is also the
// framework the NestJS CLI scaffolds by default, so ecosystem tooling (e.g. @nestjs/testing)
// is battle-tested with it. apps/web and packages/validators use Vitest because they are
// Vite-based and have no NestJS decorator requirements.
/** @type {import('jest').Config} */
module.exports = {
  transform: {
    // tsconfig.seed.json extends tsconfig.json but sets rootDir to '.' so files
    // outside src/ (e.g. prisma/scripts) are included in compilation.
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.seed.json' }],
  },
  testRegex: '\\.(test|spec)\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  moduleNameMapper: {
    // pg-boss ships as pure ESM which Jest/ts-jest cannot parse in CJS mode.
    // Stub it out for all unit tests — EmailQueueService integration is tested
    // separately via the email-queue allowlist entry in T-003.
    '^pg-boss$': '<rootDir>/src/__mocks__/pg-boss.js',
  },
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/prisma/scripts'],
  coverageProvider: 'v8',
  // Only measure coverage on files that have companion tests.
  // Adding tests for a module → add its source file here.
  // This keeps the threshold meaningful: it measures tested code quality,
  // not the ratio of tested vs. untested modules.
  collectCoverageFrom: [
    'src/modules/encryption/encryption.service.ts',
    'src/modules/encryption/decorators/encrypt-fields.decorator.ts',
    'src/common/guards/hive-permission.guard.ts',
    'src/common/guards/resource-access.guard.ts',
    'src/trpc/guards.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
