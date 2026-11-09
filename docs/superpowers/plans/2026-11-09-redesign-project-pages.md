# App-Shell Redesign – Plan 2: Projekt-Seiten

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec: `docs/superpowers/specs/2026-11-09-app-shell-redesign-design.md` §3 (Bausteine) und §4 (Seitenmuster). Plan 1 (Shell) ist umgesetzt. TDD für Logik; UI-Tests mit Testing Library. Nur Tokens (`npm run lint:colors`, neue Dateien in die Liste aufnehmen).

**Goal:** Alle Seiten im Projekt-Bereich bekommen den App-Look: einheitliche Seitenköpfe, dichte Tabellen statt Kacheln, Tabs auf Detailseiten, saubere Lade-/Leer-/Fehlerzustände; große Dateien werden zerlegt.

**Rahmen:** Branch `feat/setup-and-notifications`. Funktionalität (Brand-Vererbung, Werte-Editor, Targeting, Webhooks, Environment-Reihenfolge) bleibt unverändert – nur Darstellung/Struktur. Bestehende Tests anpassen, nicht löschen, außer die getestete Komponente entfällt.

**Commit-Trailer:**
```
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QwoxMtZKrNR4NyJuxLehgT
```

## Paket A – Bausteine (`frontend/src/components`)
- `page/PageHeader.tsx`: `title`, `description?`, `breadcrumb?` (Array {label, to?}), `actions?` (ReactNode), `meta?` (Badges). Ein `<h1>`.
- `page/PageToolbar.tsx`: Suchfeld (debounced, `onSearch`), Filter-Chips (`{ id, label, count?, active }`), rechte Aktionen.
- `data/DataTable.tsx`: generisch `columns: { key, header, cell(row), width?, align?, className? }[]`, `rows`, `getRowId`, `onRowClick?` (Zeile als Link/Button tastaturbedienbar), `loading` (Skeleton-Zeilen), `empty` (ReactNode), `stickyHeader`. Semantisches `<table>`.
- `feedback/EmptyState.tsx` (Icon, Titel, Text, Aktion), `feedback/ErrorState.tsx` (Meldung + „Erneut versuchen“).
- `ConfirmDialog` aus `components/members` nach `components/ui/confirm-dialog.tsx` verschieben (Re-Export am alten Ort entfernen, Importe anpassen).
- `ui/badge.tsx`: Varianten `neutral | success | warning | destructive | outline` auf Tokens.
- Tests für DataTable (Rendering, Row-Click per Tastatur, Loading, Empty), PageToolbar (Debounce, Chips).

## Paket B – Feature Flags
- `pages/ProjectDetail.tsx` (910 Zeilen) → `pages/projects/flags/FlagsPage.tsx` + Komponenten in `pages/projects/flags/` (z. B. `FlagsTable.tsx`, `CreateFlagDialog.tsx`, `MultiBrandEnvironmentCard.tsx`).
- SINGLE-Projekte: `DataTable` mit Spalten Name/Key · Typ (Badge) · **ein Switch je Environment** (Spaltenkopf = Environment-Name in Reihenfolge `sortOrder`) · Geändert · Aktionen (Bearbeiten-Wert, Löschen). Klick auf Zeile → Flag-Detail. Nicht-BOOLEAN: Wert-Chip öffnet den bestehenden `FlagValueDialog`.
- MULTI-Projekte: gleiche Tabelle mit Standard-Werten je Environment + aufklappbare Zeile mit Brand-Matrix (bestehende `FlagValueRow`-Logik inkl. Ketten-Symbol) – keine Funktionsänderung.
- `PageToolbar`: Suche (Name/Key), Filter-Chips „Alle / Aktiv in <letztes Environment> / Typ“. „Neues Flag“ (+ `?new=1` öffnet Dialog wie bisher).
- Tests anpassen/ergänzen (Toggle, Wert-Dialog, Multi-Brand-Zeile, Suche/Filter, `?new=1`).

## Paket C – Flag-Detail
- `pages/FeatureFlagDetail.tsx` (1312 Zeilen) → `pages/projects/flags/detail/` mit `FlagDetailPage.tsx` + Tabs: **Umgebungen** (Werte/Schalter je Environment, bei MULTI Brand-Werte je Environment), **Targeting** (bestehende Regel-UI als eigene Komponente), **Brands** (nur MULTI; Übersicht Brand × Environment), **Verlauf** (Audit-Log-Einträge des Flags über `GET /audit-logs/project/:projectId` gefiltert nach `entityId` – falls Backend keinen Filter hat, clientseitig filtern; leer → EmptyState).
- Kopf: Name, Key (Mono + Kopieren), Typ-Badge, Aktionen (Bearbeiten Name/Beschreibung, Löschen mit ConfirmDialog). Tab-Zustand in der URL (`?tab=targeting`).
- Tests portieren.

## Paket D – Experimente
- `ExperimentsList` → Tabelle (Name, Flag, Environment, Status-Badge, Varianten-Anzahl, Start, Aktionen), Status-Filter-Chips, EmptyState. `ProjectQueryBridge` für Experimente entfernen: Seiten lesen `projectId` aus der Route (Router anpassen; Legacy-Redirects bleiben).
- `ExperimentDetail` → PageHeader mit Status + Aktionen (Starten/Pausieren/Abschließen), Tabs **Übersicht · Varianten · Ergebnisse** (Ergebnis-Tabelle + Balken je Variante mit Tokens).
- `CreateExperiment` → Formularseite im Einstellungs-Muster (Sektionen links Titel/Beschreibung, rechts Felder).
- Tests.

## Paket E – Environments, Brands, Einstellungen, SDK-Tester
- `ProjectSettings.tsx` (1167 Zeilen) aufteilen:
  - `pages/projects/environments/EnvironmentsPage.tsx` (Tabelle Name/Key/Reihenfolge mit Hoch/Runter, Flag-Anzahl korrekt: aus `GET /projects/:id` bzw. vorhandener Quelle – kein „undefined flags“ mehr; Anlegen/Bearbeiten/Löschen).
  - `pages/projects/brands/BrandsPage.tsx` (nur MULTI; Tabelle Name/Key/Beschreibung, Link zu Brand-Detail) und `BrandFlags.tsx` → `pages/projects/brands/BrandDetailPage.tsx` mit PageHeader.
  - `pages/projects/settings/ProjectSettingsPage.tsx`: Sektionen Allgemein (Name, Beschreibung, Typ), Erlaubte Origins, Integration (bestehende `IntegrationCard`), Gefahrenzone (Projekt löschen, rot umrandet).
  - Router: `environments`, `brands`, `settings` zeigen jeweils die eigene Seite.
- `SDKTester.tsx` → `pages/projects/sdk/SdkTesterPage.tsx` im Einstellungs-Layout (Konfiguration links, Ergebnis-Matrix + Code rechts), Projekt fest aus der Route (Projekt-Select entfällt; Environment-Select bleibt).
- Tests portieren/ergänzen.

## Abnahme
`npx tsc --noEmit -p tsconfig.json`, `npm test`, `npm run build`, `npm run lint:colors` (alle neuen/umgebauten Dateien in der Liste; Ziel: `src/pages/projects/**` vollständig token-sauber). Headless-Screenshots (Controller) Dark/Light, Desktop/Mobil für Flags (SINGLE + MULTI), Flag-Detail (alle Tabs), Experimente, Environments, Brands, Einstellungen, SDK-Tester; keine Konsolenfehler.
