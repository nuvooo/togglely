# SDK: Echtzeit-Updates & ETag-Caching (`togglely-sdk`)

**Status:** abgestimmt am 2026-11-09 (Teilprojekt 3) · **Repo:** `github.com/nuvooo/togglely-sdk` (lokal `C:\Users\S4196901\Documents\togglely-sdk`) · **Abhängig von:** Backend-Änderungsbenachrichtigung (`docs/superpowers/specs/2026-11-09-change-notifications-design.md`)

## Ziel

`@togglely/sdk-core` hält Flags im Speicher und lädt **nur nach, wenn sich etwas geändert hat**: Live-Verbindung (SSE) zum Backend; bei Problemen automatisch ETag-Polling. Framework-Pakete (react, vue, svelte, vanilla) erben das über den Core.

## Verhalten

- Neue Refresh-Strategie `'realtime'` (neuer **Standard**), bestehende `'manual' | 'interval' | 'stale-while-revalidate'` bleiben.
- **Initialer Abruf** wie heute (`GET /sdk/flags/:project/:env?brandKey&tenantId&context`), zusätzlich `If-None-Match` mit dem zuletzt erhaltenen `ETag`; `304` → Cache bleibt, `lastFetch` aktualisiert, kein `update`-Event.
- **Live-Verbindung:** `GET /sdk/stream/:project/:env` mit API-Key im Header `Authorization: Bearer` (fetch erlaubt Header – kein `?apiKey=` nötig), `Accept: text/event-stream`, `Last-Event-ID` = letzte Version. Eigener SSE-Parser über `ReadableStream` (keine Abhängigkeit; Browser + Node ≥18). Ereignisse:
  - `ready` → merkt Version.
  - `flags-changed` (`data: { version, changes }`) → Abruf mit `If-None-Match` (bei Kontext-/Brand-abhängigen Werten liefert der Server den passenden Stand); bei geänderten Werten `update`-Event.
  - Heartbeat-Kommentare → Watchdog (keine Daten > 60 s → Verbindung neu aufbauen).
- **Reconnect:** exponentieller Backoff mit Jitter (1 s … 30 s). Server-`retry:` wird respektiert.
- **Fallback:** Bei `429` (`code: STREAM_LIMIT`, Antwort enthält `fallback: 'etag-polling'`), `404/405` (älterer Server ohne Stream) oder wiederholten Fehlern → ETag-Polling im `refreshIntervalMs`-Takt (Standard 30 s, min. `minRefreshIntervalMs`); nach 5 min erneuter Stream-Versuch (nicht bei 404/405 – dann bis Neustart Polling). `401/403` → Fehler-Event, keine Endlosschleife.
- **Kontextwechsel** (`setContext`, Brand): sofortiger Abruf (ETag hängt am Kontext). Stream bleibt (gilt pro Projekt/Environment).
- **Lebenszyklus:** `client.destroy()` (neu, bzw. bestehende Aufräum-Methode erweitern) schließt Stream (`AbortController`), Timer, Listener. Browser: bei `document.visibilityState === 'hidden'` länger als 5 min Stream schließen und bei Sichtbarkeit wieder öffnen + ETag-Abruf (optional per Config `pauseWhenHidden`, Standard `true`). Node: Timer `unref()`.
- **Offline/Fehler:** bestehende Offline-Fallback-Logik unverändert; letzter bekannter Stand bleibt nutzbar.
- **Config-Erweiterung:** `refreshStrategy: 'realtime' | …`, `streamPath?` (Standard `/sdk/stream`), `pauseWhenHidden?: boolean`, `onChange?` (Komfort-Callback = `on('update')`).
- **Events:** zusätzlich `'stream-connected' | 'stream-disconnected'` (für Debug/Anzeige), bestehende Events unverändert.

## Kompatibilität

- Alte Server (ohne `/sdk/stream`, ohne ETag): Stream → 404 → dauerhaft Polling; fehlender ETag → normales 200-Verhalten.
- Öffentliche API rückwärtskompatibel; Versionssprung **1.3.0** (neues Standardverhalten dokumentiert, `refreshStrategy: 'manual'` stellt altes Verhalten her).
- `README` (Core + Framework-Pakete): Abschnitt „Echtzeit-Updates & Caching“, Webhook-Hinweis für Server.

## Tests

Unit (Jest, fetch gemockt, Fake-Timers): SSE-Parser (mehrzeilige `data`, `id`, `event`, Kommentare, `retry`, chunk-Grenzen mitten in Zeilen/UTF-8), Strategiewechsel bei 429/404/Fehlern, Backoff, Watchdog, `If-None-Match`/304 ohne Update-Event, `flags-changed` → genau ein Abruf, Kontextwechsel → Abruf, `destroy()` räumt alles ab, Visibility-Pause. Integration gegen lokalen Togglely-Server (bestehendes `test:integration`-Muster): Flag im Backend umschalten → `update` innerhalb von ~3 s.

## Nicht im Scope

Veröffentlichung auf npm, Push ins GitHub-Repo (macht der Nutzer bzw. nach Freigabe), Service-Worker-/Persistenz-Cache.
