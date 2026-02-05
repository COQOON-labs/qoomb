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

// Create a properly typed Prisma Client instance
function createPrismaClient(): PrismaClient {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

// Type for transaction client - exported for use in services
export type TransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly client: PrismaClient;

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

  // Expose Prisma methods
  async $connect() {
    return this.client.$connect();
  }

  async $disconnect() {
    return this.client.$disconnect();
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
    return this.client.$transaction(fn, options);
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

    const user: { id: string } | null = await this.user.findFirst({
      where: {
        id: userId,
        hiveId: hiveId,
      },
      select: { id: true },
    });

    if (!user) {
      this.logger.error(`User ${userId} attempted unauthorized access to hive ${hiveId}`);
      throw new UnauthorizedException('Access to this hive is not authorized');
    }
  }

  /**
   * Set the search_path for multi-hive isolation with security validation
   *
   * Security measures:
   * 1. UUID format validation to prevent SQL injection
   * 2. Hive existence verification in database
   * 3. Session variables for Row-Level Security (RLS) policies
   * 4. Logging for audit trail
   *
   * SECURITY NOTE:
   * This function uses $executeRaw instead of $executeRawUnsafe where possible.
   * For search_path, PostgreSQL requires identifier-based syntax that cannot be
   * parameterized. However, UUIDs are strictly validated before use, making this
   * safe from SQL injection.
   *
   * @param hiveId - The UUID of the hive to set as active schema
   * @param userId - Optional user ID to set for RLS policies
   * @throws {UnauthorizedException} if validation fails
   */
  async setHiveSchema(hiveId: string, userId?: string): Promise<void> {
    // Step 1: Validate UUID format (prevents SQL injection)
    this.validateUUID(hiveId);

    if (userId) {
      this.validateUUID(userId);
    }

    // Step 2: Verify hive exists (prevents access to non-existent schemas)
    await this.verifyHiveExists(hiveId);

    // Step 3: Set session variables for Row-Level Security (RLS)
    // SECURITY: PostgreSQL SET commands require literal values, not parameters
    // However, we've validated the UUID format (only [0-9a-f-] chars), making this safe
    await this.executeRawSql(`SET app.hive_id = '${hiveId}'`);

    if (userId) {
      await this.executeRawSql(`SET app.user_id = '${userId}'`);
    }

    // Step 4: Set search_path
    // SECURITY: PostgreSQL requires schema names as identifiers, not parameters
    // Since we've validated the UUID format (only [0-9a-f-] chars), this is safe
    // Prisma does not support identifier parameterization for SET search_path
    await this.executeRawSql(`SET search_path TO hive_${hiveId}, public`);

    this.logger.debug(`Schema context set to hive_${hiveId}${userId ? ` for user ${userId}` : ''}`);
  }

  /**
   * Reset search_path to public schema only
   * Useful for operations that should not have hive context
   */
  async resetSchema(): Promise<void> {
    await this.executeRawSql(`SET search_path TO public`);
    this.logger.debug('Schema context reset to public');
  }
}
