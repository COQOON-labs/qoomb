# Regression Patterns

Patterns that have caused real bugs or security issues in this codebase.

**Purpose:** Before every significant feature, refactor, or code review — scan explicitly for
these patterns so they don't silently re-emerge. Each entry answers: _what went wrong_, _where
to look_, and _what a regression looks like_.

Patterns enforced automatically by the linter or type-checker are intentionally excluded — they
don't need manual scanning.

---

## Format

```
### [ID] Kurzname
- **Wo suchen**: Welche Dateien / Code-Stellen sind betroffen.
- **Anti-Pattern**: Wie sieht der falsche Code aus.
- **Erstmals gesehen**: Datum + Datei
- **Status**: behoben (Datum) | offen
- **Regression-Signal**: Konkret womit / wie man eine Regression erkennt.
```

---

## Sicherheit

### [S-001] Log Injection mit User-Input

- **Wo suchen**: Jede `logger.*`- oder `console.*`-Zeile die Request-Daten interpoliert (`request.url`, Header, Query-Parameter, IDs aus User-Input).
- **Anti-Pattern**: ``logger.error(`... ${userControlledValue}`)`` ohne vorheriges Sanitizing.
- **Erstmals gesehen**: 2026-03-16 — `apps/api/src/prisma/prisma.service.ts`
- **Status**: behoben (2026-03-16)
- **Regression-Signal**: Suche nach `logger\.(error|warn|log|debug).*\$\{` — jeden Treffer prüfen ob der interpolierte Wert User-kontrolliert ist und `\r\n` bereits entfernt wurde.

### [S-002] Fehlender JTI-Guard vor Blacklist-Check

- **Wo suchen**: Jede Änderung an `validateToken` oder jeder neue Token-Validierungs-Pfad.
- **Anti-Pattern**: Blacklist-Check wird ausgeführt bevor geprüft wird ob `payload.jti` überhaupt vorhanden ist — Token ohne JTI bleibt bis `exp` gültig.
- **Erstmals gesehen**: 2026-03-16 — `apps/api/src/modules/auth/auth.service.ts`
- **Status**: behoben (2026-03-16)
- **Automatisiert**: ✅ Unit-Test `"should reject token without jti"` in `auth.service.test.ts` — schlägt bei jedem `pnpm test` an.
- **Regression-Signal**: Unit-Test `"should reject token without jti"` in `auth.service.test.ts` schlägt an. Zusätzlich: jede neue `jwt.verify()`-Aufrufstelle prüfen ob JTI-Presence-Check vorhanden ist.

### [S-003] Cross-Hive Empfänger nicht validiert

- **Wo suchen**: Jedes neue Feature bei dem eine Person-ID vom Client als Ziel angegeben wird (Nachrichten, Einladungen, Shares, Benachrichtigungen).
- **Anti-Pattern**: `recipientPersonId` direkt verwenden ohne zu prüfen ob die Person überhaupt im gleichen Hive ist.
- **Erstmals gesehen**: 2026-03-16 — `apps/api/src/modules/messaging/messaging.router.ts`
- **Status**: behoben (2026-03-16)
- **Regression-Signal**: Überall wo eine Person-ID als Input entgegengenommen wird: `prisma.person.findFirst({ where: { id, hiveId } })` muss vorhanden sein bevor die ID genutzt wird.

---

## Code-Qualität / Bugs

### [Q-001] Fehler-Swallowing in catch-Blöcken

- **Wo suchen**: Jeder neue `catch`-Block in API-Services, besonders in Auth- und Auth-nahen Flows.
- **Anti-Pattern**: `catch (_error) { /* nichts */ }` — DB-Ausfall und ungültige Credentials sind nach außen identisch.
- **Erstmals gesehen**: 2026-03-16 — `apps/api/src/modules/auth/auth.service.ts`
- **Status**: behoben (2026-03-16)
- **Regression-Signal**: Suche nach `catch.*\b_\w*\b` (underscore-prefixed catch variable ohne Logging) — bekannte Fehlertypen können stil bleiben, alles andere loggen.

### [Q-002] process.env direkt statt getEnv()

- **Wo suchen**: Jedes neue NestJS-Modul, jede neue Service-Datei die Konfigurationswerte liest.
- **Anti-Pattern**: `process.env.SOME_VAR` in Application-Code — umgeht die Zod-Startvalidierung.
- **Erstmals gesehen**: 2026-03-16 — `prisma.service.ts`, `email-queue.service.ts`
- **Status**: behoben (2026-03-16)
- **Automatisiert**: ✅ ESLint `no-restricted-syntax` in `apps/api/eslint.config.js` — blockiert bei pre-push und CI.
- **Regression-Signal**: ESLint-Fehler `Use getEnv() from src/config/env.validation.ts instead of process.env directly.`

