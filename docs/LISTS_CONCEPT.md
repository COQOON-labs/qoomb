# Qoomb Lists — Konzept & Architektur

> **Audience:** Product‑, Design‑ und Entwicklungsteam + AI Assistants.
> Dieses Dokument beschreibt das „Listen"-Feature aus Nutzersicht und als technische Architektur.
> Zugehörige ADR: [ADR-0007](adr/0007-flexible-lists-architecture.md)

---

## 1. Vision

**Alles ist eine Liste.** — Einkaufslisten, Projekte, Putzpläne, Vokabelsammlungen, Budget-Tracker
und beliebige andere Sammlungen werden durch ein einziges, flexibles Datenmodell abgebildet. Die
Mächtigkeit kommt durch konfigurierbare Felder und Ansichten — die Einfachheit durch Templates, die
80 % der Arbeit abnehmen.

**Leitprinzip:** _„Man kann sehr viel damit machen — muss aber nicht."_
Progressive Disclosure: einfache Listen funktionieren sofort, Power‑Features sind optional.

---

## 2. Nutzersicht

### 2.1 Was ist eine Liste?

Eine **Liste** ist eine konfigurierbare Sammlung von Elementen mit eigenem Schema (Bauplan).
Jede Liste hat:

- einen **Namen** und optional ein **Icon**
- einen **Bauplan** (Schema): welche Felder hat ein Element? (Titel, Checkbox, Datum, …)
- eine oder mehrere **Ansichten** (Checkliste, Tabelle, später Kanban …)
- eine **Sichtbarkeit** (Hive / Admins / Gruppe / Privat)

### 2.2 Elemente

Ein **Listenelement** ist ein Datensatz innerhalb einer Liste. Seine Felder werden durch den
Bauplan der Liste definiert. Jedes Element gehört zu **genau einer** Liste — keine
Mehrfachzugehörigkeit, aber Referenzen auf Elemente in anderen Listen sind möglich.

### 2.3 Templates

Ein **Template** ist eine gespeicherte Bauplan-Vorlage. Beim Erstellen einer neuen Liste wählt man
ein Template — die Liste bekommt eine Kopie des Bauplans. **Nach der Erstellung sind Liste und
Template unabhängig voneinander.** Änderungen am Bauplan ändern nicht das Template und umgekehrt.

Templates können vordefiniert (von Qoomb) oder selbst erstellt (vom Nutzer) sein.

### 2.4 Ansichten

Jede Liste kann **mehrere Ansichten** haben. Ansichten zeigen dieselben Daten unterschiedlich an:

| Ansicht        | Beschreibung                                    | Scope    |
| -------------- | ----------------------------------------------- | -------- |
| **Checkliste** | Elemente als abhakbare Liste                    | Scope 1  |
| **Tabelle**    | Elemente als Zeilen, Felder als Spalten         | Scope 1  |
| **Kanban**     | Elemente als Karten, gruppiert nach Status-Feld | Scope 2  |
| **Kalender**   | Elemente mit Datum auf einer Kalenderansicht    | Scope 3+ |
| **Galerie**    | Elemente als Bild-Karten (z.B. Rezeptsammlung)  | Scope 3+ |

Jede Ansicht kann **eigene Filter und Sortierung** haben:

- Filter: z.B. „erledigte ausblenden", „nur Prio hoch"
- Sortierung: Drag & Drop (manuelle Reihenfolge) oder automatisch nach Attribut (Datum, Priorität…)

**Archivierung = gefilterte Ansicht.** Es gibt kein explizites Archiv-Modell.
Elemente mit Status „erledigt" werden in einer Ansicht ausgeblendet — bei Bedarf einblendbar.
Endgültiges **Löschen** ist ebenfalls möglich.

### 2.5 Inbox

Jede Person hat eine automatisch erstellte **Inbox-Liste** (Systemliste, `type: 'inbox'`).
Quick-Add ohne Listenzuordnung → Element landet in der Inbox. Von dort werden Elemente manuell in
echte Listen einsortiert.

