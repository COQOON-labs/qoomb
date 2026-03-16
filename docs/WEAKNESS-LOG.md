# Weakness Log

Kurzes Protokoll bekannter Schwachstellen, Regressions-Risiken und Code-Quality-Probleme.
Ziel: Bei jedem größeren Refactor / Feature explizit gegen diese Liste prüfen.

---

## Format

```
### [ID] Kurzname
- **Datei**: Pfad
- **Problem**: Ein Satz.
- **Zuletzt gesehen**: Datum
- **Status**: offen | behoben (Datum)
- **Fix**: Was wurde geändert / wie erkennst du eine Regression.
```

---

## Sicherheit

### [S-001] Log Injection in validateUUID

- **Datei**: `apps/api/src/prisma/prisma.service.ts`
- **Problem**: Unkontrollierter UUID-String direkt in `logger.error()` interpoliert — ermöglicht gefälschte Log-Zeilen via `\r\n`.
- **Zuletzt gesehen**: 2026-03-16
- **Status**: behoben (2026-03-16)
- **Fix**: `uuid.replace(/[\r\n]/g, '')` vor dem Logging eingebaut.

### [S-002] Fehlender JTI-Guard in validateToken

- **Datei**: `apps/api/src/modules/auth/auth.service.ts`
- **Problem**: Blacklist-Check wird übersprungen wenn `payload.jti` fehlt — Token ohne JTI bleibt bis `exp` gültig.
- **Zuletzt gesehen**: 2026-03-16
- **Status**: behoben (2026-03-16)
- **Fix**: `if (!payload.jti) throw UnauthorizedException` vor dem Blacklist-Check eingebaut. Unit-Test in `auth.service.test.ts` prüft diesen Pfad.

### [S-003] Cross-Hive Empfänger bei DirectMessage

- **Datei**: `apps/api/src/modules/messaging/messaging.router.ts`
- **Problem**: `recipientPersonId` wird nicht gegen `hiveId` validiert — ein Person-ID aus einem fremden Hive kann als Empfänger gesetzt werden.
- **Zuletzt gesehen**: 2026-03-16
- **Status**: behoben (2026-03-16)
- **Fix**: `prisma.person.findFirst({ where: { id: recipientPersonId, hiveId } })` vor dem Send eingebaut.

---

## Code-Qualität / Bugs

### [Q-001] Fehler-Swallowing in validateToken

- **Datei**: `apps/api/src/modules/auth/auth.service.ts`
- **Problem**: `catch (_error)` ohne Logging — DB-Ausfall ist von ungültigen Credentials nicht unterscheidbar.
- **Zuletzt gesehen**: 2026-03-16
- **Status**: behoben (2026-03-16)
- **Fix**: Unerwartete Fehler werden jetzt via `this.logger.error()` protokolliert; bekannte JWT-Fehler weiterhin still.

### [Q-002] process.env direkt statt getEnv()

- **Dateien**: `apps/api/src/prisma/prisma.service.ts`, `apps/api/src/modules/email/email-queue.service.ts`
- **Problem**: `process.env.DATABASE_URL` umgeht Zod-Startvalidierung — fehlt die Variable, folgt ein unhilfreicher Runtime-Fehler statt eines klaren Startup-Fehlers.
- **Zuletzt gesehen**: 2026-03-16
- **Status**: behoben (2026-03-16)
- **Fix**: `getEnv().DATABASE_URL` in beiden Dateien eingebaut.

### [Q-003] Hartcodierte Admin-Rollen in PersonsService

- **Datei**: `apps/api/src/modules/persons/persons.service.ts`
- **Problem**: `role: { in: ['parent', 'org_admin'] }` — neue Admin-Rollen würden Admins still nicht benachrichtigen.
- **Zuletzt gesehen**: 2026-03-16
- **Status**: behoben (2026-03-16)
- **Fix**: `isAdminRole()` aus `@qoomb/types` als Filter importiert und genutzt.

### [Q-004] isDefault-Toggle ohne Transaction in ListsService

- **Datei**: `apps/api/src/modules/lists/lists.service.ts`
- **Problem**: Zwei separate `updateMany` für `isDefault` in `updateView`/`createView` — Absturz zwischen den Calls hinterlässt keine Default-View.
- **Zuletzt gesehen**: 2026-03-16
- **Status**: behoben (2026-03-16)
- **Fix**: `createView` und `updateView` nutzen jetzt `$transaction` für atomare isDefault-Updates.

### [Q-005] Import-Reihenfolge in HiveSettingsPage

- **Datei**: `apps/web/src/pages/HiveSettingsPage.tsx`
- **Problem**: `const`/`type`-Deklarationen vor `import`-Statements — verletzt ESLint `import/first`, bricht "Organize Imports".
- **Zuletzt gesehen**: 2026-03-16 (eingeführt im selben Session-Commit)
- **Status**: behoben (2026-03-16)
- **Fix**: Alle `import`-Statements an den Anfang der Datei verschoben.

### [Q-006] Inkonsistente Encryption-Patterns (Dekorator vs. manuell)

- **Dateien**: `apps/api/src/modules/events/events.service.ts` (Dekorator), `apps/api/src/modules/lists/lists.service.ts` (manuell)
- **Problem**: Zwei verschiedene Patterns für dasselbe Problem — manuelles Vergessen eines Felds in ListsService hat kein Compile-Time-Safety-Netz.
- **Zuletzt gesehen**: 2026-03-16
- **Status**: behoben (2026-03-16)
- **Fix**: Erklärender Kommentar vor `_encryptName()` hinzugefügt, der die bewusste Abweichung begründet.

---

## Frontend / UX

### [F-001] Clickbare div-Cards ohne Keyboard-Support

