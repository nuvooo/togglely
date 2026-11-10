# Targeting-Erweiterungen: Bearbeiten, Brand-Regeln, Zeitfenster, UND/ODER-Gruppen

**Status:** abgestimmt am 2026-11-10 · **Scope:** Backend + Frontend · **Umsetzung:** 4 Pakete, je ein PR, Reihenfolge 1 → 2 → 3 → 4

## Ziel

Targeting-Regeln sollen sich in der Oberfläche bearbeiten lassen, Brands sollen eigene Regeln bekommen können, Regeln sollen zeitlich begrenzt werden können (von–bis), und Bedingungen sollen sich gemischt mit UND/ODER verknüpfen lassen (z. B. `Land = DE UND (Plan = pro ODER Beta = ja)`).

## Ausgangslage

- `TargetingRule` hängt an einer `FlagEnvironment`-Zeile, hat `operator` (AND/OR für alle Bedingungen), `serveValue`, `priority`, `enabled`, `isDefault`. Bedingungen liegen in `RuleCondition`.
- Die SDKs werten nicht selbst aus: der Server liefert fertige Werte (`EvaluationService.evaluateRules`). Antworten haben einen ETag aus der Konfigurationsversion (`ChangeEventsService.getVersion`); Änderungen laufen über `recordChange` → Version +1 → Change-Bus → Live-Stream.
- Brand-Overrides: Existiert eine `FlagEnvironment`-Zeile mit `brandId`, gewinnen deren `enabled`/`defaultValue`. Hat sie eigene Regeln, gelten diese, sonst die Umgebungsregeln. Die SDK-Auswertung kann das bereits; API (`targeting-rules.service.ts`, filtert `brandId: null`) und UI bieten es nicht an.
- UI (`FlagTargetingTab.tsx`): Regeln anlegen, an/aus, löschen. Kein Bearbeiten, keine Brand-Auswahl, keine Priorität.

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| UND/ODER | **Eine Gruppenebene**: Regel verknüpft Gruppen, Gruppe verknüpft Bedingungen; kein beliebig tiefer Baum |
| Brands | **Eigene Regelsätze pro Brand**; ohne eigene Regeln erbt die Brand wie heute |
| Zeitfenster | **Pro Regel**, `activeFrom`/`activeUntil` je optional |
| Zeitwechsel an SDKs | **Scheduler** erhöht die Konfigurationsversion an Fenstergrenzen (ETag + Live-Stream funktionieren unverändert) |
| SDK-Repo | keine Änderung nötig (Auswertung serverseitig, Antwortformat unverändert) |

## Paket 1 – Regel bearbeiten (nur Frontend)

- In `FlagTargetingTab` pro Regel „Bearbeiten“: öffnet denselben Editor wie „Anlegen“, vorbefüllt (Name, Operator, Bedingungen, Wert).
- Speichern → `PATCH /feature-flags/:flagId/targeting-rules/:ruleId` mit geänderten Feldern; `conditions` wird komplett ersetzt (bestehendes Verhalten von `UpdateTargetingRuleDto`).
- Validierung wie beim Anlegen (`validateRuleInput`). Abbrechen verwirft Änderungen.
- Tests: Editor vorbefüllt, PATCH-Body, Fehleranzeige bei 4xx.

## Paket 2 – Eigene Regeln pro Brand

**Backend**
- `GET/POST` der Targeting-Rules akzeptieren optional `brandId` (nur bei Projekten vom Typ `MULTI`, Brand muss zum Projekt gehören, sonst 404).
- `POST` mit `brandId`: existiert keine Brand-Zeile, wird sie angelegt und übernimmt `enabled`/`defaultValue` der Umgebungszeile (Kopie).
- `PATCH`/`DELETE` arbeiten über die Regel-ID; die Zugriffsprüfung bleibt über das Flag.
- `GET` mit `brandId` liefert `{ rules, inherited: boolean }`: `inherited = true`, wenn die Brand keine eigenen Regeln hat (dann sind `rules` die Umgebungsregeln, nur lesend).
- Neuer Endpunkt `DELETE …/targeting-rules?environmentId=&brandId=` („Auf Umgebung zurücksetzen“): löscht alle Regeln der Brand-Zeile; die Brand erbt danach wieder die Umgebungsregeln.
- Jede Mutation ruft `recordChange` für die Umgebung auf (wie heute).

**Frontend**
- Bei `MULTI`-Projekten neben der Umgebungsauswahl eine Brand-Auswahl („Alle Brands (Umgebung)“ + Brands).
- Brand ohne eigene Regeln: geerbte Regeln ausgegraut + Hinweis + Button „Eigene Regeln für diese Brand anlegen“ (Hinweis: An/Aus und Standardwert werden dabei als Override übernommen).
- Brand mit eigenen Regeln: normaler Editor + „Auf Umgebung zurücksetzen“ (mit Bestätigungsdialog).

## Paket 3 – Zeitfenster pro Regel

**Schema** (`TargetingRule`): `activeFrom DateTime?`, `activeUntil DateTime?`, `nextBoundaryAt DateTime?` (nächste noch nicht gemeldete Grenze, indiziert).

**Validierung:** `activeFrom < activeUntil`, falls beide gesetzt. Vergangene Zeitpunkte sind erlaubt (z. B. Ende in der Vergangenheit = Regel abgelaufen).

**Auswertung:** `evaluateRules` überspringt Regeln mit `now < activeFrom` oder `now >= activeUntil` (gleiche Stelle wie `enabled`). `now` wird injiziert (testbar).

