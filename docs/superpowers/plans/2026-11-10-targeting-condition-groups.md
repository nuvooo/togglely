# Gemischt UND/ODER (Bedingungsgruppen) – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Paket 4 aus `docs/superpowers/specs/2026-11-10-targeting-improvements-design.md`: Bedingungen einer Regel lassen sich in Gruppen bündeln, z. B. `Land = DE UND (Plan = pro ODER Beta = ja)`.

**Abweichung von der Spec (Datenmodell):** Statt eines neuen Modells `ConditionGroup` mit eigener Collection und Startup-Migration:
- `RuleCondition.groupIndex Int?` (null = Gruppe 0)
- `TargetingRule.groupOperators RuleOperator[]` (Operator je Gruppe); `TargetingRule.operator` verknüpft die Gruppen.
- Bestehende Regeln (ohne `groupOperators`) sind eine Gruppe mit `operator` → identisches Verhalten **ohne Datenmigration**. Geprüft gegen MongoDB: fehlende Liste wird als `[]`, fehlendes `groupIndex` als `null` gelesen.

**Architecture:** Reine Funktion `groupConditions(rule)` (`backend/src/modules/sdk/condition-groups.ts`) liefert `[{ operator, conditions }]`; Auswertung und API-Antwort nutzen sie. Frontend: eigener Editor-Baustein `RuleConditionsEditor.tsx` (Gruppen + Bedingungen), `FlagTargetingTab` wird dadurch kleiner.

---

## API

- Request: entweder flach `operator` + `conditions` (wie bisher, = eine Gruppe) **oder** `operator` (verknüpft Gruppen) + `groups: [{ operator, conditions }]` (1–10 Gruppen, je ≥ 1 Bedingung, insgesamt ≤ 20). Beides zugleich → 400.
- PATCH nur mit `operator` bei Regeln mit ≤ 1 Gruppe setzt auch den Gruppen-Operator (alte Clients/MCP bleiben korrekt).
- Response: zusätzlich `groups: [{ operator, conditions }]`; `operator` und flaches `conditions` bleiben.

## Tasks

1. `condition-groups.ts` + Tests (Altregel = eine Gruppe mit `operator`, mehrere Gruppen, Reihenfolge).
2. Auswertung über Gruppen + Tests (`A UND (B ODER C)`, `(A UND B) ODER (C UND D)`, Altregeln unverändert).
3. Schema, DTO (`ConditionGroupDto`, `conditions` optional), Service (Speichern mit `groupIndex`/`groupOperators`, Validierung, Antwort `groups`) + Tests.
4. Frontend: Typen + `ruleGroups()`-Fallback, `RuleConditionsEditor`, Anzeige in der Liste `(…) ODER (…)`, Senden flach bei einer Gruppe / `groups` bei mehreren, Vorbefüllen beim Bearbeiten, i18n + Tests.
5. Gesamtprüfung Backend/Frontend, Lint.