### [Q-003] Hartcodierte Admin-Rollen-Arrays

- **Wo suchen**: Jede neue DB-Query oder Guard-Logik die auf Admin-Rollen filtert.
- **Anti-Pattern**: `role: { in: ['parent', 'org_admin'] }` — neue Admin-Rollen würden still übergangen.
- **Erstmals gesehen**: 2026-03-16 — `apps/api/src/modules/persons/persons.service.ts`
- **Status**: behoben (2026-03-16)
- **Automatisiert**: ✅ CI-Step `Check for hardcoded admin-role literals (Q-003)` in `.github/workflows/ci.yml` (quality-Job) — grep auf `'parent'`/`'org_admin'` in `apps/api/src/modules/`, Test-Dateien und permissions-Dateien ausgenommen.
- **Regression-Signal**: CI-Step schlägt an mit `❌ Hardcoded admin-role literals found in module code.`

### [Q-004] Mehrstufige DB-Updates ohne Transaction

- **Wo suchen**: Jede Logik die zwei oder mehr `update`/`updateMany` in Folge ausführt um einen konsistenten Zustand herzustellen (z.B. Default-Flags, Zähler, Status-Toggles).
- **Anti-Pattern**: Zwei separate `updateMany` — Absturz zwischen den Calls hinterlässt inkonsistenten State.
- **Erstmals gesehen**: 2026-03-16 — `apps/api/src/modules/lists/lists.service.ts` (`createView`/`updateView`)
- **Status**: behoben (2026-03-16)
- **Regression-Signal**: Suche nach zwei aufeinanderfolgenden `await prisma.*.update` ohne umschließendes `$transaction`.

### [Q-006] Manuelle Encryption neben Dekorator-Encryption ohne Erklärung

- **Wo suchen**: Jedes neue verschlüsselte Feld in Modulen die bisher `@EncryptFields`/`@DecryptFields` nicht nutzen (z.B. Lists mit `_encryptName()`).
- **Anti-Pattern**: Manueller Encryption-Aufruf ohne Kommentar — unklar ob Absicht oder vergessener Dekorator.
- **Erstmals gesehen**: 2026-03-16 — `apps/api/src/modules/lists/lists.service.ts`
- **Status**: behoben (2026-03-16)
- **Regression-Signal**: Jede neue manuelle `encryptionService.encrypt()`-Aufrufstelle braucht einen Kommentar der erklärt warum der Dekorator nicht ausreicht.

---

## Frontend / UX

### [F-001] Klickbare Flächen ohne Keyboard-Support

- **Wo suchen**: Jede neue Card-, List-Item- oder Zeilen-Komponente die via Click navigiert oder eine Aktion auslöst.
- **Anti-Pattern**: `<div onClick={...}>` oder `<Card onClick={...}>` ohne `role` und `tabIndex` — Screen Reader und Tastatur-User können die Aktion nicht auslösen.
- **Erstmals gesehen**: 2026-03-16 — `apps/web/src/pages/GroupsPage.tsx`
- **Status**: behoben (2026-03-16)
- **Regression-Signal**: Axe-Tests schlagen mit `interactive-supports-focus` / `click-events-have-key-events` an. Manuell: Tab durch die neue UI führen — jede klickbare Fläche muss fokussierbar und per Enter auslösbar sein.

### [F-002] window.confirm für destruktive Aktionen

- **Wo suchen**: Jede neue destruktive Aktion (Löschen, Entfernen, Archivieren) in der Web-Oberfläche.
- **Anti-Pattern**: `if (window.confirm('...'))` — nicht stylebar, unzuverlässig für Screen Reader.
- **Erstmals gesehen**: 2026-03-16 — `MembersPage.tsx`, `GroupsPage.tsx`
- **Status**: behoben (2026-03-16)
- **Automatisiert**: ✅ ESLint `no-restricted-globals` in `packages/eslint-config/react.js` — blockiert bei pre-push und CI.
- **Regression-Signal**: ESLint-Fehler `Use <ConfirmDialog> from @qoomb/ui instead of window.confirm().`

### [F-003] Hartcodiertes Locale in Datums-/Zahlenformatierung

