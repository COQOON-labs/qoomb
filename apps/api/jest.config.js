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
