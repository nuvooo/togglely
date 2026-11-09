# Änderungsbenachrichtigung – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Verbindliche Details stehen in `docs/superpowers/specs/2026-11-09-change-notifications-design.md` – dieser Plan legt Reihenfolge, Dateien, Tests und Abnahme fest. TDD.

**Goal:** Anwendungen cachen Flags bis zur nächsten Änderung: Konfigurationsversion + ETag/304, SSE-Live-Stream, signierte Webhooks mit Retries, Dashboard-Verwaltung.

**Architecture:** Neues Modul `change-events` (Version, Debounce, `ChangeBus` In-Memory/Redis). SDK-Routen in `main.ts` bekommen ETag und `/sdk/stream`. Neues Modul `webhooks` (CRUD, Zustell-Worker mit DB-Queue, SSRF-Guard). Mutierende Services rufen nach Erfolg `ChangeEventsService.recordChange`. Dashboard-Seite „Webhooks“ im Projekt-Bereich.

**Tech Stack:** NestJS 11, Prisma 5/MongoDB, ioredis (optional), Node `fetch`/`undici` Agent mit eigenem `lookup`, Jest · React 19, vitest.

**Commit-Trailer:**
```
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QwoxMtZKrNR4NyJuxLehgT
```

## Teil A – Versionen & Events (Backend)

### A1 Schema
`ConfigVersion { id, projectId @db.ObjectId, environmentId @db.ObjectId, version Int @default(0), updatedAt @updatedAt; @@unique([projectId, environmentId]) @@map("config_versions") }`,
`Webhook { id, organizationId, projectId, url, secret, environmentIds String[] @db.ObjectId, enabled Boolean @default(true), description String?, consecutiveFailures Int @default(0), createdById, createdAt, updatedAt, lastDeliveryAt DateTime?, lastStatus String?; @@index([projectId]) @@map("webhooks") }`,
`WebhookDelivery { id, webhookId @db.ObjectId, eventId String, event Json, attempt Int @default(0), status String, responseCode Int?, responseBody String?, error String?, durationMs Int?, nextAttemptAt DateTime?, lockedUntil DateTime?, createdAt, updatedAt; @@index([status, nextAttemptAt]) @@index([webhookId, createdAt]) @@map("webhook_deliveries") }`. Webhook→Delivery `onDelete: Cascade`.

### A2 ChangeBus
`src/modules/change-events/change-bus.ts`: Interface `ChangeBus { publish(e: FlagsChangedEvent): Promise<void>; subscribe(handler): () => void }`; `InMemoryChangeBus` (EventEmitter, maxListeners hoch); `RedisChangeBus` (ioredis pub/sub, Kanal `togglely:flags-changed`, JSON). Provider-Factory wählt Redis wenn `REDIS_URL` gesetzt, Fallback In-Memory bei Verbindungsfehler (Warnung). Tests mit Fake-Redis (Mock) + In-Memory.

### A3 ChangeEventsService
`recordChange({ organizationId, projectId, environmentIds: string[] | 'all', changes: { flagKey?: string; action }[] })`: Environments auflösen (`'all'` → alle des Projekts), pro Environment `configVersion.upsert` mit `increment`, Änderungen in einem Debounce-Puffer pro `(projectId, environmentId)` sammeln (2 s, `setTimeout`, unref), beim Flush **ein** `FlagsChangedEvent { eventId (uuid), organizationId, projectId, projectKey, environmentId, environmentKey, version (aktuell), changes (dedupliziert, max 100, sonst `truncated: true`), createdAt }` auf den Bus. `getVersion(projectId, environmentId)` (0 wenn nicht vorhanden). Fehler werden geloggt, nie geworfen. `onModuleDestroy` flusht Puffer. Tests mit Fake-Timers (Debounce, Dedupe, 'all', Fehler werden geschluckt).

### A4 Aufrufer verdrahten
Nach erfolgreicher Mutation `recordChange` aufrufen in: flags.service (create/update/delete/toggle/updateValue/updateEnvironment), brands.service (create/update/delete/toggle/override reset), targeting-rules.service (create/update/delete), environments.service (create/update/delete/reorder → nur create/delete/update, reorder ändert nichts am SDK-Ergebnis), projects.service (import, delete project → kein Event nötig), experiments.service (start/pause/complete/update/delete). Je ein Test pro Service, dass `recordChange` mit passenden Argumenten gerufen wird (Mock).

### A5 ETag/304
In `main.ts`-SDK-Handlern (oder ausgelagert in `src/modules/sdk/sdk-etag.ts`): nach `resolveSdkAccess` (API-Key/Origin) Version holen, `etag = W/"<version>-<sha256(brandKey|contextJSON|flagKey).slice(0,16)>"`; `If-None-Match` gleich → 304 ohne Body; sonst normal + Header `ETag`, `Cache-Control: no-cache`, `Access-Control-Expose-Headers: ETag`. SDK-Service braucht dafür eine Methode, die Projekt/Environment auflöst ohne zu evaluieren (existiert: `resolveSdkAccess`). Tests: 304-Pfad evaluiert nicht, ungültiger Key → 401 auch mit If-None-Match.

## Teil B – Live-Stream (Backend)