- **Wo suchen**: Jede neue `toLocaleDateString`-, `toLocaleTimeString`- oder `Intl.*`-Aufrufstelle im Frontend.
- **Anti-Pattern**: `toLocaleDateString('de-DE', ...)` — ignoriert `user.locale` aus dem Auth-Context.
- **Erstmals gesehen**: 2026-03-16 — `apps/web/src/pages/DashboardPage.tsx`
- **Status**: behoben (2026-03-16)
- **Automatisiert**: ✅ ESLint `no-restricted-syntax` in `packages/eslint-config/react.js` — blockiert Literal-String als erstes Argument in `toLocaleDateString`/`toLocaleTimeString`/`toLocaleString` bei pre-push und CI.
- **Regression-Signal**: ESLint-Fehler `Don't hardcode a locale string. Use bcp47Locale from useLocale() instead.`

### [F-004] Unbememoriertes Members-Lookup per Render

- **Wo suchen**: Jede neue Komponente die eine Liste von Entities laden und dann per ID für jeden Eintrag in einer zweiten Liste nachschlagen muss.
- **Anti-Pattern**: `members.find(m => m.id === msg.senderId)` direkt im JSX oder in einer ungememoizierten Funktion — O(n) pro Render, steigt quadratisch mit Listenlänge.
- **Erstmals gesehen**: 2026-03-16 — `apps/web/src/pages/MessagingPage.tsx`
- **Status**: behoben (2026-03-16)
- **Regression-Signal**: Suche nach `.find(` innerhalb von JSX oder Render-Funktionen die auf Props-Arrays operieren — `useMemo`-basierte `Map` ist das korrekte Pattern.

---

## Tests

### [T-001] tRPC-Mock veraltet nach Router-Erweiterung

- **Wo suchen**: Jedes Mal wenn ein tRPC-Router um neue Procedures erweitert wird — alle zugehörigen Test-Dateien prüfen.
- **Anti-Pattern**: Neue Procedure im Router, aber der `vi.mock('../../lib/trpc/client')`-Block in den Tests wird nicht aktualisiert — alle Tests crashen mit TypeError.
- **Erstmals gesehen**: 2026-03-16 — `MembersPage.test.tsx` nach Invitation-UI-Erweiterung
- **Status**: behoben (2026-03-16)
- **Regression-Signal**: Tests crashen mit `TypeError: trpc.*.useQuery is not a function`. Vorbeugen: Nach jeder Router-Änderung `grep -r "trpc\.<routerName>" apps/web/src` ausführen und alle Treffer in Test-Dateien auf Vollständigkeit prüfen.

### [T-002] Kein Coverage-Entry für neue Auth-Service-Methoden

- **Wo suchen**: Jede neue public Methode in `auth.service.ts` oder neue Auth-Flows.
- **Anti-Pattern**: Neue Methode in `AuthService` ohne begleitenden Test in `auth.service.test.ts` und ohne Eintrag in `collectCoverageFrom` in `jest.config.js`.
- **Erstmals gesehen**: 2026-03-16 — gesamtes Auth-Modul ungetestet
- **Status**: behoben (2026-03-16) — 17 Tests für `validateToken`, `login`, `logout`, `logoutAll`
- **Regression-Signal**: `jest --coverage` zeigt `auth.service.ts` unter dem 80%-Threshold.

### [T-003] Zero Tests für neue Backend-Module

- **Wo suchen**: Jedes neue Modul in `apps/api/src/modules/` das in den letzten 30 Tagen erstellt wurde.
- **Anti-Pattern**: Vollständiges Modul (Service + Router) ohne eine einzige Test-Datei.
- **Erstmals gesehen**: 2026-03-16 — Events, Persons, Notifications, Messaging, Lists ungetestet
- **Status**: offen — progressiv je Modul: CRUD happy paths zuerst, dann Edge Cases
- **Automatisiert**: ✅ CI-Step `Check for service files without tests (T-003)` in `.github/workflows/ci.yml` (quality-Job) — findet jede _neue_ `*.service.ts` ohne gleichnamige `*.service.test.ts`. Die 14 bereits existierenden Services ohne Tests stehen in einer Allowlist im CI-Step; die Allowlist schrumpft mit jedem neu geschriebenen Test.
- **Regression-Signal**: CI-Step schlägt an mit `❌ New service files without companion test files:`. Allowlist in `ci.yml` darf **nicht erweitert** werden — stattdessen Test schreiben.

---

_Erstellt: 2026-03-16 | Letzte Aktualisierung: 2026-03-16_
