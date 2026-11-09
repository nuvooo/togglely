# MCP-Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Togglely-Backend stellt unter `/api/mcp` einen MCP-Server bereit, über den ein KI-Agent mit einem projektgebundenen `MCP`-API-Key Flags lesen, anlegen, ändern, in freigegebenen Environments schalten und (bei überall gleichem Zustand) löschen kann.

**Architecture:** Neues NestJS-Modul `backend/src/modules/mcp` mit stateless Streamable-HTTP-Transport (`@modelcontextprotocol/sdk`, pro Request ein `McpServer` + Transport). Ein `McpKeyResolver` authentifiziert `tkm_…`-Bearer-Keys per SHA-256-Hash. `McpToolsService` implementiert die Tools über die bestehenden Services (`FlagsService`, Prisma-Reads) und wiederholt die Rollen- und DTO-Prüfungen der Controller. Der Akteur (API-Key) gelangt über `AsyncLocalStorage` ins Audit-Log, ohne Service-Signaturen zu ändern.

**Tech Stack:** NestJS 11, Prisma 5 (MongoDB), `@modelcontextprotocol/sdk@1.32.x`, `zod`, Jest; React 19, Vitest, i18next.

**Spec:** `docs/superpowers/specs/2026-11-09-mcp-server-design.md`

## Global Constraints

- Backend: **kein `import type`** (bricht NestJS DI); Biome `useImportType: "off"` bleibt.
- Commits: Conventional Commits `feat(scope):` / `fix(scope):` / `test(scope):` / `docs(scope):`, jede Commit-Message endet mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`.
- MCP-Key-Format `tkm_` + 64 hex (32 Zufallsbytes); gespeichert nur `keyHash = sha256(key)` (hex); Feld `key` enthält die maskierte Form (`maskApiKey`).
- Ein MCP-Key = genau ein Projekt; `allowedEnvironmentIds` bestimmt, wo geschaltet werden darf (leer erlaubt).
- Schreiben wirkt mit der **aktuellen** Org-Rolle des Key-Erstellers; Ausnahme: `delete_flag` ab MEMBER, nur bei überall gleichem Zustand.
- SDK-Endpunkte akzeptieren keine `MCP`-Keys; `/api/mcp` akzeptiert nur `MCP`-Keys.
- Alle neuen UI-Texte in `frontend/src/i18n/locales/de.ts` **und** `en.ts`.
- Verifikation pro Task: `cd backend && npm run build && npm test` bzw. `cd frontend && npm run build && npm test`; vor dem Abschluss zusätzlich `npm run biome:check` im Root.

## Review Focus

1. **Gelöschter oder herabgestufter Key-Ersteller:** Key eines Users, der aus der Org entfernt oder deaktiviert wurde, muss sofort 401 liefern, nicht erst nach Ablauf. → Test in Task 3.
2. **Flag-/Environment-Key aus fremdem Projekt** (gleicher Key existiert in anderem Projekt derselben Org): Tools dürfen nur im Key-Projekt auflösen. → Test in Task 4.
3. **Brand-Überschreibung als einziger Unterschied** (alle Environment-Defaults an, eine Brand-Zeile in `production` aus): `delete_flag` muss ablehnen. → Test in Task 4.
4. **Environment ohne `FlagEnvironment`-Zeile** (nach dem Flag angelegtes Environment): zählt beim Lösch-Check als „aus / Default-Wert“, nicht als „egal“. → Test in Task 4.
5. **Ungültige Tool-Eingaben** (zu langer Key, Wert über `FLAG_VALUE_MAX_LENGTH`, unbekannter Typ): kommen als Tool-Fehler (`isError: true`) zurück, nie als HTTP 500 und nie ungeprüft in die DB. → Test in Task 4.

---

### Task 1: Schema, Akteur-Kontext und Audit-Felder

**Files:**
- Modify: `backend/prisma/schema.prisma` (`enum ApiKeyType`, `model ApiKey`, `model AuditLog`)
- Create: `backend/src/shared/actor-context.ts`
- Create: `backend/src/shared/actor-context.spec.ts`
- Modify: `backend/src/modules/audit-logs/audit-logs.service.ts` (`create`)
- Modify: `backend/src/modules/audit-logs/audit-logs.service.spec.ts`

**Interfaces:**
- Produces:
  - Prisma: `ApiKeyType.MCP`; `ApiKey.projectId String? @db.ObjectId`, `ApiKey.allowedEnvironmentIds String[] @db.ObjectId`, `ApiKey.keyHash String?` + `@@index([keyHash])`; `AuditLog.apiKeyId String? @db.ObjectId`, `AuditLog.apiKeyName String?` (Name denormalisiert, damit der Log-Eintrag nach Key-Löschung lesbar bleibt – eigene Entscheidung).
  - `interface ActorContext { apiKeyId: string; apiKeyName: string }`
  - `runWithActor<T>(actor: ActorContext, fn: () => Promise<T>): Promise<T>`
  - `currentActor(): ActorContext | undefined`

- [ ] **Step 1: Schema erweitern** wie oben; keine `@unique` auf `keyHash`. `cd backend && npx prisma generate` → läuft ohne Fehler.
- [ ] **Step 2: Failing tests schreiben**

```ts
// actor-context.spec.ts
it('exposes the actor inside runWithActor and nothing outside', async () => {
  expect(currentActor()).toBeUndefined()
  const seen = await runWithActor({ apiKeyId: 'k1', apiKeyName: 'Claude' }, async () => {
    await Promise.resolve()
    return currentActor()
  })
  expect(seen).toEqual({ apiKeyId: 'k1', apiKeyName: 'Claude' })
  expect(currentActor()).toBeUndefined()
})

