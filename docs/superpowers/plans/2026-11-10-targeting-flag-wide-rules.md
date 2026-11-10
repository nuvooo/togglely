# Flag-weite Targeting-Regeln – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Statt Regeln pro Umgebung/Brand gibt es eine Regelliste pro Flag. Jede Regel sagt selbst, wo sie gilt: „Umgebung ist (k)eine von …“ und „Brand ist (k)eine von …“ (leer = alle), dazu die Bedingungen/Gruppen (Paket 4) und das Zeitfenster (Paket 3). Ersetzt die Brand-Auswahl aus Paket 2. Entscheidung des Nutzers (2026-11-10): ersetzen + migrieren, Pakete 3–5 zusammen ausliefern.

**Architecture:** `TargetingRule` bekommt `flagId` (Relation zum Flag, Cascade) und den Geltungsbereich `environmentIds[]`/`environmentsExcluded`, `brandIds[]`/`brandsExcluded`; `flagEnvId` wird optional und nur noch von der Migration gelesen. Die SDK-Auswertung lädt die Regeln des Flags und filtert per `ruleAppliesTo(rule, environmentId, brandId)`. An-/Aus und Standardwerte pro Umgebung/Brand bleiben in `FlagEnvironment`.

**Tech Stack:** NestJS 11, Prisma 5 (MongoDB), Jest; React 19, Vitest.

---

## Semantik

- Umgebung passt: Liste leer, oder (nicht ausgeschlossen und Umgebung in Liste), oder (ausgeschlossen und Umgebung nicht in Liste).
- Brand passt: Liste leer, oder eingeschlossen und Anfrage-Brand in Liste (ohne Brand: passt nicht), oder ausgeschlossen und Anfrage-Brand nicht in Liste (ohne Brand: passt).
- Reihenfolge: eine Priorität pro Flag; erste passende Regel gewinnt.

## Migration (beim Start, ohne Marker, idempotent pro Regel)

1. Rohe Normalisierung: fehlende `environmentsExcluded`/`brandsExcluded` → `false` (Prisma kann fehlende Pflicht-Booleans nicht lesen).
2. Für jedes Flag mit Altregeln (`flagId` fehlt, `flagEnvId` gesetzt): Regeln der Zeilen laden, sortieren (Brand-Zeilen zuerst, dann Umgebungszeilen; innerhalb nach alter Priorität), neu durchnummerieren hinter vorhandenen flag-weiten Regeln.
   - Brand-Regel: `environmentIds [E]`, `brandIds [B]`.
   - Umgebungsregel in E: `environmentIds [E]`; hatten Brands in E eigene Regeln: `brandIds [diese]`, `brandsExcluded true` (vorher galten Umgebungsregeln für diese Brands nicht).
   - `flagEnvId` → null. Update nur, solange `flagId` noch fehlt (parallele Instanzen).
   Verhalten bleibt damit exakt gleich.

## Folgeänderungen

- Umgebung/Brand löschen: Id aus allen Regel-Listen entfernen; eine Einschluss-Liste, die dadurch leer würde, löscht die Regel (sonst würde sie plötzlich überall gelten).
- Brand-Relink (`brands.service`): löscht keine Regeln mehr (Regeln hängen nicht mehr an der Brand-Zeile).
- MCP `deleteFlag`-Blocker: aktivierte Regeln des Flags, Ort aus dem Geltungsbereich beschrieben.
- API: `GET …/targeting-rules` liefert alle Regeln des Flags (Filter-Parameter entfallen); `POST`/`PATCH` mit `environmentIds`, `environmentsExcluded`, `brandIds`, `brandsExcluded` (Ids müssen zum Projekt gehören); `DELETE ?environmentId&brandId` (Brand-Reset aus Paket 2) entfällt.
- Frontend: Targeting-Tab ohne Umgebungs-/Brand-Auswahl; Editor oben „Umgebung ist eine von / keine von [Mehrfachauswahl]“ und (MULTI) „Brand …“; Liste zeigt den Geltungsbereich als Badges.

## Tasks

1. `rule-scope.ts` (`ruleAppliesTo`) + Tests.
2. Schema + Normalisierung + Migration + Tests.
3. SDK-Auswertung (Einzel- und Gesamtabruf) auf flag-weite Regeln + Tests.
4. Regel-API (DTO, Controller, Service) + Tests.
5. Umgebung/Brand löschen, Brand-Relink, MCP + Tests.
6. Frontend: Typen, Editor-Geltungsbereich, Liste, Tab ohne Vorauswahl, Tests anpassen.
7. Gesamtprüfung, lokaler Ende-zu-Ende-Test gegen Wegwerf-DB (Migration einer Altregel + SDK-Abruf).
