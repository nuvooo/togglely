# MCP-Server für KI-Agenten

**Status:** abgestimmt am 2026-11-09 · **Scope:** Backend + Frontend (API-Keys-Seite)

## Ziel

Entwickler arbeiten in Claude Code (oder einem anderen MCP-fähigen Agenten). Wird ein Feature geplant, legt die KI das passende Feature-Flag direkt in Togglely an und schreibt den Code gleich mit dem Flag-Check – ohne Wechsel ins Dashboard. Während der Entwicklung darf die KI das Flag in freigegebenen Environments (typisch `development`) selbst schalten. Ist das Feature ausgerollt, räumt die KI auf: Flag-Checks im Code entfernen (passiert im Editor) und Flag in Togglely löschen.

Dafür stellt das Togglely-Backend einen MCP-Endpoint `/api/mcp` bereit, den Claude Code per URL + Schlüssel anbindet.

## Nicht-Ziele

- Targeting-Regeln, Experimente, Webhooks, Brands-Verwaltung, Nutzer-/Organisationsverwaltung über MCP.
- Ein separates npm-Paket / lokaler MCP-Prozess.
- Ein „Archiviert"-Status für Flags (es bleibt beim Löschen + Audit-Log).

## Anti-Ziele (wäre ein Fehlschlag, auch wenn es technisch läuft)

- Die KI kann `staging`/`production` schalten, weil die Einschränkung nur als Prompt-Hinweis existiert. Die Sperre **muss** serverseitig greifen.
- Ein MCP-Schlüssel kann mehr als sein Ersteller (Rollen-Eskalation) oder wirkt über sein Projekt hinaus. Einzige bewusste Ausnahme: `delete_flag` ab MEMBER, nur bei überall gleichem Zustand.
- MCP-Änderungen umgehen Audit-Log, Change-Events (SSE/Webhooks) oder Validierung, weil sie an den Services vorbei in Prisma schreiben.

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Ort | NestJS-Modul `mcp` im Backend, Endpoint `/api/mcp` |
| Transport | Streamable HTTP über `@modelcontextprotocol/sdk`, **stateless** (kein Session-Store; jede Anfrage authentifiziert sich selbst) |
| Zugang | neuer API-Key-Typ `MCP`, Bearer-Header |
| Geltungsbereich | **ein Schlüssel = ein Projekt** |
| Schalt-Rechte | pro Schlüssel festgelegte Liste erlaubter Environments (`allowedEnvironmentIds`) |
| Lesen | alle Environments des Projekts (Status ist lesbar, nur Schalten ist eingeschränkt) |
| Löschen | echtes Löschen über `FlagsService.delete`, mit Audit-Log – **nur wenn das Flag in allen Environments (inkl. Brand-Überschreibungen) denselben Zustand hat** |
| Wer erstellt Keys | **jedes MEMBER** erstellt sich seinen eigenen MCP-Key; ADMIN/OWNER sehen und widerrufen alle |
| Rechte | Key hängt am erstellenden User; Wirkung = dessen aktuelle Org-Rolle, **mit einer Ausnahme:** `delete_flag` ist für MCP-Keys ab MEMBER erlaubt (abgesichert durch die Gleich-Zustand-Regel) |
| Brands | Schalten nur auf den Environment-Default (`brandId: null`); Status-Ausgaben und Lösch-Prüfung **zeigen und berücksichtigen** Brand-Überschreibungen |

## Backend

### Schema (`prisma/schema.prisma`)

- `enum ApiKeyType` um `MCP` erweitern.
- `ApiKey` erhält optionale Felder:
  - `projectId String? @db.ObjectId` – Pflicht bei `MCP`, sonst `null`.
  - `allowedEnvironmentIds String[] @db.ObjectId` – nur bei `MCP` genutzt; darf leer sein (= nur lesen/anlegen/löschen, kein Schalten).
  - `keyHash String?` mit **nicht-unique** `@@index([keyHash])` – siehe Speicherung. (Ein `@unique` würde auf MongoDB an den bestehenden Keys ohne Hash scheitern; 64-hex-Zufall macht Kollisionen praktisch unmöglich.)
- Bestehende Keys bleiben unverändert (kein Migrationsbedarf; MongoDB/`prisma db push`).

### Speicherung des Schlüssels

