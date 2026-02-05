import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../prisma/prisma.service';
import { EncryptFields, DecryptFields } from '../decorators/encrypt-fields.decorator';

interface EventData {
  title: string;
  description: string;
  startTime: Date;
  endTime: Date;
}

/**
 * Example Service: Events with Automatic Encryption
 *
 * This service demonstrates how to use the @EncryptFields and @DecryptFields
 * decorators for automatic, transparent encryption/decryption.
 *
 * Key benefits:
 * - ✅ Can't forget to encrypt (decorator ensures it)
 * - ✅ Clean, readable code
 * - ✅ Performance: Only encrypts when decorator is present
 * - ✅ Flexible: Choose which fields to encrypt per method
 */
@Injectable()
export class EventsExampleService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * CREATE: Encrypt fields before storing
   *
   * The @EncryptFields decorator automatically encrypts the specified
   * fields in the return value before it's sent back to the caller.
   *
   * Flow:
   * 1. Method executes normally
   * 2. Return value is intercepted
   * 3. 'title' and 'description' are encrypted using hiveId
   * 4. Encrypted result is returned
   */
  @EncryptFields(['title', 'description'])
  async createEvent(data: EventData, hiveId: string): Promise<EventData> {
    // Just write your normal business logic
    // No encryption code needed here!

    const result: EventData[] = await this.prisma.$executeRawUnsafe<EventData[]>(
      `
      INSERT INTO hive_${hiveId}.events (title, description, start_time, end_time)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      data.title,
      data.description,
      data.startTime,
      data.endTime
    );

    // The decorator will automatically encrypt title and description
    // before this return value reaches the caller
    const event: EventData | undefined = result[0];
    if (!event) {
      throw new Error('Failed to create event');
    }
    return event;
  }

  /**
   * READ: Decrypt fields after loading
   *
   * The @DecryptFields decorator automatically decrypts the specified
   * fields in the return value after loading from the database.
   *
   * Flow:
   * 1. Method loads encrypted data from DB
   * 2. Return value is intercepted
   * 3. 'title' and 'description' are decrypted using hiveId
   * 4. Decrypted result is returned
   */
  @DecryptFields(['title', 'description'])
  async getEvent(eventId: string, hiveId: string): Promise<EventData | null> {
    // Load data (encrypted in DB)
    const result: EventData[] = await this.prisma.$queryRawUnsafe<EventData[]>(
      `
      SELECT * FROM hive_${hiveId}.events WHERE id = $1
    `,
      eventId
    );

    // The decorator will automatically decrypt title and description
    // before returning
    return result[0] ?? null;
  }

  /**
   * READ MANY: Decrypt arrays of objects
   *
   * The decorator handles arrays automatically!
   * Each item in the array gets its fields decrypted.
   */
  @DecryptFields(['title', 'description'])
  async listEvents(hiveId: string, startDate: Date, endDate: Date): Promise<EventData[]> {
    const events: EventData[] = await this.prisma.$queryRawUnsafe<EventData[]>(
      `
      SELECT * FROM hive_${hiveId}.events
      WHERE start_time >= $1 AND end_time <= $2
      ORDER BY start_time ASC
    `,
      startDate,
      endDate
    );

    // Array of events - decorator decrypts each one
    return events;
  }

  /**
   * UPDATE: Both encrypt and decrypt
   *
   * Use @EncryptDecryptFields when you need to:
   * 1. Decrypt incoming data (if it's already encrypted)
   * 2. Encrypt outgoing data (the updated result)
   *
   * Note: Usually for updates, incoming data is NOT encrypted
   * (it comes from the client as plaintext). So typically you'd
   * just use @EncryptFields on the return value.
   */
  @EncryptFields(['title', 'description'])
  async updateEvent(eventId: string, data: EventData, hiveId: string): Promise<EventData> {
    const result: EventData[] = await this.prisma.$executeRawUnsafe<EventData[]>(
      `
      UPDATE hive_${hiveId}.events
      SET title = $1, description = $2
      WHERE id = $3
      RETURNING *
    `,
      data.title,
      data.description,
      eventId
    );

    // Decorator encrypts the result
    const updated: EventData | undefined = result[0];
    if (!updated) {
      throw new Error('Failed to update event');
    }
    return updated;
  }

  /**
   * DELETE: No encryption needed
   *
   * For operations that don't return sensitive data,
   * you don't need any decorator.
   */
  async deleteEvent(eventId: string, hiveId: string): Promise<{ success: boolean }> {
    await this.prisma.$executeRawUnsafe(
      `
      DELETE FROM hive_${hiveId}.events WHERE id = $1
    `,
      eventId
    );

    return { success: true };
  }

  /**
   * SELECTIVE ENCRYPTION: Only some fields
   *
   * You can choose to encrypt only specific fields.
   * Here, we encrypt the description but NOT the title
   * (maybe title is needed for search).
   */
  @EncryptFields(['description']) // Only description is encrypted
  async createPublicEvent(data: EventData, hiveId: string): Promise<EventData> {
    const result: EventData[] = await this.prisma.$executeRawUnsafe<EventData[]>(
      `
      INSERT INTO hive_${hiveId}.events (title, description, start_time, end_time)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      data.title,
      data.description,
      data.startTime,
      data.endTime
    );

    // Only description is encrypted, title remains plaintext
    const event: EventData | undefined = result[0];
    if (!event) {
      throw new Error('Failed to create public event');
    }
    return event;
  }

  /**
   * CUSTOM HIVE ID PARAMETER NAME
   *
   * If your hiveId parameter has a different name,
   * specify it in the decorator options.
   */
  @EncryptFields({
    fields: ['title', 'description'],
    hiveIdParam: 'organizationId', // Custom parameter name
  })
  createEventCustomParam(data: EventData, _organizationId: string): EventData & { id: string } {
    // The decorator will look for 'organizationId' instead of 'hiveId'
    return { ...data, id: 'new-id' };
  }

  /**
   * NO ENCRYPTION: Regular method
   *
   * Methods without decorators work normally.
   * No performance overhead.
   */
  async getEventCount(hiveId: string): Promise<number> {
    const result: Array<{ count: bigint }> = await this.prisma.$queryRawUnsafe<
      Array<{ count: bigint }>
    >(`SELECT COUNT(*) as count FROM hive_${hiveId}.events`);

    const countResult: { count: bigint } | undefined = result[0];
    if (!countResult) {
      return 0;
    }

    return Number(countResult.count);
  }
}