### B1 SSE-Handler
`src/modules/sdk/sdk-stream.ts` + Route `GET /sdk/stream/:projectKey/:environmentKey` in `main.ts` (vor dem SDK-Rate-Limiter? → Stream-Verbindungen zählen 1 Request; Rate-Limiter gilt). Ablauf laut Spec: Auth, Limits (`SSE_MAX_PER_KEY`=50, `SSE_MAX_PER_IP`=20 → 429), Header, `retry: 5000`, `event: ready`, Bus-Subscription gefiltert auf (projectId, environmentId), `event: flags-changed` mit `id`, Heartbeat 25 s, `Last-Event-ID` < aktuelle Version → sofort ein Event, Key-Revalidierung alle 5 min und bei jedem Event (deaktiviert/abgelaufen → Stream schließen), Cleanup bei `close`. Tests mit Fake-Response/Timers.

### B2 Proxy-Konfiguration
`frontend/nginx.conf` und Root-`nginx.conf`: `location /sdk/stream/` mit `proxy_buffering off; proxy_cache off; proxy_read_timeout 3600s; proxy_set_header Connection '';  proxy_http_version 1.1;`. Vite-Proxy `/sdk` deckt den Stream ab (prüfen).

## Teil C – Webhooks (Backend)

### C1 SSRF-Guard
`src/modules/webhooks/ssrf-guard.ts`: `assertPublicUrl(url, { allowPrivate, allowInsecure })` (Schema https / http nur mit allowInsecure, keine Credentials in URL), `resolvePublicAddress(hostname)` → DNS (`dns.promises.lookup` all) und Blockliste: 0.0.0.0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16, 198.18/15, 224/4, 240/4, ::1, ::, fc00::/7, fe80::/10, ::ffff:mapped private; `localhost`/`*.localhost`. Gibt geprüfte IP zurück; Zustellung pinnt via undici `Agent({ connect: { lookup } })`. Tests mit vielen Adressen.

### C2 Signatur & Zustellung
`webhook-signer.ts` (`sign(secret, timestamp, body)` → `t=…,v1=…`; Testvektor), `webhook-delivery.service.ts`: `deliver(delivery)` → fetch POST mit 10 s Timeout, `redirect: 'manual'`, Header laut Spec, Ergebnis speichern (Body max 1 KB), Retry-Plan [60, 300, 1800, 7200, 43200] s, nach letztem Fehlschlag `failed`; `consecutiveFailures` pflegen, ≥20 → `enabled=false` + Audit `webhook.auto_disabled`.

### C3 Dispatcher & Worker
`webhook-dispatcher.ts`: abonniert den Bus; für jedes Event passende aktive Webhooks des Projekts (Environment-Filter leer = alle) → `WebhookDelivery` (status `pending`, nextAttemptAt now). `webhook-worker.ts`: Intervall 10 s (unref, `WEBHOOK_WORKER_DISABLED=true` zum Abschalten in Tests), claimt bis zu 20 fällige Zustellungen atomar (`updateMany` mit `lockedUntil < now` → setzen, dann lesen per Lock-Token), stellt zu, gibt frei. Täglicher Cleanup >30 Tage. Bei mehreren Instanzen: Dispatcher nur auf der veröffentlichenden Instanz (Bus-Events kommen überall an → Dispatch idempotent machen: Delivery-Unique `(webhookId, eventId)` per Code-Check `findFirst` vor create, Race toleriert durch eindeutigen Index `@@unique([webhookId, eventId])`).

### C4 Webhook-API
`webhooks.controller.ts` unter `projects/:projectId/webhooks` mit AccessService (lesen MEMBER, schreiben ADMIN), DTOs (URL max 2048, description max 200, environmentIds `@IsMongoId({each:true})` ArrayMaxSize 20), max 10 pro Projekt, Environment-Zugehörigkeit prüfen, URL vorab mit `assertPublicUrl` prüfen (400 bei privat ohne Freigabe). Secret `whsec_` + 32 Byte base64url, nur bei create/rotate im Klartext; sonst maskiert (`whsec_…abcd`). Routen laut Spec inkl. test (sofort zustellen, Ergebnis zurückgeben) und redeliver. Audit-Logs für create/update/delete/rotate.

## Teil D – Dashboard (Frontend)

### D1 Webhooks-Seite
Route `/projects/:projectId/webhooks` (ContextNav „Entwickeln“ → „Webhooks“), Liste (URL, Environments, Status-Badge, letzte Zustellung), Dialog anlegen/bearbeiten, Secret-Einmalanzeige mit Kopieren + Node-Beispiel zur Signaturprüfung, Detail-Drawer/Seite mit Zustellprotokoll, Test senden, erneut senden, Secret rotieren, aktiv/inaktiv, löschen (ConfirmDialog). Tokens only, i18n de/en, Tests.

### D2 Integrations-Hinweise
Projekt-Einstellungen (oder SDK-Tester): Stream-URL, curl-Beispiel für ETag (`If-None-Match`), Hinweis Webhook-Signatur.

## Teil E – Abnahme
Backend/Frontend tsc+tests+build+lint:colors grün. E2E (Scratchpad, frische MongoDB, Backend mit `WEBHOOK_ALLOW_PRIVATE=true WEBHOOK_ALLOW_INSECURE=true`, lokaler HTTP-Empfänger): Flag umschalten → Version +1 nach Debounce; SSE-Client empfängt `flags-changed`; Webhook kommt mit gültiger Signatur an; ETag vorher → 304 bei gleicher Version, 200 nach Änderung; Empfänger antwortet 500 → Retry geplant; privates Ziel ohne Freigabe → 400 beim Anlegen.
