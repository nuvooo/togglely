# Eigene Targeting-Regeln pro Brand – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Paket 2 aus `docs/superpowers/specs/2026-11-10-targeting-improvements-design.md`: Brands in MULTI-Projekten können eigene Targeting-Regeln haben; ohne eigene Regeln erben sie die Umgebungsregeln.

**Architecture:** Die SDK-Auswertung kann Brand-Regeln bereits (`sdk.service.ts`: eigene Regeln der Brand-Zeile gewinnen). Es fehlen API und UI. Backend: optionales `brandId` an GET/POST, neuer `DELETE …/targeting-rules?environmentId=&brandId=` (Zurücksetzen). Frontend: Brand-Auswahl im Targeting-Tab, Erben-Hinweis, Zurücksetzen mit Bestätigung.

**Tech Stack:** NestJS 11 + Prisma (Jest), React 19 (Vitest + Testing Library).

---

## Entscheidungen (präzisieren die Spec)

- `GET ?environmentId=&brandId=` → `{ rules, inherited }`. `brandId` ohne `environmentId` → 400. Ohne `brandId` bleibt das Verhalten gleich, `inherited: false`.
- `POST` mit `brandId`: Fehlt die Brand-Zeile, wird sie angelegt mit `enabled`/`defaultValue` der Umgebungszeile (die bei Bedarf selbst angelegt wird).
- `DELETE ?environmentId=&brandId=`: löscht alle Regeln (inkl. Bedingungen) der Brand-Zeile. Die Brand-Zeile mit ihren Override-Werten bleibt (Werte setzt man im Brands-Tab zurück). Audit `targeting_rule.brand_reset`, `recordChange` wie bei anderen Mutationen.
- Fremde Brand → 404 über `AccessService.assertBrandInProject`. Ein extra MULTI-Check entfällt: Brands existieren nur in MULTI-Projekten, und das SDK ignoriert Brands sonst ohnehin.
- Brand-Liste im Frontend aus `brandEnvironments` (schon geladen in `FlagDetailPage`), nach Brand-Regel-Änderungen werden die Brand-Werte neu geladen (Override kann entstanden sein).
- Erbt die Brand, sind die angezeigten Regeln nur lesbar (kein Bearbeiten/An-Aus/Löschen); „Regel hinzufügen“ legt die erste eigene Regel an (Priorität 0) und ersetzt die geerbte Liste.

## Tasks

1. **Backend-Tests (rot)** in `backend/src/modules/flags/targeting-rules.spec.ts`: findAll mit Brand (eigene Regeln / geerbt / `brandId` ohne `environmentId` → 400 / fremde Brand → 404), create mit Brand (legt Brand-Zeile mit kopierten Werten an; nutzt vorhandene), Reset (löscht nur Regeln der Brand-Zeile, Audit, recordChange, MEMBER nötig, fremde Brand → 404).
2. **Backend-Implementierung**: DTO `brandId?` (`@IsMongoId() @IsOptional()`), Controller (Query `brandId`, `assertBrandInProject`, neuer `@Delete()`), Service (`findAll` mit `inherited`, `getOrCreateFlagEnvironment` mit Brand, `resetBrandRules`). Doc-Kommentar des Service anpassen. `npm run build && npm test` grün.
3. **Frontend-Tests (rot)** in `FlagDetailPage.test.tsx` (MULTI-Projekt): Brand-Auswahl lädt mit `brandId`; geerbte Regeln mit Hinweis und ohne Bearbeiten-Buttons; erste Brand-Regel wird mit `brandId` und Priorität 0 angelegt und ersetzt die geerbte Liste; Zurücksetzen nach Bestätigung ruft DELETE mit Params; SINGLE-Projekt zeigt keine Brand-Auswahl.
4. **Frontend-Implementierung**: `FlagTargetingTab` Props `brands` + `onBrandRulesChanged`, State `brandId`/`inherited`, Hinweis, Zurücksetzen-Dialog, i18n (de/en). `FlagDetailPage` reicht Brands und `loadBrandValues` durch.
5. **Gesamtprüfung**: Backend build + test, Frontend build + test, Biome lint auf geänderte Dateien.
