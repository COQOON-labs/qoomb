import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node --project tsconfig.seed.json prisma/seed.ts',
  },
  datasource: {
    // Use process.env directly (not prisma's env()) so config loading never
    // throws when DATABASE_URL is absent (e.g. `prisma generate` in CI).
    // Generate does not connect to the DB; migrate always runs with the var set.
    url: process.env.DATABASE_URL ?? '',
  },
});
