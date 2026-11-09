# App-Shell-Redesign (Graphit, Icon-Leiste + Kontext-Spalte)

**Status:** abgestimmt am 2026-11-09 · **Scope:** Frontend (`frontend/`), keine API-Änderungen

## Ziel

Togglely soll wie eine professionelle Desktop-App wirken (Referenz: Supabase/Vercel/Linear) statt wie eine Website mit Top-Navigation – konsistent in Dark **und** Light Mode. Gleichzeitig werden tote Doppel-Seiten entfernt und nicht erreichbare Funktionen (Audit Log) eingebunden.

Mockups: `.superpowers/brainstorm/*/content/app-shell-v3.html` (Layout B), `graphite-modes.html` (Stil).

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Layout | B · Icon-Leiste + Kontext-Spalte |
| Stil | Graphit (neutral Zink), Dark + Light gleichwertig |
| Bedeutungsfarben | Grün = an/aktiv/Erfolg, Rot = löschen/Fehler, Amber = Warnung. Sonst keine Akzentfarbe. |
| Primär-Button | Dark: weiß auf schwarz · Light: schwarz auf weiß |
| Schrift | Geist Variable (UI), Geist Mono (Keys, Code) – beide bereits/neu via `@fontsource-variable` |
| Umfang | Fundament + Shell + alle Seiten + Struktur bereinigen (Weg 3) |
| Flags | Immer im Projekt-Kontext; globale Flag-Liste entfällt (Ersatz: Ctrl+K) |

## 1. Informationsarchitektur

**Icon-Leiste (56 px, immer sichtbar):** Logo → Übersicht · Projekt · Organisation · (unten) Konto · Avatar-Menü (Abmelden).

**Kontext-Spalte (240 px)** je nach Bereich:
- **Übersicht** – keine Spalte; Dashboard nutzt volle Breite.
- **Projekt** – Projekt-Switcher (Popover, Projekte gruppiert nach Org) · Feature Flags · Experimente · Environments · Brands (nur `type = MULTI`) · SDK Tester · Einstellungen.
- **Organisation** – Org-Switcher · Projekte · Mitglieder · API Keys · Audit Log · Einstellungen.
- **Konto** – Profil · Sicherheit (Passwort) · Darstellung (Theme, Sprache).

Der zuletzt genutzte Projekt-/Org-Kontext wird in `localStorage` gemerkt (`workspaceStore`, Zustand), damit „Projekt“ in der Leiste ohne Auswahl funktioniert. Ohne Kontext zeigt der Bereich eine Auswahl-Liste.

**Routen** (alte Pfade leiten per `<Navigate replace>` weiter):

```
/                              → /overview
/overview
/projects/:projectId           → …/flags
/projects/:projectId/flags
/projects/:projectId/flags/:flagId
/projects/:projectId/experiments            (+ /new, /:experimentId)
/projects/:projectId/environments
/projects/:projectId/brands                 (+ /:brandId)
/projects/:projectId/sdk
/projects/:projectId/settings
/orgs/new
/orgs/:orgId                   → …/projects
/orgs/:orgId/projects | members | api-keys | audit-log | settings
/account                       (Tabs: profile | security | appearance)
```

Redirects: `/dashboard`, `/organizations…`, `/projects/:id/settings`, `/projects/:id/brands/:brandId/flags`, `/feature-flags/:id` (Projekt über API auflösen), `/experiments…`, `/api-keys`, `/settings`, `/sdk-tester`.

**Mobil (< 768 px):** Icon-Leiste wird zur unteren Tab-Leiste, Kontext-Spalte zum Drawer (Hamburger in der Seiten-Kopfzeile).

**Command-Palette (Ctrl/Cmd+K, `cmdk`):** Navigation, Projekte, Flags des aktuellen Projekts, Aktionen (Neues Flag, Theme wechseln, Abmelden).

## 2. Fundament

- **Tokens** in `src/index.css` (`:root` / `.dark`), Graphit-Werte aus dem Mockup: `background, foreground, card, muted, muted-foreground, border, input, ring, primary, primary-foreground, success, success-foreground, warning, destructive, sidebar, sidebar-accent`. Keine fest kodierten Farbklassen (`bg-green-50`, `text-gray-900`, `bg-white` …) mehr in Seiten – nur Tokens. Ein Test-Skript (`npm run lint:colors`) schlägt bei Roh-Farbklassen in `src/pages` und `src/components` fehl.
- **Dark-Mode** bleibt klassenbasiert (`.dark` auf `<html>`, `darkMode: 'class'` – heute gefixt).
- **Radius** 8 px Standard, 12 px für Container; feine 1-px-Linien statt Schatten.
- **Bibliotheken bereinigen:** Icons nur `lucide-react`; Headless nur Radix. Entfernen: `@heroicons/react`, `@headlessui/react`, `@base-ui/react` (sofern nur in toter/umgebauter Nutzung). Neu: `cmdk`, `@radix-ui/react-switch`, `@radix-ui/react-tooltip`, `@radix-ui/react-popover`, `@fontsource-variable/geist-mono`.

