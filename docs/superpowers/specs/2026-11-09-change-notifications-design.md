# Änderungsbenachrichtigung: Versionen, ETag, Live-Stream, Webhooks

**Status:** abgestimmt am 2026-11-09 · **Scope:** Backend + Dashboard (dieses Repo). SDK-Anpassung folgt als eigenes Teilprojekt (`togglely-sdk`).

## Ziel

Anwendungen sollen Flags so lange cachen können, bis sich tatsächlich etwas ändert:
- **Server-Anwendungen** erhalten signierte **Webhooks** bei Änderungen.
- **SDKs** (Browser/Apps/Server) erhalten Änderungen über eine **Live-Verbindung (SSE)** und fragen ansonsten per **ETag** ab – unveränderte Abfragen kosten nur ein `304`.

## 1. Konfigurationsversion

- Neues Modell `ConfigVersion { id, projectId, environmentId, version Int, updatedAt }`, unique `(projectId, environmentId)`.
- `ChangeEventsService.recordChange({ organizationId, projectId, environmentIds | 'all', changes: [{ flagKey?, action }] })`:
  - erhöht `version` atomar (`upsert` + `increment`) für jede betroffene Environment,
  - sammelt Änderungen pro (Projekt, Environment) **2 s** (Debounce, in-memory pro Instanz) und veröffentlicht dann **ein** Event `flags.changed { projectId, environmentId, version, changes[] }` an Stream-Hub und Webhook-Dispatcher.
- Aufrufer (nach erfolgreicher Mutation, nie davor): Flag create/update/delete, toggle, Wert/Brand-Wert, FlagEnvironment-Update, Targeting-Regel create/update/delete, Brand create/update/delete (alle Environments), Environment create/update/delete (betroffene/alle), Projekt-Import, Experiment start/pause/complete/update/delete. `action` ∈ `created|updated|deleted|toggled|rules_changed|experiment_changed|environment_changed|brand_changed|imported`.
- Fehler beim Aufzeichnen dürfen die eigentliche Mutation nicht scheitern lassen (loggen, weiter).

## 2. ETag / 304

- `GET /sdk/flags/:projectKey/:environmentKey[/:flagKey]` setzt `ETag: W/"<version>-<hash>"`, `hash = sha256(brandKey|context-JSON|flagKey).slice(0,16)`, und `Cache-Control: no-cache`.
- Request mit `If-None-Match` gleich aktuellem ETag → **304** ohne Body, **nach** API-Key-/Origin-Prüfung, **vor** der Auswertung.
- `Access-Control-Expose-Headers: ETag` für Browser-SDKs.

## 3. Live-Stream (SSE)

- `GET /sdk/stream/:projectKey/:environmentKey` (raw Express-Handler wie die anderen SDK-Routen; gleiche Key-/Origin-Prüfung). API-Key per Header **oder** `?apiKey=` (EventSource kann keine Header setzen; Query wird bereits aus Logs entfernt).
- Antwort `text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`. Sofort `event: ready` mit `{ version }`, danach bei Änderungen `event: flags-changed`, `id: <version>`, `data: { version, changes }`. Heartbeat-Kommentar alle 25 s. `retry: 5000`.
- `Last-Event-ID` < aktuelle Version → sofort ein `flags-changed` senden.
- Limits: max. 50 gleichzeitige Streams pro API-Key und 20 pro IP (konfigurierbar `SSE_MAX_PER_KEY`, `SSE_MAX_PER_IP`) → 429. Verbindung wird geschlossen, wenn der Key deaktiviert/gelöscht wird (Prüfung bei jedem Event und alle 5 min).
- **Verteilung:** `ChangeBus`-Schnittstelle mit zwei Implementierungen: In-Memory (EventEmitter, Standard) und Redis Pub/Sub (aktiv wenn `REDIS_URL` gesetzt; `ioredis` ist bereits Dependency). Debounce passiert vor dem Bus (eine Instanz veröffentlicht).
- nginx (`frontend/nginx.conf`, Root-`nginx.conf`): Location für `/sdk/stream/` mit `proxy_buffering off; proxy_read_timeout 1h;`.

## 4. Webhooks

### Modell
- `Webhook { id, organizationId, projectId, url, secret, environmentIds String[] (leer = alle), enabled Boolean, description?, createdById, createdAt, updatedAt, lastDeliveryAt?, lastStatus? }`
- `WebhookDelivery { id, webhookId, eventId, event Json, attempt Int, status ('pending'|'success'|'failed'), responseCode?, error?, durationMs?, nextAttemptAt?, createdAt }` – TTL/Aufräumen: Zustellungen älter als 30 Tage werden täglich gelöscht.
- Secret: 32 Byte, Präfix `whsec_`, nur bei Erstellung/Rotation im Klartext zurückgegeben; gespeichert im Klartext (wird zum Signieren benötigt), in API-Antworten maskiert.

