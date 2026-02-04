# Prisma Patterns: Good vs Bad

Konkrete Beispiele für Qoomb Events Service

## Pattern 1: Simple CRUD Operations

### ❌ BAD: Over-fetching

```typescript
class EventsService {
  async getEvent(id: string) {
    // Holt ALLES, auch das riesige embedding vector!
    return this.prisma.event.findUnique({
      where: { id },
    });
    // Performance: 🐌 Langsam (viele KB pro Event)
  }
}
```

### ✅ GOOD: Selective Fields

```typescript
class EventsService {
  async getEvent(id: string) {
    return this.prisma.event.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        startTime: true,
        endTime: true,
        allDay: true,
        location: true,
        participants: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        organizer: {
          select: {
            id: true,
            name: true,
          },
        },
        // embedding, encryptedData NICHT laden
      },
    });
    // Performance: ⚡ Schnell (nur nötige Felder)
  }
}
```

---

## Pattern 2: List Operations

### ❌ BAD: No Pagination + N+1

```typescript
async getUpcomingEvents(familyId: string) {
  // Problem 1: Keine Pagination (könnte 10.000+ Events sein!)
  const events = await this.prisma.event.findMany({
    where: { familyId }
  });

  // Problem 2: N+1 für jeden Event die Participants laden
  for (const event of events) {
    event.participants = await this.prisma.person.findMany({
      where: {
        id: { in: event.participantIds }
      }
    });
  }

  return events;
  // Performance: 🔥 KATASTROPHE (1 + N queries)
}
```

### ✅ GOOD: Pagination + Eager Loading

```typescript
async getUpcomingEvents(
  familyId: string,
  options: {
    cursor?: string;
    limit?: number;
  } = {}
) {
  const limit = options.limit || 20;

  return this.prisma.event.findMany({
    where: {
      familyId,
      startTime: {
        gte: new Date() // Nur zukünftige Events
      }
    },
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      allDay: true,
      location: true,
      participants: {
        // Eager loading in EINEM Query
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: {
      startTime: 'asc'
    },
    take: limit,
    ...(options.cursor && {
      cursor: { id: options.cursor },
      skip: 1 // Skip the cursor itself
    })
  });
  // Performance: ⚡ Schnell (1 query mit JOIN, limitiert)
}
```

---

## Pattern 3: Complex Queries

### ❌ BAD: Multiple Queries + Client-Side Logic

```typescript
async getEventStatistics(familyId: string) {
  // Query 1: Alle Events
  const events = await this.prisma.event.findMany({
    where: { familyId }
  });

  // Query 2: Alle Tasks
  const tasks = await this.prisma.task.findMany({
    where: { familyId }
  });

  // Client-side Aggregation (langsam!)
  const stats = {
    totalEvents: events.length,
    upcomingEvents: events.filter(e => e.startTime > new Date()).length,
    averageParticipants: events.reduce((sum, e) =>
      sum + e.participantIds.length, 0) / events.length,
    totalTasks: tasks.length,
    completedTasks: tasks.filter(t => t.status === 'done').length
  };

  return stats;
  // Performance: 🐌 Langsam (2 queries + client processing)
  // Memory: 💥 Hoch (alle Daten im Memory)
}
```

### ✅ GOOD: Database Aggregation

```typescript
async getEventStatistics(familyId: string) {
  // EINE Query, Aggregation in DB
  const result = await this.prisma.$queryRaw<{
    total_events: bigint;
    upcoming_events: bigint;
    avg_participants: number;
    total_tasks: bigint;
    completed_tasks: bigint;
  }[]>`
    SELECT
      (SELECT COUNT(*) FROM events WHERE family_id = ${familyId})
        as total_events,
      (SELECT COUNT(*) FROM events
        WHERE family_id = ${familyId} AND start_time > NOW())
        as upcoming_events,
      (SELECT AVG(ARRAY_LENGTH(participants, 1)) FROM events
        WHERE family_id = ${familyId})
        as avg_participants,
      (SELECT COUNT(*) FROM tasks WHERE family_id = ${familyId})
        as total_tasks,
      (SELECT COUNT(*) FROM tasks
        WHERE family_id = ${familyId} AND status = 'done')
        as completed_tasks
  `;

  return {
    totalEvents: Number(result[0].total_events),
    upcomingEvents: Number(result[0].upcoming_events),
    averageParticipants: result[0].avg_participants,
    totalTasks: Number(result[0].total_tasks),
    completedTasks: Number(result[0].completed_tasks)
  };
  // Performance: ⚡ Sehr schnell (1 query, DB-side aggregation)
  // Memory: ✅ Niedrig (nur Ergebnis, nicht alle Daten)
}
```

