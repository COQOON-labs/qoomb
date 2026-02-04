# Prisma Performance Best Practices

## Inhaltsverzeichnis

- [Common Performance Pitfalls](#common-performance-pitfalls)
- [Prisma-Specific Optimizations](#prisma-specific-optimizations)
- [When to Use Raw SQL](#when-to-use-raw-sql)
- [Monitoring & Debugging](#monitoring--debugging)
- [Real-World Examples](#real-world-examples)

---

## Common Performance Pitfalls

### ❌ Problem 1: N+1 Queries

**Schlecht:**

```typescript
// 1 query for events
const events = await prisma.event.findMany();

// N queries for participants - KATASTROPHE!
for (const event of events) {
  event.participants = await prisma.person.findMany({
    where: { id: { in: event.participantIds } },
  });
}
// Total: 1 + N queries
```

**✅ Lösung: Eager Loading mit `include`**

```typescript
const events = await prisma.event.findMany({
  include: {
    participants: true,
    organizer: true,
  },
});
// Total: 1 query mit JOINs
```

### ❌ Problem 2: Over-Fetching

**Schlecht:**

```typescript
// Holt ALLE Felder, inklusive großem embedding vector
const events = await prisma.event.findMany();
// SELECT * FROM events (könnte MBs an Daten sein!)
```

**✅ Lösung: Selective Fields mit `select`**

```typescript
const events = await prisma.event.findMany({
  select: {
    id: true,
    title: true,
    startTime: true,
    endTime: true,
    // Kein description, embedding, etc.
  },
});
// SELECT id, title, start_time, end_time FROM events
```

### ❌ Problem 3: Fehlende Indizes

**Schlecht:**

```typescript
// Query auf unindexierter Spalte
const events = await prisma.event.findMany({
  where: { title: { contains: 'Meeting' } },
});
// Full table scan! 😱
```

**✅ Lösung: Indizes im Schema**

```prisma
model Event {
  id    String @id
  title String

  @@index([title]) // Macht 'contains' Queries schneller
  @@index([startTime, familyId]) // Composite index für häufige Queries
}
```

---

## Prisma-Specific Optimizations

### 1. Use `select` statt `include` für Performance

```typescript
// ❌ Holt zu viel (ganze Relations)
const events = await prisma.event.findMany({
  include: {
    participants: true, // Alle Person-Felder
  },
});

// ✅ Nur was wir brauchen
const events = await prisma.event.findMany({
  select: {
    id: true,
    title: true,
    participants: {
      select: {
        id: true,
        name: true, // Nur Name, nicht birthdate, etc.
      },
    },
  },
});
```

### 2. Batching mit `findMany` + `where: { id: { in: [...] } }`

```typescript
// ✅ Statt vieler einzelner findUnique calls
const eventIds = ['id1', 'id2', 'id3'];
const events = await prisma.event.findMany({
  where: {
    id: { in: eventIds },
  },
});
// 1 Query statt 3
```

### 3. Pagination für große Datasets

```typescript
// ❌ Holt ALLE Events (könnte tausende sein)
const events = await prisma.event.findMany();

// ✅ Cursor-based Pagination (effizient!)
const events = await prisma.event.findMany({
  take: 20,
  skip: 0, // Oder cursor-based für bessere Performance
  cursor: lastEventId ? { id: lastEventId } : undefined,
  orderBy: { startTime: 'desc' },
});
```

### 4. Transactions richtig nutzen

```typescript
// ✅ Interactive Transactions für komplexe Operationen
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

### 5. Connection Pooling konfigurieren

```env
# .env
DATABASE_URL="postgresql://user:pass@localhost:5432/db?connection_limit=10&pool_timeout=20"
```

---

## When to Use Raw SQL

### Prisma ist NICHT immer die beste Wahl!

**Wann Raw SQL verwenden:**

#### 1. Komplexe Analytics Queries

```typescript
// Prisma kann das nicht elegant ausdrücken
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
// Semantic Search mit pgvector
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
// Effizienter als viele einzelne Prisma calls
await prisma.$executeRaw`
  UPDATE events
  SET is_archived = true
  WHERE family_id = ${familyId}
    AND end_time < NOW() - INTERVAL '6 months'
`;
```

#### 4. Database-Specific Features

```typescript
// PostgreSQL-spezifische Features
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

  // ✅ Einfache CRUD: Prisma
  async getEvent(id: string) {
    return this.prisma.event.findUnique({
      where: { id },
      include: { participants: true },
    });
  }

  // ✅ Komplexe Analytics: Raw SQL
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
      // NICHT: description, embedding, encrypted_data
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
  // Option 1: Wenn AI enabled, nutze Vector Search
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

  // Option 2: Fallback zu einfacher Text-Suche
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
  // ✅ Raw SQL für Bulk Update (viel schneller als N einzelne updates)
  const result = await this.prisma.$executeRaw`
    UPDATE events
    SET
      title = COALESCE(${updates.title}, title),
      location = COALESCE(${updates.location}, location),
      updated_at = NOW()
    WHERE id = ANY(${eventIds}::uuid[])
  `;

  return result; // Anzahl der betroffenen Rows
}
```

---

## Performance Checklist

✅ **Immer:**

- [ ] `select` statt `include` wenn möglich
- [ ] Indizes auf WHERE/ORDER BY Spalten
- [ ] Pagination für Listen (take/skip)
- [ ] Connection Pooling konfiguriert

✅ **Bei großen Datasets:**

- [ ] Cursor-based Pagination
- [ ] Batch Operations für Bulk Updates
- [ ] Query Logging aktiviert (development)

✅ **Bei komplexen Queries:**

- [ ] Raw SQL in Betracht ziehen
- [ ] EXPLAIN ANALYZE durchführen
- [ ] Performance Monitoring

✅ **Vermeiden:**

- [ ] ❌ N+1 Queries (immer include/select nutzen)
- [ ] ❌ SELECT \* (immer explizite fields)
- [ ] ❌ Fehlende Indizes auf häufigen WHERE clauses
- [ ] ❌ Große Transactions (deadlock-Gefahr)

---

## Zusammenfassung

**Prisma Philosophie:**

- ✅ Nutze Prisma für 80-90% der Queries (CRUD, simple Relations)
- ✅ Nutze Raw SQL für 10-20% (Analytics, Complex Joins, DB-specific features)
- ✅ Überwache Performance von Anfang an
- ✅ Optimiere erst wenn nötig (premature optimization ist auch schlecht!)

**Golden Rules:**

1. **Measure first, optimize second** - Keine Vermutungen, sondern messen!
2. **Select only what you need** - Weniger Daten = schneller
3. **Use indexes wisely** - Aber nicht überall (Indexes kosten auch)
4. **Know when to drop down to SQL** - Prisma ist kein Silberkugel

Prisma ist **nicht langsam per se** - aber man kann es falsch nutzen (wie jedes ORM). Mit den richtigen Patterns ist es genauso schnell wie handgeschriebenes SQL, aber viel sicherer!