**Scheduler** (`RuleScheduleWorker`, Muster wie der Webhook-Worker):
- Alle 30 s: Regeln mit `nextBoundaryAt <= now` laden.
- Pro Regel atomar beanspruchen: `updateMany({ where: { id, nextBoundaryAt: alt }, data: { nextBoundaryAt: nächste Grenze > now oder null } })`. Nur bei `count === 1` → `recordChange` für Projekt/Umgebung der Regel. Damit meldet bei mehreren Instanzen genau eine.
- `nextBoundaryAt` wird bei Anlegen/Ändern der Regel berechnet (nächste Grenze > jetzt oder `null`).
- Deaktivierbar per `RULE_SCHEDULER_DISABLED=true` (analog `WEBHOOK_WORKER_DISABLED`).
- Max. Verzögerung beim Umschalten: ~30 s. Zeitpunkte werden in UTC gespeichert, die UI zeigt/erfasst lokale Zeit.

**Frontend:** Im Regel-Editor optional „Aktiv von“ / „Aktiv bis“ (datetime-local). In der Regelliste ein Badge: „Geplant ab …“, „Aktiv bis …“, „Abgelaufen“.

## Paket 4 – Gemischt UND/ODER (eine Gruppenebene)

**Schema**
- Neues Modell `ConditionGroup { id, ruleId (Cascade), operator RuleOperator, order Int }`.
- `RuleCondition` bekommt `groupId` (Cascade über die Gruppe).
- `TargetingRule.operator` verknüpft künftig die **Gruppen**.

**Migration** (beim Start, idempotent, wie die bestehenden Startup-Migrationen in `PrismaService`): Jede Regel ohne Gruppen bekommt eine Gruppe mit `operator = rule.operator`, alle ihre Bedingungen wandern hinein; `rule.operator` wird `AND`. Verhalten bleibt identisch (eine Gruppe ⇒ Regel-Operator irrelevant).

**API**
- DTO: `groups: [{ operator, conditions: [...] }]` (1–10 Gruppen, insgesamt max. 20 Bedingungen, bestehende Feldvalidierung je Bedingung).
- Rückwärtskompatibel: ein Request mit flachem `conditions` + `operator` wird als eine Gruppe interpretiert (für bestehende Clients/MCP).
- Antworten liefern `groups`; zusätzlich bleibt `conditions` (flach, alle Bedingungen) für Abwärtskompatibilität lesbar.

**Auswertung:** Regel passt, wenn ihre Gruppen gemäß `rule.operator` passen; Gruppe passt gemäß `group.operator` über ihre Bedingungen. Leere Gruppen werden bei der Validierung abgelehnt.

**Frontend:** Editor zeigt Gruppen als Karten („Alle/Eine der folgenden Bedingungen“), dazwischen den Regel-Operator (UND/ODER). „Gruppe hinzufügen“, „Bedingung hinzufügen“ je Gruppe. Eine einzelne Gruppe sieht aus wie der heutige Editor.

## Fehlerbehandlung

- Fremde/ungültige `brandId`, Regel eines anderen Flags → 404 (wie bestehende Zugriffsprüfung).
- Ungültiges Zeitfenster, leere Gruppe, Limits überschritten → 400 mit Feldfehler; UI zeigt ihn am Feld.
- Scheduler-Fehler werden geloggt, der nächste Lauf versucht es erneut (Grenze bleibt unbeansprucht).

## Tests

- Backend: Unit-Tests für `evaluateRules` (Zeitfenster-Grenzen inkl. exakt `activeFrom`/`activeUntil`, Gruppen-Kombinationen AND/OR), Scheduler (Beanspruchung genau einmal, nächste Grenze, deaktivierbar), Migration (idempotent, Verhalten gleich), Controller/Service für Brand-Regeln (Override-Anlage, `inherited`, Zurücksetzen, fremde Brand → 404), DTO-Kompatibilität (flaches `conditions`).
- Frontend: Editor bearbeiten/vorbefüllt, Brand-Auswahl und Erben-Hinweis, Zeitfenster-Eingabe und Badges, Gruppen hinzufügen/entfernen.

## Nicht im Umfang

- Beliebig tiefe Verschachtelung von Bedingungen.
- Zeitfenster für ganze Flags/Umgebungen.
- Regel-Reihenfolge per Drag & Drop (Priorität bleibt wie heute automatisch).

## Nachtrag 2026-11-10: Bedingungen als Baum (wie Home Assistant)

Ersetzt die eine Gruppenebene aus Paket 4 (Entscheidung des Nutzers: voll wie Home Assistant).

- **Modell:** `TargetingRule.conditionTree` (JSON). Knoten: `AND`/`OR`/`NOT` mit `children`, Blatt `condition` (`attribute`, `operator`, `value`). Wurzel ist `AND` oder `OR`. `NOT` trifft zu, wenn **keines** seiner Kinder zutrifft (wie Home Assistant).
- **Grenzen:** max. 20 Bedingungen, Tiefe max. 5, jeder Block ≥ 1 Kind; Eingabe wird serverseitig vollständig validiert und neu aufgebaut (nur bekannte Felder).
- **Alte Regeln:** ohne `conditionTree` werden beim Lesen aus `RuleCondition`/`groupOperators` in einen gleichwertigen Baum übersetzt (Auswertung und API); keine Datenmigration. Schreibvorgänge speichern den Baum und entfernen die alten `RuleCondition`-Zeilen der Regel.
- **API:** neu `conditionTree`; `conditions` (flach) und `groups` werden weiter angenommen und in einen Baum übersetzt. Antwort: `conditionTree` und flaches `conditions` (alle Blätter).
- **Editor:** oben „Alle müssen / mindestens eine muss zutreffen“, darunter Karten für Bedingungen und Blöcke; in jedem Block „+ Bedingung / + UND / + ODER / + NICHT“. Regelliste zeigt die Logik mit Klammern.
