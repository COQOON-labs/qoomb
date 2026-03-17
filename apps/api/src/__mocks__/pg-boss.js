/**
 * Jest stub for pg-boss.
 *
 * pg-boss ships as pure ESM (import EventEmitter from 'node:events') which
 * Jest/ts-jest cannot parse in CommonJS mode. This stub prevents Jest from
 * loading the real pg-boss module during unit tests that transitively import
 * any service depending on EmailQueueService.
 *
 * The stub is minimal — only the surface used by EmailQueueService:
 *   new PgBoss(options) → instance with start/stop/send/work/schedule/on
 */

const PgBoss = jest.fn().mockImplementation(() => ({
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  send: jest.fn().mockResolvedValue('fake-job-id'),
  work: jest.fn().mockResolvedValue(undefined),
  schedule: jest.fn().mockResolvedValue(undefined),
  on: jest.fn(),
}));

module.exports = { PgBoss };
module.exports.default = PgBoss;