Bestehende SDK-Keys liegen im Klartext in `key` und werden ADMINs wieder angezeigt. MCP-Keys haben Schreibrechte, daher **(eigene Entscheidung)**:
- Format `tkm_<64 hex>` (Präfix unterscheidbar von `tk_`).
- Gespeichert wird nur `keyHash = sha256(key)`; im Feld `key` steht die maskierte Form (`tkm_abc…wxyz`), damit Listen/`maskApiKey` unverändert funktionieren.
- Klartext wird **genau einmal** in der Create-Antwort zurückgegeben.
- SDK-Endpunkte dürfen `MCP`-Keys **nicht** akzeptieren (Key-Lookup in `sdk.service.ts` filtert heute nicht nach Typ → `type: { not: 'MCP' }` ergänzen); der MCP-Endpoint akzeptiert **nur** `MCP`-Keys.

### Anlage (`ApiKeysService.create` / DTO)

- `type: 'MCP'` zu `allowedKeyTypes` hinzufügen.
- Bei `MCP` zusätzlich Pflichtfeld `projectId`, optional `allowedEnvironmentIds: string[]`.
- Prüfungen: Erstellen eines MCP-Keys erfordert mindestens `MEMBER` (heute verlangt `ApiKeysController` ADMIN für alle Typen → für `MCP` lockern, für die anderen Typen unverändert). Ein MEMBER sieht in der Liste nur seine eigenen MCP-Keys (maskiert) und darf nur diese löschen; ADMIN/OWNER sehen und löschen alle. Projekt gehört zur Organisation (`assertProjectAccess`); jede Environment-ID gehört zum Projekt (`assertEnvironmentInProject`).
- `expiresInDays` wie bisher optional.
- Audit-Eintrag `apiKey.created` (falls für andere Keys schon vorhanden, gleiches Muster).

### Authentifizierung (`McpAuthGuard`)

1. `Authorization: Bearer tkm_…` lesen, `sha256` bilden, `ApiKey` per `keyHash` suchen.
2. Ablehnen (401) wenn: nicht gefunden, `type !== MCP`, `isActive === false`, `expiresAt` überschritten, kein `userId`/`projectId`.
3. Ersteller laden: muss aktiv sein und weiterhin Mitglied der Organisation; seine **aktuelle** Rolle wird für Schreibrechte verwendet (`VIEWER` → nur lesende Tools; Schreib-Tools liefern einen Tool-Fehler).
4. `lastUsedAt` aktualisieren (gedrosselt, z. B. höchstens einmal pro Minute).
5. Request-Kontext `{ apiKeyId, userId, organizationId, projectId, allowedEnvironmentIds, role }`.

Throttling: eigenes Limit für `/api/mcp` über `@nestjs/throttler` (z. B. 120 Anfragen/min pro Schlüssel).

### MCP-Tools

Alle Tools arbeiten im Projekt des Schlüssels; Flags werden per **`key`** (nicht ObjectId) adressiert, Environments per **`key`** – so kann die KI mit den Namen aus dem Code arbeiten. Jedes Tool ruft die bestehenden Services auf (`FlagsService`, `EnvironmentsService`, `ProjectsService`), damit Validierung, Audit-Log (`userId` = Ersteller des Schlüssels) und Change-Events identisch zum Dashboard laufen.

| Tool | Eingabe | Wirkung |
|---|---|---|
| `get_project` | – | Projekt (Name, Typ), Environments (key, name, `canToggle`), Brands (nur lesend, falls vorhanden) |
| `list_flags` | `search?` | Flags des Projekts: key, name, description, type, Status je Environment (+ Hinweis, falls Brand-Überschreibungen abweichen) |
| `get_flag` | `flagKey` | Details inkl. Status/Wert je Environment und je Brand-Überschreibung |
| `create_flag` | `key`, `name`, `description?`, `type` (`BOOLEAN`/`STRING`/…, wie `FlagType`), `defaultValue?` | Legt Flag an (`FlagsService.create`), initial in allen Environments aus |
| `update_flag` | `flagKey`, `name?`, `description?` | Metadaten ändern |
| `set_flag_state` | `flagKey`, `environmentKey`, `enabled?`, `value?` | Schalten/Wert setzen über `toggle`/`updateValue` (Environment-Default, `brandId: null`); **nur** wenn Environment in `allowedEnvironmentIds`, sonst Tool-Fehler mit klarer Meldung |
| `delete_flag` | `flagKey`, `confirm: boolean` | Ohne `confirm: true`: gibt den Zustand je Environment (inkl. Brand-Überschreibungen) zurück und ob Löschen erlaubt wäre; löscht nicht. Mit `confirm: true`: **serverseitige Prüfung** – haben alle `FlagEnvironment`-Zeilen des Flags (alle Environments, alle Brands) denselben `enabled`-Zustand und denselben `defaultValue`? Nein → Tool-Fehler mit Liste der abweichenden Environments/Brands. Ja → `FlagsService.delete`. Rolle: ab MEMBER (MCP-Ausnahme, siehe Entscheidungen) |