// audit-logs.service.spec.ts
it('stores apiKeyId/apiKeyName when called inside an actor context', async () => {
  await runWithActor({ apiKeyId: 'k1', apiKeyName: 'Claude' }, () => service.create(entry))
  expect(prisma.auditLog.create.mock.calls[0][0].data).toMatchObject({ apiKeyId: 'k1', apiKeyName: 'Claude' })
})
it('stores no api key fields outside an actor context', async () => {
  await service.create(entry)
  expect(prisma.auditLog.create.mock.calls[0][0].data.apiKeyId).toBeUndefined()
})
```

- [ ] **Step 3: Tests laufen lassen** – `cd backend && npx jest src/shared/actor-context src/modules/audit-logs/audit-logs.service` → FAIL.
- [ ] **Step 4: Implementieren** – `actor-context.ts` mit `AsyncLocalStorage` aus `node:async_hooks`; `AuditLogsService.create` liest `currentActor()` und setzt beide Felder nur, wenn vorhanden.
- [ ] **Step 5: Tests grün** – gleicher Befehl → PASS; danach `npm run build && npm test` → PASS.
- [ ] **Step 6: Commit** – `feat(audit): record acting API key via async actor context`

---

### Task 2: MCP-Keys anlegen, auflisten, löschen; SDK sperrt MCP-Keys

**Files:**
- Modify: `backend/src/modules/api-keys/dto/create-api-key.dto.ts`
- Modify: `backend/src/modules/api-keys/api-keys.service.ts`
- Modify: `backend/src/modules/api-keys/api-keys.controller.ts`
- Modify: `backend/src/modules/sdk/sdk.service.ts:82-96`
- Test: `backend/src/modules/api-keys/api-keys.service.spec.ts`, `api-keys.controller.spec.ts`, `backend/src/modules/sdk/sdk.service.spec.ts`

**Interfaces:**
- Consumes: Schema aus Task 1.
- Produces:
  - `hashApiKey(key: string): string` (exportiert aus `api-keys.service.ts`, sha256 hex) – wird von Task 3 genutzt.
  - `CreateApiKeyDto` + `type` erlaubt `'MCP'`; neue optionale Felder `projectId?: string` (`@IsMongoId`), `allowedEnvironmentIds?: string[]` (`@IsArray @IsMongoId({ each: true }) @ArrayMaxSize(50)`).
  - `ApiKeysService.create(orgId, userId, data)` liefert für `MCP` ein Objekt, dessen `key` der **Klartext** ist (einmalig); in der DB steht `key = maskApiKey(plain)`, `keyHash = hashApiKey(plain)`.
  - Listen-Select (`API_KEY_LIST_SELECT`) ergänzt `userId`, `projectId`, `allowedEnvironmentIds`.
  - `ApiKeysService.findByOrganization(orgId, role, userId)` – neuer dritter Parameter.

- [ ] **Step 1: Failing tests schreiben**
  - `create MCP key stores only hash and masked key, returns plain key once`: Rückgabe `key` matcht `/^tkm_[a-f0-9]{64}$/`; `prisma.apiKey.create` bekam `key` mit `…`, `keyHash === hashApiKey(returned.key)`, `projectId`, `allowedEnvironmentIds`.
  - `create MCP key without projectId → BadRequestException`.
  - `create MCP key rejects environment of another project` (Controller ruft `access.assertEnvironmentInProject` je ID; Mock wirft → Fehler propagiert).
  - Controller: `MEMBER may create MCP key` (`assertOrgRole(..., 'MEMBER')`), `MEMBER creating SERVER key → 403` (`assertOrgRole(..., 'ADMIN')` für Nicht-MCP), `VIEWER creating MCP key → 403`.
  - Controller: `MCP key create checks project belongs to org` (`access.assertProjectAccess(userId, projectId, 'MEMBER')` und `project.organizationId === orgId`, sonst 404).
  - `findByOrganization below ADMIN hides other users' MCP keys, keeps own MCP keys and other types masked`.
  - Controller delete: `MEMBER may delete own MCP key`, `MEMBER deleting someone else's MCP key → 403`, `ADMIN deletes any key`.
  - SDK: `resolveSdkAccess filters out MCP keys` → `keyWhere.type` equals `{ not: 'MCP' }`.