---

## Pattern 4: Search Operations

### ❌ BAD: Full Text Search ohne Index

```typescript
async searchEvents(familyId: string, query: string) {
  return this.prisma.event.findMany({
    where: {
      familyId,
      // ILIKE auf nicht-indexierter Spalte = Full Table Scan!
      title: {
        contains: query,
        mode: 'insensitive'
      }
    }
  });
  // Performance: 🐌 Sehr langsam bei vielen Events
}
```

### ✅ GOOD: Indexed Search oder Vector Search

```typescript
async searchEvents(familyId: string, query: string) {
  // Option A: Wenn AI verfügbar, nutze Vector Search
  if (this.config.aiEnabled && query.length > 3) {
    const embedding = await this.aiService.createEmbedding(query);

    return this.prisma.$queryRaw<Event[]>`
      SELECT
        id, title, description, start_time, end_time,
        1 - (embedding <=> ${embedding}::vector) as similarity
      FROM events
      WHERE family_id = ${familyId}
        AND encryption_mode = 'server_side'
        AND 1 - (embedding <=> ${embedding}::vector) > 0.7
      ORDER BY similarity DESC
      LIMIT 20
    `;
  }

  // Option B: Standard Text Search mit Index
  // (Benötigt: @@index([title]) im Schema)
  return this.prisma.event.findMany({
    where: {
      familyId,
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } }
      ]
    },
    select: {
      id: true,
      title: true,
      description: true,
      startTime: true,
      endTime: true
    },
    take: 20
  });
  // Performance: ⚡ Schnell (mit Index bzw. Vector Search)
}
```

---

## Pattern 5: Bulk Operations

### ❌ BAD: Loop über einzelne Updates

```typescript
async markEventsAsArchived(eventIds: string[]) {
  // N separate UPDATE queries - SEHR langsam!
  for (const id of eventIds) {
    await this.prisma.event.update({
      where: { id },
      data: { archived: true }
    });
  }
  // Performance: 🔥 KATASTROPHE (N queries)
  // Bei 100 Events = 100 queries!
}
```

### ✅ GOOD: Single Bulk Update

```typescript
async markEventsAsArchived(eventIds: string[]) {
  // EINE Query für alle Updates
  return this.prisma.event.updateMany({
    where: {
      id: { in: eventIds }
    },
    data: {
      archived: true
    }
  });
  // Performance: ⚡ Sehr schnell (1 query)
  // Bei 100 Events = 1 query!
}

// Oder für maximale Performance: Raw SQL
async markEventsAsArchivedFast(eventIds: string[]) {
  return this.prisma.$executeRaw`
    UPDATE events
    SET archived = true, updated_at = NOW()
    WHERE id = ANY(${eventIds}::uuid[])
  `;
  // Performance: ⚡⚡ Noch schneller
}
```

---

## Pattern 6: Transactions

### ❌ BAD: Separate Queries (Race Conditions möglich!)

```typescript
async createEventWithNotifications(
  familyId: string,
  eventData: CreateEventInput
) {
  // Problem: Wenn zwischen create und createMany etwas schief geht,
  // haben wir ein Event ohne Notifications!
  const event = await this.prisma.event.create({
    data: {
      ...eventData,
      familyId
    }
  });

  await this.prisma.notification.createMany({
    data: eventData.participants.map(pId => ({
      personId: pId,
      eventId: event.id,
      type: 'EVENT_CREATED'
    }))
  });

  return event;
  // Problem: ❌ Keine Atomicity!
}
```