## 3. Bausteine (`src/components`)

| Baustein | Zweck |
|---|---|
| `shell/AppShell` | Rail + Kontext-Spalte + Outlet, responsiv |
| `shell/Rail`, `shell/ContextNav`, `shell/WorkspaceSwitcher` | Navigation & Kontextwahl |
| `shell/CommandPalette` | Ctrl+K |
| `page/PageHeader` | Titel, Beschreibung, Breadcrumb, Aktionen |
| `page/PageToolbar` | Suche, Filter-Chips, rechte Aktionen |
| `data/DataTable` | dichte Tabelle (Kopf, Zeilen-Hover, Zeilen-Klick, leere/Lade-Zeilen) |
| `ui/switch` | Flag-Schalter (grün = an), mit Ladezustand |
| `ui/badge` | Typ/Status (neutral, success, warning, destructive) |
| `feedback/EmptyState`, `feedback/ErrorState`, `ui/skeleton` | Leer-, Fehler-, Ladezustände |
| `ui/confirm-dialog` | ersetzt `window.confirm()` |
| `ui/copy-button`, `ui/kbd`, `ui/tooltip` | Details |

Bestehende shadcn-Komponenten (`button`, `input`, `select`, `dialog`, `dropdown-menu`, `tabs`, `card`, `alert`, `label`, `checkbox`, `separator`) werden auf die Tokens/Größen (Höhe 32–36 px, dichter) angepasst, API bleibt.

## 4. Seitenmuster

- **Listen** (Flags, Experimente, Environments, Brands, Projekte, Mitglieder, API Keys, Audit Log): `PageHeader` + `PageToolbar` + `DataTable`. Kacheln entfallen. Flags-Tabelle: Name/Key · Typ · ein Schalter je Environment · geändert.
- **Details** (Flag, Experiment): `PageHeader` mit Status + Tabs (Flag: Umgebungen · Targeting · Brands · Verlauf; Experiment: Übersicht · Varianten · Ergebnisse).
- **Einstellungen** (Projekt, Org, Konto): Sektionen mit Titel/Beschreibung links, Formular rechts; „Gefahrenzone“ unten (rot umrandet).
- **Auth** (Login, Register, Passwort, Einladung, Verifizieren): zentrierte Karte auf ruhigem Hintergrund mit Logo; Demo-Hinweis nur bei `?demo=true`.
- **Übersicht/Dashboard:** Kennzahlen (Projekte, Flags, aktiv in Prod, laufende Experimente) + Liste „Zuletzt geändert“ + Projekte-Tabelle.
- Jede Seite hat Lade- (Skeleton), Leer- und Fehlerzustand; keine Mock-Daten.

## 5. Bereinigung

Löschen: `pages/Organizations.tsx`, `pages/Projects.tsx`, `pages/FeatureFlags.tsx`, `pages/OrganizationDetail.tsx` (Root-Duplikat), `components/Layout.tsx`, `components/Header.tsx`, `components/Sidebar.tsx`, `components/layout/MainLayout.tsx` (ersetzt), `lib/api-hexagonal.ts`, globale Flag-Liste `pages/flags/*` (Inhalte wandern in die Projekt-Flag-Seite). `pages/AuditLogs.tsx` wird unter `/orgs/:orgId/audit-log` eingebunden. Große Dateien (`FeatureFlagDetail` 1.3k, `ProjectSettings` 1.1k Zeilen) werden in Tab-/Sektions-Komponenten zerlegt.

## 6. Nicht im Scope

API-Änderungen, neue Features (außer Erreichbarkeit Audit Log & Command-Palette), Marketing-Website, SDK.

## 7. Qualität & Abnahme

- `npm run build`, `npm test`, `tsc` grün; neue Tests für `workspaceStore`, Redirects (Router-Tests), `DataTable`, `CommandPalette`-Filter, Farb-Lint.
- **Visuelle Abnahme:** Headless-Screenshots (Edge) jeder Hauptseite in Dark + Light, 1440 px und 390 px (mobil), gegen das lokal laufende Backend mit Demo-Daten. Screenshots werden dem Nutzer geschickt.
- Keine Konsolenfehler; Tastaturbedienung (Fokus-Ringe, Ctrl+K, Esc schließt Dialoge).
- Umsetzung in Etappen mit Zwischen-Screenshots: (1) Fundament + Shell, (2) Projekt-Seiten, (3) Org/Konto/Auth/Übersicht, (4) Bereinigung + Feinschliff.