- [ ] **Step 2: Tests laufen lassen** – `cd backend && npx jest src/modules/api-keys src/modules/sdk/sdk.service` → FAIL.
- [ ] **Step 3: Implementieren**
  - Service: `allowedKeyTypes` um `MCP`; Key-Präfix `tkm_` für MCP, `tk_` sonst; MCP ohne `projectId` → `BadRequestException('projectId is required for MCP keys')`; Nicht-MCP ignoriert `projectId`/`allowedEnvironmentIds`.
  - Controller `create`: bei `dto.type === 'MCP'` Rolle `MEMBER` + Projekt-/Environment-Prüfungen, sonst wie bisher `ADMIN`.
  - Controller `delete`: Key laden (`assertApiKeyAccess(userId, keyId, 'MEMBER')`, Select um `type`, `userId` erweitern); erlaubt wenn Rolle ≥ ADMIN **oder** (`type === 'MCP'` und `apiKey.userId === userId`), sonst `ForbiddenException`.
  - `findByOrganization`/`findByUser`: für Rollen < ADMIN MCP-Keys anderer User herausfiltern.
  - SDK: `type: { not: 'MCP' }` in den `where`.
- [ ] **Step 4: Tests grün** – gleicher Befehl → PASS; `npm run build && npm test` → PASS.
- [ ] **Step 5: Commit** – `feat(api-keys): add project-scoped MCP key type with hashed storage`

---

### Task 3: MCP-Key-Authentifizierung

**Files:**
- Create: `backend/src/modules/mcp/mcp-key.resolver.ts`
- Create: `backend/src/modules/mcp/mcp-key.resolver.spec.ts`

**Interfaces:**
- Consumes: `hashApiKey` (Task 2), Prisma.
- Produces:
  ```ts
  export interface McpContext {
    apiKeyId: string
    apiKeyName: string
    userId: string
    organizationId: string
    projectId: string
    allowedEnvironmentIds: string[]
    role: OrganizationRole   // aktuelle Rolle des Erstellers
  }
  @Injectable() class McpKeyResolver {
    resolve(authorizationHeader: string | undefined): Promise<McpContext> // wirft UnauthorizedException
  }
  ```

- [ ] **Step 1: Failing tests schreiben** – je ein Fall → `UnauthorizedException`: kein/kein-Bearer-Header; Präfix nicht `tkm_`; kein Treffer per `keyHash`; `type !== 'MCP'`; `isActive === false`; `expiresAt` in der Vergangenheit; `userId` oder `projectId` fehlt; Ersteller `isActive === false`; Ersteller kein Mitglied der Org mehr. Erfolgsfall: liefert `McpContext` mit Rolle aus `organizationMember`. Zusätzlich: `lastUsedAt` wird aktualisiert, wenn älter als 60 s, und **nicht**, wenn jünger.
- [ ] **Step 2: FAIL prüfen** – `cd backend && npx jest src/modules/mcp/mcp-key.resolver` → FAIL.
- [ ] **Step 3: `McpKeyResolver.resolve` implementieren** – Lookup `prisma.apiKey.findFirst({ where: { keyHash } })`; `lastUsedAt`-Update fire-and-forget (Fehler nur loggen).
- [ ] **Step 4: PASS prüfen** – gleicher Befehl.
- [ ] **Step 5: Commit** – `feat(mcp): authenticate MCP keys by hash`

