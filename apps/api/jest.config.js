/** @type {import('jest').Config} */
module.exports = {
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  testRegex: '\\.(test|spec)\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
};
