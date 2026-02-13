import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '@prisma/client';
import { Pool } from 'pg';

// Create a properly typed Prisma Client instance.
// No return type annotation: TypeScript infers the full generic type so model
// accessors (e.g. .person) retain their correct delegate types.
function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

// Re-export Prisma's generated TransactionClient from the Prisma namespace.
// This matches exactly what $transaction's callback receives.
export type TransactionClient = Prisma.TransactionClient;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly client: ReturnType<typeof createPrismaClient>;

  constructor() {
    this.client = createPrismaClient();
  }

  // Expose Prisma models with proper typing
  get user() {
    return this.client.user;
  }

  get hive() {
    return this.client.hive;
  }

  get refreshToken() {
    return this.client.refreshToken;
  }

  get userHiveMembership() {
    return this.client.userHiveMembership;
  }

  get person() {
    return this.client.person;
  }

  get emailVerificationToken() {
    return this.client.emailVerificationToken;
  }

  get passwordResetToken() {
    return this.client.passwordResetToken;
  }

  get invitation() {
    return this.client.invitation;
  }

  get passKeyCredential() {
    return this.client.passKeyCredential;
  }

  // Expose Prisma methods
  async $connect() {
    return await this.client.$connect();
  }

  async $disconnect() {
    return await this.client.$disconnect();
  }

  async $executeRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T> {
    return this.client.$executeRawUnsafe(query, ...values) as Promise<T>;
  }

  async $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T> {
    return this.client.$queryRawUnsafe(query, ...values) as Promise<T>;
  }

  async $transaction<T>(
    fn: (tx: TransactionClient) => Promise<T>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    }
  ): Promise<T> {
    return await this.client.$transaction(fn, options);
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('✅ Database connected');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('👋 Database disconnected');
  }

  /**
   * Validate UUID format to prevent SQL injection
   * @throws {UnauthorizedException} if UUID format is invalid
   */
  private validateUUID(uuid: string): void {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(uuid)) {
      this.logger.error(`Invalid UUID format attempted: ${uuid}`);
      throw new UnauthorizedException('Invalid hive identifier');
    }
  }

  /**
   * Execute raw SQL (wrapper to handle TypeScript issues)
   * SECURITY: Only use with validated input!
   */
  private async executeRawSql(sql: string): Promise<void> {
    // TypeScript workaround: We need to use $executeRawUnsafe for SET commands
    // This is safe because we validate all inputs before calling this method
    await this.$executeRawUnsafe(sql);
  }

  /**
   * Verify that a hive exists in the database
   * @throws {UnauthorizedException} if hive does not exist
   */
  private async verifyHiveExists(hiveId: string): Promise<void> {
    const hive: { id: string } | null = await this.hive.findUnique({
      where: { id: hiveId },
      select: { id: true },
    });

    if (!hive) {
      this.logger.error(`Hive not found: ${hiveId}`);
      throw new UnauthorizedException('Hive not found');
    }
  }

  /**
   * Verify that a user belongs to a specific hive
   * @throws {UnauthorizedException} if user does not belong to hive
   */
  async verifyUserHiveAccess(userId: string, hiveId: string): Promise<void> {
    this.validateUUID(userId);
    this.validateUUID(hiveId);

    const membership: { id: string } | null = await this.userHiveMembership.findFirst({
      where: { userId, hiveId },
      select: { id: true },
    });

    if (!membership) {
      this.logger.error(`User ${userId} attempted unauthorized access to hive ${hiveId}`);
      throw new UnauthorizedException('Access to this hive is not authorized');
    }
  }

  /**
   * Set RLS session variables for hive-scoped data isolation.
   *
   * Security measures:
   * 1. UUID format validation to prevent SQL injection
   * 2. Hive existence verification in database
   * 3. Session variables for Row-Level Security (RLS) policies
   * 4. Logging for audit trail
   *
   * SECURITY NOTE:
   * PostgreSQL SET commands require literal values, not parameters.
   * UUIDs are strictly validated (only [0-9a-f-] chars) before use,
   * making this safe from SQL injection.
   *
   * @param hiveId - The UUID of the hive to activate
   * @param userId - Optional user ID to set for fine-grained RLS policies
   * @throws {UnauthorizedException} if validation fails
   */
  async setHiveSchema(hiveId: string, userId?: string): Promise<void> {
    // Step 1: Validate UUID format (prevents SQL injection)
    this.validateUUID(hiveId);

    if (userId) {
      this.validateUUID(userId);
    }

    // Step 2: Verify hive exists
    await this.verifyHiveExists(hiveId);

    // Step 3: Set session variables for Row-Level Security (RLS)
    await this.executeRawSql(`SET app.hive_id = '${hiveId}'`);

    if (userId) {
      await this.executeRawSql(`SET app.user_id = '${userId}'`);
    }

    this.logger.debug(`RLS context set for hive ${hiveId}${userId ? ` / user ${userId}` : ''}`);
  }
}