---

### Task 4: MCP-Tools

**Files:**
- Create: `backend/src/modules/mcp/flag-state.ts` (reine Funktionen)
- Create: `backend/src/modules/mcp/flag-state.spec.ts`
- Create: `backend/src/modules/mcp/mcp-tools.service.ts`
- Create: `backend/src/modules/mcp/mcp-tools.service.spec.ts`
- Modify: `backend/src/modules/flags/flags.module.ts` (exportiert `FlagsService`, falls noch nicht)

**Interfaces:**
- Consumes: `McpContext` (Task 3), `FlagsService.create/update/updateValue/delete/findByProject`, `CreateFlagDto`, `UpdateFlagDto`, `UpdateFlagValueDto`, `hasRole`, `getDefaultFlagValue`.
- Produces:
  ```ts
  // flag-state.ts
  export interface FlagStateRow { environmentKey: string; brandKey: string | null; enabled: boolean; value: string }
  export function collectFlagStates(
    flag: { flagType: FlagType; flagEnvironments: { environmentId: string; brandId: string | null; enabled: boolean; defaultValue: string }[] },
    environments: { id: string; key: string }[],
    brands: { id: string; key: string }[]
  ): FlagStateRow[]   // je Environment eine Default-Zeile (fehlend → enabled false, getDefaultFlagValue), plus jede vorhandene Brand-Zeile
  export function findDivergentStates(rows: FlagStateRow[]): FlagStateRow[] // [] wenn alle (enabled,value) gleich; sonst alle Zeilen, die vom häufigsten Zustand abweichen

  // mcp-tools.service.ts – jede Methode liefert ein JSON-serialisierbares Ergebnis oder wirft McpToolError(message)
  export class McpToolError extends Error {}
  class McpToolsService {
    getProject(ctx: McpContext): Promise<{ project: {key,name,type}; environments: {key,name,canToggle:boolean}[]; brands: {key,name}[] }>
    listFlags(ctx, input: { search?: string }): Promise<{ flags: { key,name,description,type, states: FlagStateRow[] }[] }>
    getFlag(ctx, input: { flagKey: string }): Promise<{ key,name,description,type, states: FlagStateRow[] }>
    createFlag(ctx, input: { key: string; name: string; description?: string; type: 'BOOLEAN'|'STRING'|'NUMBER'|'JSON' }): Promise<{ key: string }>
    updateFlag(ctx, input: { flagKey: string; name?: string; description?: string }): Promise<{ key: string }>
    setFlagState(ctx, input: { flagKey: string; environmentKey: string; enabled?: boolean; value?: string }): Promise<{ environmentKey: string; enabled: boolean; value: string }>
    deleteFlag(ctx, input: { flagKey: string; confirm: boolean }): Promise<{ deleted: boolean; canDelete: boolean; states: FlagStateRow[]; divergent: FlagStateRow[] }>
  }
  ```

Regeln, die die Tests festnageln:
- Flags/Environments/Brands werden **nur** mit `projectId: ctx.projectId` gesucht; unbekannter Key → `McpToolError('Flag "<key>" not found in this project')`.
- Rollen: lesen ab VIEWER; `createFlag`/`updateFlag`/`setFlagState` ab MEMBER; `deleteFlag` ab MEMBER (MCP-Ausnahme). Zu niedrig → `McpToolError('Your role does not allow this action')`.
- Eingaben werden vor dem Service-Aufruf mit `class-validator` (`plainToInstance` + `validate`) gegen `CreateFlagDto`/`UpdateFlagDto`/`UpdateFlagValueDto` geprüft; Fehler → `McpToolError` mit den Constraint-Meldungen.
- `setFlagState`: Environment nicht in `ctx.allowedEnvironmentIds` → `McpToolError('This key may not change environment "<key>". Allowed: <keys>')`; sonst `flags.updateValue(flagId, envId, { enabled, value }, ctx.userId)` (Environment-Default, kein `brandId`). Weder `enabled` noch `value` → `McpToolError`.
- `deleteFlag`: ohne `confirm` nie löschen; mit `confirm` und `divergent.length > 0` → `McpToolError`, der die abweichenden Environments/Brands nennt; sonst `flags.delete(flagId, ctx.userId)`.
- Service-Exceptions (`NotFoundException`, `ConflictException` bei doppeltem Key usw.) werden in `McpToolError(error.message)` übersetzt.