Vorteile:

- `listId` ist immer NOT NULL — kein Sonderfall im Datenmodell
- Inbox erscheint als normale Liste in der Navigation
- Drag & Drop / Verschieben zwischen Listen ist ein einheitliches Muster

### 2.6 Quick-Add

Schnelles Erfassen eines Elements:

- **In einer Liste**: Element wird direkt dort erstellt
- **Global** (z.B. über ein `+`-Icon in der Navigation): Element landet in der Inbox
- Minimale Eingabe: nur Titel → Enter → fertig (alle anderen Felder optional)

### 2.7 Zuweisungen

Elemente können einer **Person zugewiesen** werden (pro Element). Nicht auf Listenebene.

### 2.8 Referenzen

Elemente können auf Elemente in **anderen Listen referenzieren** über ein Feld vom Typ „Referenz".
In Scope 1 sind **regelbasierte Referenzierungen** möglich: ein Referenz-Feld kann automatisch
befüllt werden basierend auf Bedingungen (z.B. „alle Zutaten aus Menüplan-Woche 12 die nicht
im Inventar sind").

### 2.9 Keine Verschachtelung

Listen haben keine Unter-Listen. Keine Parent-Child-Hierarchie. Flache Struktur.
Beziehungen zwischen Listen werden über Referenzen abgebildet.

### 2.10 Verknüpfung mit Terminen

Termine (Events) bleiben ein **eigenes Modell**. Bidirektionale Verknüpfung ist möglich:

- Aus Terminen können sich Aufgaben/Listenelemente ergeben
- Listenelemente können auf Termine referenzieren

---

## 3. Template-Katalog (vordefiniert)

| Template                   | Typische Felder                                                              | Ansichten                 |
| -------------------------- | ---------------------------------------------------------------------------- | ------------------------- |
| **Aufgabenliste**          | Titel, Status (offen/erledigt), Priorität, Fällig am, Zugewiesen an          | Checkliste, Tabelle       |
| **Einkaufsliste**          | Artikel, Menge, Kategorie (Obst, Milch…), Erledigt                           | Checkliste                |
| **Projekt**                | Titel, Status (Todo/In Progress/Done/Blocked), Priorität, Zugewiesen, Fällig | Tabelle, (Kanban Scope 2) |
| **Packliste**              | Gegenstand, Kategorie, Eingepackt                                            | Checkliste                |
| **Putzplan**               | Bereich/Raum, Aufgabe, Zuständig, Erledigt                                   | Tabelle, Checkliste       |
| **Leseliste**              | Titel, Autor, Typ (Buch/Artikel/Film), Status (will/lese/gelesen), Bewertung | Tabelle                   |
| **Wunschliste**            | Gegenstand, Für wen, Link/URL, Preis, Gekauft                                | Tabelle, Checkliste       |
| **Menüplan**               | Gericht, Tag (Mo–So), Mahlzeit (Frühstück/Mittag/Abend), Zutaten-Referenz    | Tabelle                   |
| **Inventar**               | Gegenstand, Kategorie, Ort (Keller/Kühlschrank/…), Menge                     | Tabelle                   |
| **Vokabelsammlung**        | Wort, Übersetzung, Beispielsatz, Gelernt                                     | Checkliste, Tabelle       |
| **Budget-Tracker**         | Beschreibung, Kategorie, Betrag, Datum                                       | Tabelle                   |
| **Kontakte/Dienstleister** | Name, Typ, Telefon, E-Mail, Notiz                                            | Tabelle                   |
| **Kinder-Checkliste**      | Aufgabe, Kind (Zugewiesen), Erledigt                                         | Checkliste                |
| **Habit-Tracker**          | Gewohnheit, Erledigt (pro Tag)                                               | Tabelle, Checkliste       |
| **Sammlung** (generisch)   | Titel, Notiz                                                                 | Checkliste, Tabelle       |

Nutzer können jederzeit **eigene Templates erstellen**: den Bauplan einer bestehenden Liste als
neues Template speichern, oder ein leeres Template von Grund auf bauen.

---

## 4. Architektur

### 4.1 Datenmodell (Übersicht)

```text
List (Schema/Bauplan)
├── ListField[]       (Felddefinitionen des Bauplans)
├── ListView[]        (Ansichten: Checkliste, Tabelle, …)
│   └── ViewFilter[]  (Filter + Sortierung pro Ansicht)
└── ListItem[]        (die eigentlichen Daten-Elemente)
    └── ListItemValue[] (Feldwerte pro Element)

ListTemplate (Vorlagen)
├── TemplateField[]   (Felddefinitionen der Vorlage)
└── TemplateView[]    (Standard-Ansichten der Vorlage)
```

### 4.2 Schema (geplant)

```sql
-- ── Listen ────────────────────────────────────────────────────────────────────

lists:
  id              UUID PK
  hive_id         UUID FK → hives
  creator_id      UUID FK → persons
  name            TEXT ENCRYPTED
  icon            TEXT?                         -- emoji oder URL, unencrypted (cosmetic)
  type            VARCHAR(20) DEFAULT 'custom'  -- 'custom' | 'inbox'
  visibility      VARCHAR(20) DEFAULT 'hive'
    -- CHECK (visibility IN ('hive', 'admins', 'group', 'private'))
  group_id        UUID? FK → hive_groups        -- required when visibility = 'group'
  sort_order      FLOAT                         -- Reihenfolge in der Navigation
  is_archived     BOOLEAN DEFAULT false
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

INDEX: (hive_id, type)
INDEX: (hive_id, creator_id)
UNIQUE: (hive_id, creator_id) WHERE type = 'inbox'  -- max 1 Inbox pro Person

-- ── Felddefinitionen (Bauplan einer Liste) ────────────────────────────────────

list_fields:
  id              UUID PK
  list_id         UUID FK → lists (CASCADE)
  name            TEXT ENCRYPTED                -- Feldname, z.B. "Priorität"
  field_type      VARCHAR(30)                   -- text | number | date | checkbox |
                                                -- select | person | reference | url
  config          JSONB                         -- typspezifisch:
                  -- select: { options: ["Hoch", "Mittel", "Niedrig"] }
                  -- reference: { targetListId: UUID, rule?: FilterExpression }
                  -- person: {}
                  -- number: { min?, max?, unit? }
  is_required     BOOLEAN DEFAULT false
  is_title        BOOLEAN DEFAULT false         -- genau 1 Feld pro Liste ist der Titel
  sort_order      FLOAT                         -- Reihenfolge der Felder
  created_at      TIMESTAMPTZ

INDEX: (list_id, sort_order)

-- ── Ansichten ─────────────────────────────────────────────────────────────────

list_views:
  id              UUID PK
  list_id         UUID FK → lists (CASCADE)
  name            TEXT ENCRYPTED
  view_type       VARCHAR(20)                   -- 'checklist' | 'table' (Scope 1)
                                                -- 'kanban' (Scope 2)
  config          JSONB                         -- ansichtsspezifisch:
                  -- checklist: { checkboxFieldId: UUID }
                  -- table: { visibleFieldIds: UUID[], columnWidths: {} }
                  -- kanban: { groupByFieldId: UUID }
  filter          JSONB?                        -- FilterExpression (siehe §4.4)
  sort_by         JSONB?                        -- [{ fieldId: UUID, direction: 'asc'|'desc' }]
  sort_mode       VARCHAR(10) DEFAULT 'auto'    -- 'auto' | 'manual'
  is_default      BOOLEAN DEFAULT false
  created_at      TIMESTAMPTZ

INDEX: (list_id)

-- ── Listenelemente ────────────────────────────────────────────────────────────

list_items:
  id              UUID PK
  list_id         UUID FK → lists (CASCADE)
  hive_id         UUID FK → hives               -- denormalized for RLS
  creator_id      UUID FK → persons
  assignee_id     UUID? FK → persons
  sort_order      FLOAT                         -- manuelle Reihenfolge
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

INDEX: (list_id, sort_order)
INDEX: (hive_id, creator_id)
INDEX: (hive_id, assignee_id)

-- ── Feldwerte pro Element ─────────────────────────────────────────────────────

list_item_values:
  id              UUID PK
  item_id         UUID FK → list_items (CASCADE)
  field_id        UUID FK → list_fields (CASCADE)
  value           TEXT? ENCRYPTED               -- alle Werte: serialisiert → verschlüsselt

UNIQUE: (item_id, field_id)  -- ein Wert pro Feld pro Element
INDEX: (field_id)

-- ── Templates ─────────────────────────────────────────────────────────────────

list_templates:
  id              UUID PK
  hive_id         UUID? FK → hives              -- NULL = System-Template (vordefiniert)
  creator_id      UUID? FK → persons            -- NULL = System-Template
  name            TEXT                           -- unencrypted (Templates sind Vorlagen, kein PII)
  description     TEXT?
  icon            TEXT?
  is_system       BOOLEAN DEFAULT false         -- true = von Qoomb vordefiniert
  created_at      TIMESTAMPTZ
  updated_at      TIMESTAMPTZ

INDEX: (hive_id)

-- Template-Felddefinitionen (Kopiervorlage)
list_template_fields:
  id              UUID PK
  template_id     UUID FK → list_templates (CASCADE)
  name            TEXT                           -- Klartext (Templates enthalten kein PII)
  field_type      VARCHAR(30)
  config          JSONB
  is_required     BOOLEAN DEFAULT false
  is_title        BOOLEAN DEFAULT false
  sort_order      FLOAT

-- Template-Ansichten (Kopiervorlage)
list_template_views:
  id              UUID PK
  template_id     UUID FK → list_templates (CASCADE)
  name            TEXT
  view_type       VARCHAR(20)
  config          JSONB
  filter          JSONB?
  sort_by         JSONB?
  sort_mode       VARCHAR(10) DEFAULT 'auto'
  is_default      BOOLEAN DEFAULT false
```

### 4.3 Feldtypen (Scope 1)

| Typ          | `field_type` | Gespeichert in                      | Beschreibung                         |
| ------------ | ------------ | ----------------------------------- | ------------------------------------ |
| **Text**     | `text`       | `value` (encrypted)                 | Freitext, einzeilig oder mehrzeilig  |
| **Zahl**     | `number`     | `value` (encrypted, als String)     | Numerischer Wert (Betrag, Menge, …)  |
| **Datum**    | `date`       | `value` (encrypted, ISO 8601)       | Datum/Zeitpunkt                      |
| **Checkbox** | `checkbox`   | `value` (encrypted, "true"/"false") | Ja/Nein (zum Abhaken)                |
| **Auswahl**  | `select`     | `value` (encrypted)                 | Dropdown aus vordefinierten Optionen |
| **Person**   | `person`     | `value` (encrypted, UUID)           | Zuweisung an ein Hive-Mitglied       |
| **Referenz** | `reference`  | `value` (encrypted, UUID)           | Verweis auf Element in anderer Liste |
| **URL**      | `url`        | `value` (encrypted)                 | Link                                 |

### 4.4 Filter-Ausdrücke (FilterExpression)

Ansichten und regelbasierte Referenzen verwenden denselben Filter-Ausdruck:

```typescript
interface FilterExpression {
  operator: 'and' | 'or';
  conditions: FilterCondition[];
}

interface FilterCondition {
  fieldId: string; // UUID des Felds
  comparator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'not_contains'
    | 'is_empty'
    | 'is_not_empty'
    | 'is_checked'
    | 'is_unchecked';
  value?: string | number | boolean;
}
```

Beispiel — „Erledigte ausblenden":

```json
{
  "operator": "and",
  "conditions": [{ "fieldId": "<checkbox-feld-id>", "comparator": "is_unchecked" }]
}
```

### 4.5 Regelbasierte Referenzierung

Ein Referenz-Feld kann optional eine **Regel** (Filter) haben, die automatisch bestimmt, welche
Elemente aus der Ziel-Liste referenziert werden. Die Regel wird als `FilterExpression` in
`list_fields.config.rule` gespeichert.

Beispiel — Einkaufsliste referenziert automatisch alle Zutaten aus dem Menüplan, die nicht
im Inventar vorhanden sind:

```json
{
  "targetListId": "<menüplan-list-id>",
  "rule": {
    "operator": "and",
    "conditions": [{ "fieldId": "<zutaten-feld-id>", "comparator": "is_not_empty" }]
  }
}
```

> **Hinweis:** Komplexere Cross-List-Automatisierungen (z.B. „wenn Einkauf abgehakt → ins Inventar
> verschieben") sind für Scope 2+ geplant. Scope 1 beschränkt sich auf lesende Referenzen.

### 4.6 Encryption

Folgt dem bestehenden Muster (siehe [ADR-0005](adr/0005-hybrid-encryption-architecture.md)):

| Feld                        | Encrypted? | Begründung                                         |
| --------------------------- | ---------- | -------------------------------------------------- |
| `lists.name`                | ✅         | Vom Nutzer eingegebener Name                       |
| `list_fields.name`          | ✅         | Vom Nutzer definierter Feldname                    |
| `list_views.name`           | ✅         | Vom Nutzer benannter Ansichtsname                  |
| `list_item_values.value`    | ✅         | Alle Nutzerdaten (serialisiert + verschlüsselt)    |
| IDs, Timestamps, sort_order | ❌         | Strukturell/operationell                           |
| Template-Felder             | ❌         | Templates enthalten kein PII (generische Vorlagen) |

### 4.7 Berechtigungen

Listen nutzen das bestehende 5-Stufen-Zugriffsmodell (siehe [PERMISSIONS.md](PERMISSIONS.md)):

- **Sichtbarkeit**: `hive` / `admins` / `group` / `private`
- **PersonShares & GroupShares**: `VIEW (1)` / `EDIT (2)` / `MANAGE (3)`
- **Rollenbasierte Berechtigungen** (neu):

```typescript
// Neue Permissions für packages/types/src/permissions.ts
LISTS_VIEW = 'lists:view';
LISTS_CREATE = 'lists:create';
LISTS_UPDATE_OWN = 'lists:update:own';
LISTS_UPDATE_ANY = 'lists:update:any';
LISTS_DELETE_OWN = 'lists:delete:own';
LISTS_DELETE_ANY = 'lists:delete:any';
```

| Rolle                  | Family Hive                          | Organization Hive        |
| ---------------------- | ------------------------------------ | ------------------------ |
| `parent` / `org_admin` | Alle Permissions                     | Alle Permissions         |
| `child` / `member`     | VIEW, CREATE, UPDATE_OWN, DELETE_OWN | VIEW, CREATE, UPDATE_OWN |
| `manager`              | —                                    | Alle Permissions         |
| `guest`                | —                                    | VIEW                     |

Die Inbox-Liste einer Person hat automatisch `visibility: 'private'`.

---

## 5. Abgrenzungen

### Listen vs. Termine (Events)

| Aspekt               | Listen                  | Termine                     |
| -------------------- | ----------------------- | --------------------------- |
| Zeitbezug            | Optional (Feld „Datum") | Zentral (Start/Ende, Dauer) |
| Wiederkehr           | Scope 2+                | Scope 1 (RecurrenceRule)    |
| Kalender-Integration | Nein                    | Ja (Google, Apple, Outlook) |
| Flexibles Schema     | Ja (Custom Fields)      | Nein (festes Schema)        |

**Verknüpfung**: Listenelemente können über ein Referenz-Feld auf einen Termin zeigen.
Termine können Listenelemente „spawnen" (z.B. „Aufgaben für diesen Termin").

### Listen vs. Pages

| Aspekt    | Listen                             | Pages                        |
| --------- | ---------------------------------- | ---------------------------- |
| Struktur  | Strukturierte Elemente mit Feldern | Freitext (Tiptap Rich-Text)  |
| Ansichten | Checkliste, Tabelle, Kanban, …     | Dokumentenansicht            |
| Anwendung | Aufgaben, Sammlungen, Tracker      | Notizen, Dokumentation, Wiki |

**Verknüpfung**: Pages können Listenelemente als Referenz-Blöcke einbetten.
Listenelemente können ein Textfeld haben, das als Mini-Notiz dient.

### Listen vs. das bestehende Tasks-Modul

Das bestehende `tasks`-Modul (`apps/api/src/modules/tasks/`) wird durch das Listen-Konzept
**abgelöst**. Eine Aufgabenliste ist eine Liste mit dem Template „Aufgabenliste". Die vorhandene
Tasks-API bleibt vorerst bestehen, wird aber schrittweise migriert:

1. **Scope 1**: Listen-System aufbauen, „Aufgabenliste"-Template als gleichwertigen Ersatz
2. **Migration**: Bestehende Tasks in Listenelemente überführen
3. **Deprecation**: Tasks-API als deprecated markieren, dann entfernen

---

## 6. Scope-Planung

### Scope 1 (MVP)

- [ ] Datenmodell: `lists`, `list_fields`, `list_views`, `list_items`, `list_item_values`
- [ ] Templates: `list_templates`, `list_template_fields`, `list_template_views`
- [ ] Feldtypen: Text, Zahl, Datum, Checkbox, Select, Person, Referenz, URL
- [ ] Ansichten: Checkliste + Tabelle (mit Filter & Sortierung)
- [ ] Inbox: System-Liste pro Person (auto-erstellt)
- [ ] Quick-Add: Inline + Global (→ Inbox)
- [ ] Sichtbarkeit: Hive / Admins / Gruppe / Privat
- [ ] Encryption: value encrypted, Feldnamen encrypted
- [ ] Regelbasierte Referenzierungen (lesend)
- [ ] RBAC: LISTS\_\* Permissions
- [ ] Vordefinierte System-Templates (Aufgabenliste, Einkaufsliste, Projekt, …)
- [ ] Eigene Templates erstellen
- [ ] UI: Listen-Seite, List-Detail, Element-Detail, Quick-Add

### Scope 2

- [ ] Kanban-Ansicht
- [ ] Wiederkehrende Elemente
- [ ] Cross-List-Automatisierungen (Einkauf abgehakt → Inventar)
- [ ] Drag & Drop zwischen Listen (Element verschieben)
- [ ] Listen als Dashboard-Widget

### Scope 3+

- [ ] Kalender-Ansicht für Listen
- [ ] Galerie-Ansicht
- [ ] API für externe Integrationen
- [ ] Offline-Sync (SQLite, wie in Phase 4 geplant)
- [ ] pgvector Semantic Search über Listenelemente

---

## 10. List Settings & UX Overhaul — Feature Roadmap

> Decided 2026-03-21. Inspired by Notion Databases. 19 features in 9 PRs.

### PR 1 — Quick Wins ✅ (merged)

> Branch: `fix/list-ux-polish` · No backend changes

| ID  | Feature                                        | Status |
| --- | ---------------------------------------------- | ------ |
| D1  | Larger delete icon touch targets (44px)        | ✅     |
| E1  | Locale-aware date formatting (i18n locale)     | ✅     |
| E4  | Cell text truncation (`max-w-50` + `truncate`) | ✅     |

### PR 2 — Field Context Menu (Foundation)

> Branch: `feat/field-context-menu`

| ID  | Feature                                                      | Effort |
| --- | ------------------------------------------------------------ | ------ |
| A1  | Field context menu (Rename, Delete, Hide, Duplicate, Type)   | Medium |
| A4  | Hide/show fields per view (`visibleFieldIds` in view config) | Small  |

A1 provides the UI shell into which all later field operations are hooked.

### PR 3 — Field Metadata (Icon + Description)

> Branch: `feat/field-metadata`

| ID  | Feature                           | Effort |
| --- | --------------------------------- | ------ |
| A5  | Field icons (emoji per column)    | Small  |
| A6  | Field description (hover tooltip) | Small  |

Backend: add `icon` and `description` to `ListField` (migration + encryption for `description`).

### PR 4 — Duplicate Actions

> Branch: `feat/list-duplicate-actions`

| ID  | Feature                                | Effort |
| --- | -------------------------------------- | ------ |
| A3  | Duplicate field (copy config)          | Small  |
| D3  | Duplicate item (copy all field values) | Small  |

### PR 5 — View Management

> Branch: `feat/view-management`

| ID  | Feature                                         | Effort |
| --- | ----------------------------------------------- | ------ |
| C1  | View tabs drag-to-reorder (persisted sortOrder) | Small  |
| C2  | Duplicate view                                  | Small  |
| C5  | Checklist: switchable checkbox field            | Small  |
| C6  | Kanban: switchable group-by field               | Small  |

### PR 6 — Visual Polish

> Branch: `feat/list-visual-polish`

| ID  | Feature                               | Effort |
| --- | ------------------------------------- | ------ |
| E5  | Colored select tags (Notion-style)    | Medium |
| E3  | Resizable column widths (drag handle) | Medium |

E5: `color` property per select option in `config.options[]` (JSONB, no migration).
E3: Drag on column border + `columnWidths` in view config (field already exists in schema).

### PR 7 — Undo Delete

> Branch: `feat/list-undo-delete`

| ID  | Feature                                  | Effort |
| --- | ---------------------------------------- | ------ |
| D5  | Undo item deletion (toast + soft-delete) | Medium |

Items get `deletedAt` timestamp instead of hard-delete. 5-second undo toast.
Cleanup job hard-deletes after expiry. Requires schema migration.

### PR 8 — Field Type Change (largest feature)

> Branch: `feat/field-type-change` · Depends on PR 2

| ID  | Feature                                          | Effort |
| --- | ------------------------------------------------ | ------ |
| A2  | Change field type with value conversion strategy | High   |

**Conversion matrix:**

| From → To       | Strategy                              |
| --------------- | ------------------------------------- |
| Text → Number   | Parse as number, else `null`          |
| Text → Date     | Parse as ISO date, else `null`        |
| Text → Checkbox | `"true"/"1"/"ja"` → true, else false  |
| Text → Select   | Value becomes first option            |
| Number → Text   | `String(value)`                       |
| Select → Text   | Option name becomes plaintext         |
| Checkbox → Text | `"true"/"false"`                      |
| Date → Text     | ISO string                            |
| Any → URL       | Keep string if valid URL, else `null` |
| Any → Person    | Not convertible → `null`              |

Non-convertible values → `null` + warning dialog ("3 of 12 values could not be converted").

### PR 9 — Filter & Sort UI

> Branch: `feat/list-filter-sort` · Backend schema already exists

| ID  | Feature                             | Effort |
| --- | ----------------------------------- | ------ |
| C3  | Filter UI (multi-condition builder) | High   |
| C4  | Sort UI (multi-level sort dropdown) | Medium |

### Dependencies

```
PR 2 (Field Context Menu) ──→ PR 4 (Duplicate Actions)
                           ──→ PR 8 (Field Type Change)
All others are independent / parallelizable.
```

### Decided against (for now)

| ID   | Feature                      | Reason                        |
| ---- | ---------------------------- | ----------------------------- |
| D2   | Item detail page (modal)     | Deferred to later phase       |
| D4   | Batch actions (multi-select) | Deferred to later phase       |
| E2   | Relative date display        | Nice-to-have, not prioritized |
| C7   | Gallery view                 | High effort, Phase 5 (Pages)  |
| C8   | Calendar view                | High effort, Phase 6          |
| F1–5 | Formulas, Rollups, etc.      | Power features, future phases |
