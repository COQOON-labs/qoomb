# Prisma Performance Best Practices

## Table of Contents

- [Common Performance Pitfalls](#common-performance-pitfalls)
- [Prisma-Specific Optimizations](#prisma-specific-optimizations)
- [When to Use Raw SQL](#when-to-use-raw-sql)
- [Monitoring & Debugging](#monitoring--debugging)
- [Real-World Examples](#real-world-examples)

---

## Common Performance Pitfalls

### ❌ Problem 1: N+1 Queries

**Bad:**

```typescript
// 1 query for events
const events = await prisma.event.findMany();

// N queries for participants - CATASTROPHE!
for (const event of events) {
  event.participants = await prisma.person.findMany({
    where: { id: { in: event.participantIds } },
  });
}
// Total: 1 + N queries
```

**✅ Solution: Eager Loading with `include`**

```typescript
const events = await prisma.event.findMany({
  include: {
    participants: true,
    organizer: true,
  },
});
// Total: 1 query with JOINs
```

### ❌ Problem 2: Over-Fetching

**Bad:**

```typescript
// Fetches ALL fields, including large embedding vector
const events = await prisma.event.findMany();
// SELECT * FROM events (could be MBs of data!)
```

**✅ Solution: Selective Fields with `select`**

```typescript
const events = await prisma.event.findMany({
  select: {
    id: true,
    title: true,
    startTime: true,
    endTime: true,
    // No description, embedding, etc.
  },
});
// SELECT id, title, start_time, end_time FROM events
```

### ❌ Problem 3: Missing Indexes

**Bad:**

```typescript
// Query on unindexed column
const events = await prisma.event.findMany({
  where: { title: { contains: 'Meeting' } },
});
// Full table scan! 😱
```

✅ Solution: Indexes in Schema

```prisma
model Event {
  id    String @id
  title String

  @@index([title]) // Makes 'contains' queries faster
  @@index([startTime, familyId]) // Composite index for frequent queries
}
```

---

## Prisma-Specific Optimizations

### 1. Use `select` instead of `include` for Performance

```typescript
// ❌ Fetches too much (whole relations)
const events = await prisma.event.findMany({
  include: {
    participants: true, // All person fields
  },
});

// ✅ Only what we need
const events = await prisma.event.findMany({
  select: {
    id: true,
    title: true,
    participants: {
      select: {
        id: true,
        name: true, // Name only, not birthdate, etc.
      },
    },
  },
});
```

### 2. Batching with `findMany` + `where: { id: { in: [...] } }`

```typescript
// ✅ Instead of many individual findUnique calls
const eventIds = ['id1', 'id2', 'id3'];
const events = await prisma.event.findMany({
  where: {
    id: { in: eventIds },
  },
});
// 1 query instead of 3
```

### 3. Pagination for Large Datasets

```typescript
// ❌ Fetches ALL events (could be thousands)
const events = await prisma.event.findMany();

// ✅ Cursor-based Pagination (efficient!)
const events = await prisma.event.findMany({
  take: 20,
  skip: 0, // Or cursor-based for better performance
  cursor: lastEventId ? { id: lastEventId } : undefined,
  orderBy: { startTime: 'desc' },
});
```

### 4. Using Transactions Correctly

```typescript
// ✅ Interactive Transactions for complex operations
await prisma.$transaction(async (tx) => {
  const event = await tx.event.create({ data: eventData });
  await tx.notification.createMany({
    data: participants.map((p) => ({
      personId: p.id,
      eventId: event.id,
    })),
  });
});
```

### 5. Configure Connection Pooling

```env
# .env
DATABASE_URL="postgresql://user:pass@localhost:5432/db?connection_limit=10&pool_timeout=20"
```

---

## When to Use Raw SQL

### Prisma is NOT always the best choice

**When to use Raw SQL:**

#### 1. Complex Analytics Queries

```typescript
// Prisma cannot express this elegantly
const stats = await prisma.$queryRaw<
  Array<{
    month: string;
    event_count: number;
    avg_participants: number;
  }>
>`
  SELECT
    DATE_TRUNC('month', start_time) as month,
    COUNT(*) as event_count,
    AVG(ARRAY_LENGTH(participants, 1)) as avg_participants
  FROM events
  WHERE family_id = ${familyId}
    AND start_time >= NOW() - INTERVAL '1 year'
  GROUP BY DATE_TRUNC('month', start_time)
  ORDER BY month DESC
`;
```

#### 2. Vector Search (pgvector)

```typescript
// Semantic search with pgvector
const similarEvents = await prisma.$queryRaw<Event[]>`
  SELECT
    id,
    title,
    description,
    1 - (embedding <=> ${queryEmbedding}::vector) as similarity
  FROM events
  WHERE family_id = ${familyId}
    AND encryption_mode = 'server_side'
    AND 1 - (embedding <=> ${queryEmbedding}::vector) > 0.7
  ORDER BY similarity DESC
  LIMIT 10
`;
```

#### 3. Bulk Operations

```typescript
// More efficient than many individual Prisma calls
await prisma.$executeRaw`
  UPDATE events
  SET is_archived = true
  WHERE family_id = ${familyId}
    AND end_time < NOW() - INTERVAL '6 months'
`;
```

#### 4. Database-Specific Features

```typescript
// PostgreSQL-specific features
await prisma.$executeRaw`
  CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_events_embedding
  ON events USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
`;
```

### Hybrid Approach: Prisma + Raw SQL

```typescript
class EventsService {
  constructor(private prisma: PrismaService) {}

  // ✅ Simple CRUD: Prisma
  async getEvent(id: string) {
    return this.prisma.event.findUnique({
      where: { id },
      include: { participants: true },
    });
  }

  // ✅ Complex Analytics: Raw SQL
  async getEventStatistics(familyId: string) {
    return this.prisma.$queryRaw`
      SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT organizer_id) as unique_organizers,
        AVG(EXTRACT(EPOCH FROM (end_time - start_time))) as avg_duration_seconds
      FROM events
      WHERE family_id = ${familyId}
        AND start_time >= CURRENT_DATE - INTERVAL '30 days'
    `;
  }

  // ✅ Bulk Updates: Raw SQL
  async archiveOldEvents(familyId: string) {
    return this.prisma.$executeRaw`
      UPDATE events
      SET archived = true
      WHERE family_id = ${familyId}
        AND end_time < CURRENT_DATE - INTERVAL '1 year'
        AND archived = false
    `;
  }
}
```

---

## Monitoring & Debugging

### 1. Prisma Query Logging

```typescript
// prisma.service.ts
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'stdout', level: 'error' },
    { emit: 'stdout', level: 'warn' },
  ],
});

prisma.$on('query', (e) => {
  console.log('Query: ' + e.query);
  console.log('Duration: ' + e.duration + 'ms');
});
```

### 2. Performance Thresholds

```typescript
class PerformanceMonitor {
  static async wrapQuery<T>(
    queryName: string,
    query: () => Promise<T>,
    maxDurationMs: number = 1000
  ): Promise<T> {
    const start = Date.now();
    const result = await query();
    const duration = Date.now() - start;

    if (duration > maxDurationMs) {
      console.warn(`⚠️ Slow query detected: ${queryName} took ${duration}ms`);
    }

    return result;
  }
}

// Usage
const events = await PerformanceMonitor.wrapQuery(
  'getUpcomingEvents',
  () => prisma.event.findMany({ where: { ... } }),
  500 // Warn if > 500ms
);
```

### 3. Query EXPLAIN Analysis

```typescript
// In Development: Analyze query performance
if (process.env.NODE_ENV === 'development') {
  const explain = await prisma.$queryRaw`
    EXPLAIN ANALYZE
    SELECT * FROM events
    WHERE family_id = ${familyId}
    ORDER BY start_time DESC
    LIMIT 20
  `;
  console.log('Query Plan:', explain);
}
```

---

## Real-World Examples

### Example 1: Calendar View (Optimized)

```typescript
async getCalendarEvents(
  familyId: string,
  startDate: Date,
  endDate: Date
) {
  return this.prisma.event.findMany({
    where: {
      familyId,
      startTime: {
        gte: startDate,
        lte: endDate,
      },
    },
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      allDay: true,
      location: true,
      participants: {
        select: {
          id: true,
          name: true,
        },
      },
      // NOT: description, embedding, encrypted_data
    },
    orderBy: {
      startTime: 'asc',
    },
    // Performance: Limit results
    take: 100,
  });
}
```

### Example 2: Search with Fallback

```typescript
async searchEvents(
  familyId: string,
  query: string
): Promise<Event[]> {
  // Option 1: If AI enabled, use Vector Search
  if (this.config.aiEnabled) {
    const embedding = await this.llmService.embed(query);

    return this.prisma.$queryRaw`
      SELECT id, title, description, start_time
      FROM events
      WHERE family_id = ${familyId}
        AND 1 - (embedding <=> ${embedding}::vector) > 0.7
      ORDER BY 1 - (embedding <=> ${embedding}::vector) DESC
      LIMIT 20
    `;
  }

  // Option 2: Fallback to simple text search
  return this.prisma.event.findMany({
    where: {
      familyId,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      title: true,
      description: true,
      startTime: true,
    },
    take: 20,
  });
}
```

### Example 3: Optimistic Bulk Operations

```typescript
async updateMultipleEvents(
  eventIds: string[],
  updates: Partial<Event>
): Promise<number> {
  // ✅ Raw SQL for bulk update (much faster than N individual updates)
  const result = await this.prisma.$executeRaw`
    UPDATE events
    SET
      title = COALESCE(${updates.title}, title),
      location = COALESCE(${updates.location}, location),
      updated_at = NOW()
    WHERE id = ANY(${eventIds}::uuid[])
  `;

  return result; // Number of affected rows
}
```

---

## Performance Checklist

✅ **Always:**

- [ ] `select` instead of `include` where possible
- [ ] Indexes on WHERE/ORDER BY columns
- [ ] Pagination for lists (take/skip)
- [ ] Connection Pooling configured

✅ **For large datasets:**

- [ ] Cursor-based Pagination
- [ ] Batch Operations for Bulk Updates
- [ ] Query Logging enabled (development)

✅ **For complex queries:**

- [ ] Consider Raw SQL
- [ ] Run EXPLAIN ANALYZE
- [ ] Performance Monitoring

✅ **Avoid:**

- [ ] ❌ N+1 Queries (always use include/select)
- [ ] ❌ SELECT \* (always use explicit fields)
- [ ] ❌ Missing indexes on frequent WHERE clauses
- [ ] ❌ Large transactions (deadlock risk)

---

## Summary

**Prisma Philosophy:**

- ✅ Use Prisma for 80-90% of queries (CRUD, simple relations)
- ✅ Use Raw SQL for 10-20% (Analytics, Complex Joins, DB-specific features)
- ✅ Monitor performance from day one
- ✅ Optimize only when needed (premature optimization is bad too)

**Golden Rules:**

1. **Measure first, optimize second** - No guessing, measure!
2. **Select only what you need** - Less data = faster
3. **Use indexes wisely** - But not everywhere (indexes have a cost too)
4. **Know when to drop down to SQL** - Prisma is not a silver bullet

Prisma is **not slow per se** — but it can be misused (like any ORM). With the right patterns it is just as fast as hand-written SQL, but much safer!