- [ ] **Step 1: Failing tests für `flag-state.ts`** – `missing env row counts as off/default`, `brand override is listed with brandKey`, `findDivergentStates returns [] when all equal`, `single brand override off while all envs on → divergent contains that brand row`, `STRING flag with differing values → divergent`.
- [ ] **Step 2: Failing tests für `McpToolsService`** (FlagsService und Prisma gemockt):
  - `getProject marks canToggle from allowedEnvironmentIds`
  - `getFlag does not find a flag key that only exists in another project` (Prisma-`where` enthält `projectId: ctx.projectId`)
  - `createFlag rejects key longer than FLAG_KEY_MAX_LENGTH without calling FlagsService`
  - `createFlag maps ConflictException to McpToolError`
  - `VIEWER cannot createFlag`
  - `setFlagState in non-allowed environment throws and does not call updateValue`
  - `setFlagState in allowed environment calls updateValue(flagId, envId, { enabled: true }, userId)`
  - `setFlagState rejects value longer than FLAG_VALUE_MAX_LENGTH`
  - `deleteFlag without confirm reports states and does not delete`
  - `deleteFlag with confirm and divergent brand override throws and does not delete`
  - `deleteFlag with confirm and uniform states deletes as MEMBER`
- [ ] **Step 3: FAIL prüfen** – `cd backend && npx jest src/modules/mcp` → FAIL.
- [ ] **Step 4: Implementieren** (`flag-state.ts`, dann `McpToolsService`).
- [ ] **Step 5: PASS prüfen** – gleicher Befehl; `npm run build && npm test` → PASS.
- [ ] **Step 6: Commit** – `feat(mcp): implement flag tools with environment and delete guards`

---

### Task 5: `/api/mcp`-Endpoint, Modul, Rate-Limit, End-to-End-Smoke

**Files:**
- Modify: `backend/package.json` (`@modelcontextprotocol/sdk@^1.32.2`, `zod` – Version, die das SDK als Peer verlangt)
- Create: `backend/src/modules/mcp/mcp-server.factory.ts`
- Create: `backend/src/modules/mcp/mcp.controller.ts`
- Create: `backend/src/modules/mcp/mcp.module.ts`
- Create: `backend/src/modules/mcp/mcp.controller.spec.ts`
- Modify: `backend/src/app.module.ts` (`McpModule` importieren)

**Interfaces:**
- Consumes: `McpKeyResolver.resolve`, `McpToolsService.*`, `McpToolError`, `runWithActor`.
- Produces:
  - `createMcpServer(ctx: McpContext, tools: McpToolsService): McpServer` – registriert die 7 Tools `get_project`, `list_flags`, `get_flag`, `create_flag`, `update_flag`, `set_flag_state`, `delete_flag` mit zod-Schemas passend zu den Eingaben aus Task 4. Erfolg → `{ content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }`; `McpToolError` → `{ isError: true, content: [{ type: 'text', text: message }] }`. Server-`instructions` und Tool-Beschreibungen erklären den Workflow (vor `create_flag` mit `list_flags` auf Dubletten prüfen, Keys in kebab-case, beim Aufräumen erst Code bereinigen, dann `delete_flag` erst ohne, dann mit `confirm`).
  - `McpController` unter `@Controller('mcp')` (global prefix ergibt `/api/mcp`): `POST` → `resolve(header)` → `runWithActor({apiKeyId, apiKeyName}, ...)` → neuer `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })`, `server.connect(transport)`, `transport.handleRequest(req, res, req.body)`; nach `res` `close` beide schließen. `GET`/`DELETE` → 405 mit JSON-RPC-Fehlerkörper. 401 bei Auth-Fehler mit `WWW-Authenticate: Bearer`.
  - Rate-Limit: `@Throttle({ default: { limit: 120, ttl: 60_000 } })` plus `McpThrottlerGuard extends ThrottlerGuard` mit `getTracker` = SHA-256 des Bearer-Tokens (Fallback IP).