### ✅ GOOD: Transaction für Atomicity

```typescript
async createEventWithNotifications(
  familyId: string,
  eventData: CreateEventInput
) {
  // Alles-oder-nichts: Entweder beide Operationen erfolgreich oder keine
  return this.prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        ...eventData,
        familyId
      }
    });

    await tx.notification.createMany({
      data: eventData.participants.map(pId => ({
        personId: pId,
        eventId: event.id,
        type: 'EVENT_CREATED'
      }))
    });

    return event;
  });
  // Performance: ⚡ Schnell + ✅ Sicher (atomisch)
}
```

---

## Pattern 7: Conditional Queries (Dynamic WHERE)

### ❌ BAD: Viele if-else mit duplizierten Queries

```typescript
async filterEvents(
  familyId: string,
  filters: EventFilters
) {
  if (filters.organizerId && filters.startDate && filters.endDate) {
    return this.prisma.event.findMany({
      where: {
        familyId,
        organizerId: filters.organizerId,
        startTime: { gte: filters.startDate },
        endTime: { lte: filters.endDate }
      }
    });
  } else if (filters.organizerId && filters.startDate) {
    return this.prisma.event.findMany({
      where: {
        familyId,
        organizerId: filters.organizerId,
        startTime: { gte: filters.startDate }
      }
    });
  }
  // ... 10 more combinations ...
  // Code: 🤮 Unmaintainable
}
```

### ✅ GOOD: Dynamic Query Building

```typescript
async filterEvents(
  familyId: string,
  filters: EventFilters
) {
  const where: Prisma.EventWhereInput = {
    familyId
  };

  if (filters.organizerId) {
    where.organizerId = filters.organizerId;
  }

  if (filters.startDate) {
    where.startTime = { gte: filters.startDate };
  }

  if (filters.endDate) {
    where.endTime = { lte: filters.endDate };
  }

  if (filters.participants?.length) {
    where.participants = {
      hasSome: filters.participants
    };
  }

  return this.prisma.event.findMany({
    where,
    select: {
      id: true,
      title: true,
      startTime: true,
      endTime: true,
      organizer: {
        select: { id: true, name: true }
      }
    },
    orderBy: { startTime: 'desc' },
    take: filters.limit || 50
  });
  // Code: ✅ Clean, maintainable
  // Performance: ⚡ Schnell
}
```

---

## Zusammenfassung: Die goldenen Regeln

1. **SELECT nur nötige Felder** - Nicht `SELECT *`
2. **INCLUDE Relations eager** - Vermeide N+1
3. **LIMIT immer bei Listen** - Pagination!
4. **BATCH Operationen** - Nicht in Loops
5. **TRANSACTION bei Multi-Ops** - Atomicity wichtig
6. **RAW SQL bei Complex Queries** - Kein Prisma-Zwang
7. **INDEX oft genutzte WHERE** - Performance!
8. **MEASURE vor Optimize** - Keine Vermutungen!

## Wann was nutzen?

| Use Case               | Tool                    | Warum                             |
| ---------------------- | ----------------------- | --------------------------------- |
| Simple CRUD            | Prisma                  | Type-safe, clean                  |
| Complex Joins          | Prisma (include/select) | OK für 2-3 tables                 |
| Analytics/Aggregations | Raw SQL                 | DB ist besser darin               |
| Vector Search          | Raw SQL                 | pgvector-spezifisch               |
| Bulk Updates           | Raw SQL                 | Viel schneller                    |
| Transactions           | Prisma $transaction     | Sauber, sicher                    |
| Full Text Search       | Depends                 | Index + Prisma OK, sonst pgvector |

**Bottom Line:** Prisma für 80% der Queries, Raw SQL für die anderen 20% wo Performance kritisch ist!