- **Datei**: `apps/web/src/pages/GroupsPage.tsx`
- **Problem**: `<Card onClick={...}>` rendert als `<div>` — WCAG 2.1 SC 2.1.1 Verletzung, Tastatur-User können keine Gruppe auswählen.
- **Zuletzt gesehen**: 2026-03-16
- **Status**: behoben (2026-03-16)
- **Fix**: Clickbare Fläche als `<button>` (F-001) mit Delete-Button außerhalb (WCAG 2.1 SC 4.1.2 – keine geschachtelten Interaktiv-Elemente).

### [F-002] window.confirm für destruktive Aktionen

- **Dateien**: `apps/web/src/pages/MembersPage.tsx`, `apps/web/src/pages/GroupsPage.tsx`
- **Problem**: Native `window.confirm` — nicht stylebar, unzuverlässig für Screen Reader, verhindert saubere Tests.
- **Zuletzt gesehen**: 2026-03-16
- **Status**: behoben (2026-03-16)
- **Fix**: Neue `ConfirmDialog`-Komponente (`packages/ui/src/components/ConfirmDialog.tsx`) — nutzt natives `<dialog>` mit `showModal()`, ARIA-Attributen und Escape-Handler. MembersPage und GroupsPage migriert.

### [F-003] Hardcodiertes 'de-DE' Locale im Dashboard

- **Datei**: `apps/web/src/pages/DashboardPage.tsx`
- **Problem**: `toLocaleDateString('de-DE', ...)` ignoriert `user.locale` aus dem Auth-Context.
- **Zuletzt gesehen**: 2026-03-16
- **Status**: behoben (2026-03-16)
- **Fix**: `useLocale()` aus `LocaleProvider` importiert; `bcp47Locale` ersetzt den hardcodierten String.

### [F-004] getDisplayName O(n) pro Render in MessagingPage

- **Datei**: `apps/web/src/pages/MessagingPage.tsx`
- **Problem**: Linearer `members.find()`-Scan, neu deklariert jeden Render, aufgerufen für jede Message.
- **Zuletzt gesehen**: 2026-03-16
- **Status**: behoben (2026-03-16)
- **Fix**: `useMemo`-basierte `Map<id, displayName>` + `useCallback` für `getDisplayName` eingebaut.

---

## Tests

### [T-001] MembersPage.test.tsx crasht nach Invitation-Refactor

- **Datei**: `apps/web/src/pages/MembersPage.test.tsx`
- **Problem**: tRPC-Mock fehlt `listInvitations.useQuery`, `resendInvitation.useMutation`, `revokeInvitation.useMutation` — alle Tests crashen mit TypeError.
- **Zuletzt gesehen**: 2026-03-16 (Regression durch Invitation-UI-Erweiterung)
- **Status**: behoben (2026-03-16)
- **Fix**: Drei Mock-Einträge (`listInvitations`, `resendInvitation`, `revokeInvitation`) ergänzt.

### [T-002] Fehlende Coverage Auth-Modul

- **Datei**: `apps/api/src/modules/auth/`
- **Problem**: `register`, `login`, `validateToken`, `resetPassword`, `PassKeyService`, `RefreshTokenService` vollständig ungetestet.
- **Zuletzt gesehen**: 2026-03-16
- **Status**: behoben (2026-03-16)
- **Fix**: `apps/api/src/modules/auth/auth.service.test.ts` mit 17 Tests für `validateToken`, `login`, `logout`, `logoutAll` erstellt.

### [T-003] Zero Tests für Events, Persons, Notifications, Messaging, Lists

- **Dateien**: Alle Service-Dateien der genannten Module
- **Problem**: Kein einziger Test für diese Module — Regressions bei Refactors sind nicht erkennbar.
- **Zuletzt gesehen**: 2026-03-16
- **Status**: offen
- **Fix**: Progressiv je Modul: CRUD happy paths zuerst, dann Edge Cases.

---

## CodeQL-Warnings

### [C-001] js/trivial-conditional in GroupsPage.test.tsx und MembersPage.test.tsx

- **Datei**: `apps/web/src/pages/GroupsPage.test.tsx`, `apps/web/src/pages/MembersPage.test.tsx`
- **Problem**: `btn.textContent?.trim()` — `textContent` ist `string | null`, nicht `undefined`; `?.` ist überflüssig.
- **Zuletzt gesehen**: 2026-03-16
- **Status**: behoben (2026-03-16)
- **Fix**: `(btn.textContent ?? '').trim()` — `?.` entfernt.

### [C-002] js/unused-local-variable in reencrypt.test.ts

- **Datei**: `apps/api/prisma/scripts/reencrypt.test.ts`
- **Problem**: `const v2cipher = simpleEnc(2)('hello')` — Variable wird nie genutzt.
- **Zuletzt gesehen**: 2026-03-16
- **Status**: behoben (2026-03-16)
- **Fix**: Ungenutzte Variable entfernt.

### [C-003] Assertion-in-catch Anti-Pattern in reencrypt.test.ts

- **Datei**: `apps/api/prisma/scripts/reencrypt.test.ts`
- **Problem**: `expect()` im `catch`-Block nach vorherigem `expect().toThrow()` — wird nicht ausgeführt wenn Funktion aufhört zu werfen (vacuous pass).
- **Zuletzt gesehen**: 2026-03-16
- **Status**: behoben (2026-03-16)
- **Fix**: `thrownMessage`-Variable-Pattern eingebaut — innerer `catch` re-throws, äußeres `expect().toThrow()` fängt ihn, Assertion läuft danach garantiert.

---

_Letzte Aktualisierung: 2026-03-16 — alle 18 Einträge behoben_