### API (Dashboard, ADMIN+ des Projekts; Lesen MEMBER+)
- `GET/POST /projects/:projectId/webhooks`, `PATCH/DELETE /projects/:projectId/webhooks/:id`, `POST …/:id/rotate-secret`, `POST …/:id/test` (sendet `webhook.test`), `GET …/:id/deliveries?limit=50`, `POST …/deliveries/:deliveryId/redeliver`.
- Validierung: URL `https://` (in Produktion; `http://` nur mit `WEBHOOK_ALLOW_INSECURE=true`), max. 2048 Zeichen; Environments gehören zum Projekt; max. 10 Webhooks pro Projekt.

### Zustellung
- Payload `{ id: <eventId>, type: 'flags.changed' | 'webhook.test', createdAt, organizationId, project: { id, key }, environment: { id, key }, version, changes: [{ flagKey, action }] }`.
- Header: `Content-Type: application/json`, `User-Agent: Togglely-Webhooks/1`, `X-Togglely-Event`, `X-Togglely-Delivery: <deliveryId>`, `X-Togglely-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<rawBody>")>`.
- `fetch` mit 10 s Timeout, keine Redirects (`redirect: 'manual'` → als Fehler werten), Antwort-Body max. 1 KB gespeichert. 2xx = Erfolg.
- Retries: 1 min, 5 min, 30 min, 2 h, 12 h (danach `failed`). Worker: DB-gestützte Warteschlange, Polling alle 10 s (`nextAttemptAt <= now`, atomar per `updateMany`-Claim), damit Neustarts nichts verlieren. Nach 20 aufeinanderfolgenden Fehlschlägen wird der Webhook automatisch deaktiviert (Audit-Log).
- **SSRF-Schutz:** vor jeder Zustellung DNS-Auflösung; Ziel-IP in privaten/Loopback/Link-Local/CGNAT/Multicast/IPv6-ULA-Bereichen oder `localhost` → blockiert (`error: 'blocked_private_address'`), außer `WEBHOOK_ALLOW_PRIVATE=true`. Verbindung auf die geprüfte IP pinnen (eigener `lookup` im HTTP-Agent), damit DNS-Rebinding nicht greift.

## 5. Dashboard

Projekt → Einstellungen → Tab/Seite **Webhooks** (`/projects/:id/settings#webhooks` oder eigene Route `/projects/:id/webhooks` im Kontextmenü unter „Entwickeln“):
- Liste: URL, Environments, Status (an/aus, letzte Zustellung ✓/✗), Aktionen.
- Anlegen/Bearbeiten-Dialog: URL, Beschreibung, Environments (Mehrfachauswahl, leer = alle). Nach Anlage: Secret einmalig mit Kopieren-Button + Hinweis zur Signaturprüfung (Code-Beispiel Node).
- Detail: Zustellprotokoll (Zeit, Event, Status, Code, Dauer), „Erneut senden“, „Test senden“, „Secret rotieren“, aktivieren/deaktivieren, löschen (Bestätigungsdialog).
- Projekt-Einstellungen zeigen die Live-Stream-URL und ein Beispiel für ETag-Polling.

## Tests

Unit: Version-Inkrement + Debounce (Fake Timers), ETag-Berechnung/304-Pfad, SSE-Handler (Events, Heartbeat, Limits, Last-Event-ID), ChangeBus In-Memory, Signatur (bekannter Testvektor), Retry-Plan, SSRF-Blockliste (IPv4/IPv6/Hostnamen), Auto-Deaktivierung, Zugriffsrechte der Webhook-API (Nicht-Mitglied 404, MEMBER kein Schreiben). Integration/E2E gegen echte MongoDB + lokalen Webhook-Empfänger (mit `WEBHOOK_ALLOW_PRIVATE=true`): Flag umschalten → Version steigt, SSE-Client erhält `flags-changed`, Webhook kommt signiert an, ETag-Request vorher 200 / nachher 304 bzw. neue Version 200.

## Nicht im Scope

SDK-Änderungen (eigenes Teilprojekt), Webhooks auf Org-Ebene, weitere Event-Typen (z. B. Mitglieder), Ende-zu-Ende-Verschlüsselung der Secrets.