- [ ] **Step 1: Abhängigkeiten installieren** – `cd backend && npm install @modelcontextprotocol/sdk@^1.32.2 zod` → `npm run build` PASS (CommonJS-Import `@modelcontextprotocol/sdk/server/mcp.js` und `/server/streamableHttp.js` auflösbar).
- [ ] **Step 2: Failing test schreiben** – `mcp.controller.spec.ts` startet eine Nest-Testanwendung (nur `McpModule` mit gemocktem `McpKeyResolver`/`McpToolsService`, `setGlobalPrefix('api')`, `listen(0)`) und nutzt den SDK-Client (`Client` + `StreamableHTTPClientTransport` mit `requestInit.headers.Authorization`):
  - `lists exactly the 7 tools` (`tools/list` → Namen wie oben)
  - `create_flag then set_flag_state call the tools service with the key context`
  - `tool error is returned as isError result, not HTTP error`
  - `missing/invalid bearer → HTTP 401` (fetch ohne Header)
  - `GET /api/mcp → 405`
  - `audit actor is set during tool execution` (Mock von `createFlag` liest `currentActor()` und gibt es zurück)
- [ ] **Step 3: FAIL prüfen** – `cd backend && npx jest src/modules/mcp/mcp.controller` → FAIL.
- [ ] **Step 4: Implementieren** – Factory, Controller, Guard, Modul, Registrierung in `AppModule`.
- [ ] **Step 5: PASS prüfen** – gleicher Befehl; `npm run build && npm test` → PASS.
- [ ] **Step 6: Commit** – `feat(mcp): expose stateless MCP endpoint at /api/mcp`

---

### Task 6: Dashboard – MCP-Keys erstellen und anzeigen

**Files:**
- Modify: `frontend/src/pages/orgs/api-keys/apiKeys.ts`
- Modify: `frontend/src/pages/orgs/api-keys/CreateApiKeyDialog.tsx`
- Modify: `frontend/src/pages/orgs/api-keys/ApiKeyCreatedDialog.tsx`
- Modify: `frontend/src/pages/orgs/api-keys/ApiKeysPage.tsx`
- Modify: `frontend/src/i18n/locales/de.ts`, `frontend/src/i18n/locales/en.ts`
- Test: `frontend/src/pages/orgs/api-keys/apiKeys.test.ts`, `ApiKeysPage.test.tsx`

**Interfaces:**
- Consumes: Backend aus Task 2 (`POST /api-keys/organization/:orgId` mit `type: 'MCP'`, `projectId`, `allowedEnvironmentIds`; Liste mit `userId`, `projectId`, `allowedEnvironmentIds`), `GET /projects/organization/:orgId` (bereits auf der Seite geladen), Environments je Projekt (`GET /environments/project/:projectId` – genaue Route im `environments.controller.ts` nachsehen).
- Produces:
  - `ApiKeyType` um `'MCP'`; `ApiKey` um `userId?`, `projectId?`, `allowedEnvironmentIds?: string[]`.
  - `CREATE_KEY_TYPES = ['CLIENT', 'SERVER', 'MCP']`; `NewApiKey` um `projectId?`, `allowedEnvironmentIds?`.
  - `mcpAddCommand(apiBase: string, key: string): string` → `claude mcp add --transport http togglely <absoluteBase>/mcp --header "Authorization: Bearer <key>"`; `absoluteBase = new URL(apiBase, window.location.origin).href` ohne abschließenden `/`.

Verhalten:
- MEMBER (nicht ADMIN) sieht den „Erstellen“-Button; im Dialog wird ihm **nur** der Typ MCP angeboten. ADMIN sieht CLIENT, SERVER, MCP.
- Typ MCP: Projekt-Auswahl (Pflicht), dann Checkbox-Liste der Environments des Projekts unter „Darf schalten in“; Environment mit Key `development` ist vorausgewählt, falls vorhanden.
- `ApiKeyCreatedDialog` bei MCP: zusätzlich ein `CopyLinkField` mit `mcpAddCommand(...)`; der Sichtbarkeits-Hinweis lautet „Wird nur einmal angezeigt“ statt des Admin-Hinweises.
- Liste: MCP-Keys zeigen in der Environment-Spalte Projektname + „schaltet: dev, …“; Löschen-Button für ADMIN oder für eigene MCP-Keys (`apiKey.userId === currentUser.id`, aus `useAuthStore`). Kopieren-Button bei MCP-Keys ausgeblendet (Klartext nicht vorhanden).