Hinweis: Ein `list_projects` entfällt, da der Schlüssel genau ein Projekt hat.

Tool-Beschreibungen (für die KI) erklären kurz den Workflow: vor `create_flag` mit `list_flags` auf Dubletten prüfen; Flag-Keys in kebab-case; beim Aufräumen zuerst den Code bereinigen, dann `delete_flag`.

**Wichtig:** Rollenprüfungen (z. B. MEMBER zum Anlegen/Schalten, ADMIN zum Löschen) und Eingabe-Validierung (class-validator-DTOs: Key-Länge, Wert-Limits) liegen heute in den Controllern bzw. im `AccessService`, nicht in `FlagsService`. Die MCP-Schicht muss beides selbst ausführen – dieselben DTO-Klassen validieren und dieselben Rollen-Schwellen wie die entsprechenden Controller-Routen anwenden.

Fehler aus Services (`NotFoundException`, `ForbiddenException`, Validierung, Prisma-Unique-Konflikt bei doppeltem Key) werden als MCP-Tool-Fehler (`isError: true`) mit lesbarer Meldung zurückgegeben, nicht als HTTP 500.

### Audit-Log

`AuditLog` erhält **(eigene Entscheidung)** ein optionales Feld `apiKeyId String? @db.ObjectId`. Die MCP-Tools geben es an die Services weiter (Services bekommen dafür einen optionalen Akteur-Kontext statt nur `userId`). Das Audit-Log im Dashboard zeigt bei solchen Einträgen „via MCP-Schlüssel <Name>“. Falls das Durchreichen in alle betroffenen Services zu invasiv ist, darf der Builder alternativ den Eintrag mit `userAgent = "togglely-mcp/<keyName>"` markieren – Hauptsache, MCP-Änderungen sind im Log erkennbar.

## Frontend (`pages/orgs/api-keys/`)

- `CreateApiKeyDialog`: Typ „KI-Agent (MCP)“ ergänzen. Bei Auswahl: Projekt wählen (Pflicht), dann Mehrfachauswahl der Environments „Darf schalten in“ (Default: Environment mit Key `development`, falls vorhanden; sonst keins vorausgewählt).
- `ApiKeyCreatedDialog`: Bei MCP-Keys zusätzlich den fertigen Befehl zum Kopieren:
  `claude mcp add --transport http togglely <API_BASE>/api/mcp --header "Authorization: Bearer tkm_…"`
  plus Hinweis „Wird nur einmal angezeigt“. `<API_BASE>` muss absolut sein (API-Base ist ggf. relativ `/api` → mit `window.location.origin` auflösen).
- `ApiKeysPage`: MCP-Keys mit Projekt-Name und erlaubten Environments anzeigen.
- i18n (de/en) für alle neuen Texte.

## Doku

- `docs/API.md` bzw. neuer Abschnitt „KI-Agenten anbinden (MCP)“: Key anlegen, Befehl, Tool-Liste, Sicherheitsmodell.
- `CHANGELOG.md`.

## Tests

- `McpAuthGuard`: falscher Typ, abgelaufen, inaktiv, Ersteller entfernt/deaktiviert, VIEWER-Rolle.
- `set_flag_state`: erlaubtes vs. nicht erlaubtes Environment; Environment aus fremdem Projekt.
- `delete_flag`: ohne/mit `confirm`; gemischter Zustand (auch nur über eine Brand-Überschreibung) → abgelehnt; überall gleich → gelöscht; MEMBER-Key darf löschen.
- API-Keys: MEMBER erstellt MCP-Key (ok), MEMBER erstellt SDK-Key (weiterhin 403), MEMBER sieht/löscht nur eigene MCP-Keys.
- Projekt-Isolation: Flag-Key aus anderem Projekt nicht auffindbar.
- SDK-Endpunkte lehnen `MCP`-Keys ab.
- Ein E2E-Smoke über den echten Endpoint mit dem MCP-SDK-Client (`initialize` → `tools/list` → `create_flag` → `set_flag_state`).
- Frontend: Create-Dialog für MCP (Projekt Pflicht, Environment-Auswahl, Befehl wird angezeigt).

## Dem Builder überlassen

- Genaue Ordnerstruktur des `mcp`-Moduls, Zod-Schemas der Tools, Formulierung der Tool-Beschreibungen.
- Wie der Akteur-Kontext in die Services gelangt (Parameter vs. kleines Kontext-Objekt), solange keine `import type` im Backend verwendet werden (bricht NestJS DI).
- Throttle-Werte im Rahmen des Vorschlags.
