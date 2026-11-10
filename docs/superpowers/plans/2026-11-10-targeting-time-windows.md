# Zeitfenster pro Targeting-Regel – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Paket 3 aus `docs/superpowers/specs/2026-11-10-targeting-improvements-design.md`: Regeln greifen nur zwischen `activeFrom` und `activeUntil` (beide optional); SDK-Clients bekommen den Wechsel ohne Datenänderung mit.

**Architecture:** Reine Hilfsfunktionen `isRuleActiveAt` / `nextBoundaryAfter` (`backend/src/modules/sdk/rule-schedule.ts`) werden von der Auswertung, vom Regel-Service (berechnet `nextBoundaryAt`) und vom neuen `RuleScheduleWorker` genutzt. Der Worker erhöht an jeder Fenstergrenze per `ChangeEventsService.recordChange` die Konfigurationsversion → neuer ETag + Live-Stream-Event. Mehrere Instanzen: atomare Beanspruchung per `updateMany` mit altem `nextBoundaryAt` im Filter.

**Tech Stack:** NestJS 11, Prisma 5 (MongoDB), Jest; React 19, Vitest.

---

## Entscheidungen

- Fenster ist halboffen: aktiv, wenn `activeFrom <= now < activeUntil`.
- Schema `TargetingRule`: `activeFrom DateTime?`, `activeUntil DateTime?`, `nextBoundaryAt DateTime?` + Index auf `nextBoundaryAt`. MongoDB: keine Migration, `prisma db push` beim Start legt den Index an.
- API: `activeFrom`/`activeUntil` als ISO-Strings; beim PATCH löscht `null` den Zeitpunkt. `activeFrom >= activeUntil` → 400 (beim PATCH gegen die gespeicherten Werte geprüft). Antworten enthalten beide Felder (ISO oder `null`).
- Worker: alle 30 s, max. 100 fällige Regeln pro Lauf, abschaltbar per `RULE_SCHEDULER_DISABLED=true`. Fehler werden geloggt, die Grenze bleibt unbeansprucht und wird im nächsten Lauf erneut versucht.
- Frontend: zwei `datetime-local`-Felder („Aktiv von“, „Aktiv bis“) im Regel-Editor, Badge in der Liste („Geplant ab …“, „Aktiv bis …“, „Abgelaufen“). PATCH sendet beide Felder immer (auch `null`), damit Leeren funktioniert.

## Tasks

1. `rule-schedule.ts` + Tests (Grenzen exakt, offene Seiten, nächste Grenze).
2. Auswertung: `evaluateRules(rules, context, now = new Date())` überspringt Regeln außerhalb des Fensters + Tests.
3. Schema + DTO + Service (create/update setzen Felder und `nextBoundaryAt`, Validierung, Antwortformat) + Tests.
4. `RuleScheduleWorker` (+ Registrierung im FlagsModule, Doku der Env-Variable in `.env.example`, `docker-compose*.yml`, `coolify.yaml`) + Tests (genau einmal beansprucht, nächste Grenze, recordChange, abschaltbar, Fehler).
5. Frontend: Typen, Hilfsfunktionen (Datum ↔ `datetime-local`, Status), Editor-Felder, Badge, i18n + Tests.
6. Gesamtprüfung Backend/Frontend, Lint.