- [ ] **Step 1: Failing tests schreiben**
  - `apiKeys.test.ts`: `mcpAddCommand('/api', 'tkm_x')` mit `window.location.origin = 'http://localhost:3000'` → `claude mcp add --transport http togglely http://localhost:3000/api/mcp --header "Authorization: Bearer tkm_x"`; mit `'https://api.example.com/api/'` → `https://api.example.com/api/mcp`.
  - `ApiKeysPage.test.tsx`: `member can open create dialog and only MCP type is offered`; `MCP requires a project before submit`; `development environment is preselected`; `submits type MCP with projectId and allowedEnvironmentIds`; `created MCP key shows the claude mcp add command`; `member sees delete only on own MCP key`.
- [ ] **Step 2: FAIL prüfen** – `cd frontend && npx vitest run src/pages/orgs/api-keys` → FAIL.
- [ ] **Step 3: Implementieren** inkl. i18n-Keys unter `org-pages.api-keys.*` (`type.MCP`, `type-hint.MCP`, `project-label`, `toggle-envs-label`, `toggle-envs-hint`, `created-warning-mcp`, `created-once`, `mcp-command-label`, `toggles-in`) in de und en.
- [ ] **Step 4: PASS prüfen** – gleicher Befehl; `cd frontend && npm run build && npm test` → PASS (inkl. `src/i18n/locales.test.ts`).
- [ ] **Step 5: Commit** – `feat(api-keys): create MCP keys in the dashboard with ready-to-copy command`

---

### Task 7: Audit-Log zeigt „via MCP-Schlüssel“

**Files:**
- Modify: `frontend/src/pages/orgs/audit-log/auditLog.ts` (`OrgAuditLogEntry` um `apiKeyId?: string | null; apiKeyName?: string | null`)
- Modify: `frontend/src/pages/orgs/audit-log/AuditLogPage.tsx`
- Modify: `frontend/src/pages/projects/flags/detail/history.ts` + `FlagHistoryTab.tsx` (gleiche Anzeige im Flag-Verlauf)
- Modify: `frontend/src/i18n/locales/de.ts`, `en.ts`
- Test: `frontend/src/pages/orgs/audit-log/AuditLogPage.test.tsx`, `frontend/src/pages/projects/flags/detail/FlagDetailPage.test.tsx`

**Interfaces:**
- Consumes: `AuditLog.apiKeyId`/`apiKeyName` (Task 1; kommen über das bestehende `include` automatisch mit).
- Produces: `formatAuditActor(entry): string` → `"<User> via MCP-Schlüssel „<apiKeyName>“"` (de) / `"<User> via MCP key "<apiKeyName>""` (en), ohne Key nur der User.

- [ ] **Step 1: Failing tests** – `AuditLogPage shows "via MCP-Schlüssel „Claude Laptop“" for entries with apiKeyName`; `FlagHistoryTab shows the same suffix`.
- [ ] **Step 2: FAIL prüfen** – `cd frontend && npx vitest run src/pages/orgs/audit-log src/pages/projects/flags/detail` → FAIL.
- [ ] **Step 3: Implementieren** + i18n `audit.via-mcp-key`.
- [ ] **Step 4: PASS prüfen** – gleicher Befehl; `npm run build && npm test` → PASS.
- [ ] **Step 5: Commit** – `feat(audit): show MCP key as acting agent`

---

### Task 8: Doku, Gesamtprüfung, Live-Smoke

**Files:**
- Modify: `docs/API.md` (Abschnitt „KI-Agenten anbinden (MCP)“: Key anlegen, `claude mcp add`-Befehl, Tool-Tabelle, Sicherheitsmodell inkl. Lösch-Regel und Environment-Freigabe)
- Modify: `CHANGELOG.md`
- Modify: `README.md` (ein Satz + Link auf den Abschnitt)

- [ ] **Step 1: Doku schreiben** wie oben.
- [ ] **Step 2: Gesamtprüfung** – im Root `npm run biome:check`, dann `cd backend && npm run build && npm test`, `cd frontend && npm run build && npm test` → alles PASS.
- [ ] **Step 3: Live-Smoke** – Stack starten (`docker compose up -d --build`), im Dashboard MCP-Key für ein Projekt mit `development` anlegen, Befehl ausführen, dann per `curl` gegen `http://localhost:4000/api/mcp`: `initialize` und `tools/list` liefern die 7 Tools; `create_flag` → Flag im Dashboard sichtbar; `set_flag_state` in `production` → `isError` mit „may not change“; Audit-Log zeigt „via MCP-Schlüssel“.
- [ ] **Step 4: Commit** – `docs(mcp): document connecting AI agents via MCP`