/**
 * =============================================================================
 * USAGE EXAMPLES
 * =============================================================================
 */

/*

// Example 1: Create an event
const event = await eventsService.createEvent({
  title: 'Team Meeting',
  description: 'Discuss Q4 goals',
  startTime: new Date(),
  endTime: new Date(),
}, hiveId);

// Result (what you receive):
{
  id: '123',
  title: 'BASE64_ENCRYPTED_STRING_HERE',        // ← Encrypted automatically
  description: 'BASE64_ENCRYPTED_STRING_HERE',  // ← Encrypted automatically
  startTime: '2024-01-01T10:00:00Z',
  endTime: '2024-01-01T11:00:00Z',
}

// Example 2: Get an event
const event = await eventsService.getEvent('123', hiveId);

// Result (what you receive):
{
  id: '123',
  title: 'Team Meeting',              // ← Decrypted automatically
  description: 'Discuss Q4 goals',    // ← Decrypted automatically
  startTime: '2024-01-01T10:00:00Z',
  endTime: '2024-01-01T11:00:00Z',
}

// Example 3: List events
const events = await eventsService.listEvents(hiveId, startDate, endDate);

// Result (array, all decrypted):
[
  { id: '1', title: 'Event 1', description: 'Decrypted' },
  { id: '2', title: 'Event 2', description: 'Decrypted' },
  { id: '3', title: 'Event 3', description: 'Decrypted' },
]

*/

/**
 * =============================================================================
 * PERFORMANCE CONSIDERATIONS
 * =============================================================================
 *
 * ✅ GOOD:
 * - Encryption only happens on decorated methods
 * - Only specified fields are encrypted (not the whole object)
 * - Lazy evaluation (no overhead if decorator not present)
 * - Hive-specific keys cached in memory
 *
 * ⚠️ WATCH OUT:
 * - Large arrays: Encrypting 1000+ items may take time
 *   → Solution: Paginate, or encrypt only sensitive fields
 *
 * - Deep nesting: Currently only supports top-level fields
 *   → Solution: Implement nested field support if needed
 *
 * - Database storage: Encrypted data is larger (base64 + IV + tag)
 *   → ~1.5x size increase for encrypted fields
 *
 * 💡 BEST PRACTICES:
 * 1. Only encrypt truly sensitive fields (not everything)
 * 2. Use pagination for large lists
 * 3. Consider search requirements (encrypted = not searchable on server)
 * 4. Test with realistic data volumes
 */

/**
 * =============================================================================
 * MIGRATION STRATEGY
 * =============================================================================
 *
 * If you have existing unencrypted data:
 *
 * 1. Add nullable encrypted columns:
 *    ALTER TABLE events ADD COLUMN title_encrypted TEXT;
 *
 * 2. Gradual migration:
 *    - New data: Write to encrypted columns
 *    - Old data: Read from plaintext, write encrypted on update
 *
 * 3. Hybrid read:
 *    SELECT
 *      COALESCE(title_encrypted, title) as title,
 *      COALESCE(description_encrypted, description) as description
 *    FROM events;
 *
 * 4. After migration: Drop old columns
 *
 * The decorator approach makes this migration easier since encryption
 * logic is centralized!
 */
