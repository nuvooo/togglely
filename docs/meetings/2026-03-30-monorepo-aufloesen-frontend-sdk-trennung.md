---
datum: 2026-03-30
thema: "Repo-Trennung: SDK + Landingpage auslagern"
typ: voll
teilnehmer:
  - rolle: Architekt
    relevanz: voll
  - rolle: Open Source Experte
    relevanz: voll
  - rolle: UI/UX Experte
    relevanz: teilweise
  - rolle: Developer
    relevanz: voll
  - rolle: Tester
    relevanz: voll
---

# Team-Meeting: Repo-Trennung — SDK + Landingpage auslagern

**Datum:** 2026-03-30
**Typ:** Volles Meeting
**Ausloeser:** Strategische Entscheidung: SDK und Landingpage in separate Repos auslagern, Hauptrepo Open-Source-freundlicher gestalten.

---

## Phase 1: Briefing

### Zusammenfassung

Aufteilung des Togglely-Monorepos in 3 Repositories:

1. **`togglely`** (dieses Repo) — Backend + Frontend-App (Dashboard), ein Docker-Container. Open Source (MIT).
2. **`togglely-sdk`** (neues Repo, oeffentlich MIT) — SDK-Pakete (Core + React + Vue + Svelte + Vanilla) mit eigener Versionierung und npm-Publishing.
3. **`togglely-website`** (neues Repo) — Landingpage + oeffentliche Docs als Marketing-Site.

Backend + Frontend-Dashboard bleiben zusammen, da sie in einem Docker-Container deployed werden. Auth-Seiten (Login, Register, etc.) bleiben beim Dashboard. Landingpage und Docs-Seite werden ausgelagert.

### Relevanz-Matrix

| Rolle | Relevanz | Begruendung |
|-------|----------|-------------|
| Architekt | Voll betroffen | 3-Repo-Architektur, API-Contracts |
| Open Source Experte | Voll betroffen | OSS-Strategie, SDK-Community, Lizenzierung |
| UI/UX Experte | Teilweise betroffen | Landingpage-Migration, Design-Konsistenz |
| Developer | Voll betroffen | Migration, CI/CD, Docker-Anpassungen |
| Tester | Voll betroffen | Test-Pipelines pro Repo |

---

## Phase 2: Analyse

### Architekt
> Konsultierte Skills: nestjs-best-practices, docker-expert

3-Repo-Struktur ist architektonisch sauber trennbar:

- **SDK → Backend:** Nur Netzwerk-basiert (REST-API). Zero Code-Sharing. SDK-Core hat keine Dependencies.
- **Landingpage → Backend:** Keine direkte Abhaengigkeit. Landingpage verlinkt nur auf `/login`, `/register`, `/docs`.
- **Dashboard → Backend:** REST-API ueber `api.ts` (Axios). Bleiben zusammen im Docker-Container.
- **Dockerfile bleibt** (Multi-Stage: Frontend-Build + Backend-Build in einem Image). Nur Landingpage-Code wird vorher entfernt.

API-Contract zwischen Backend und SDK muss stabil bleiben (`/api/v1/sdk/`).

### Open Source Experte
> Konsultierte Skills: open-source-strategy

Drei separate Repos ist die professionelle Aufstellung:

- **Hauptrepo (MIT):** Self-Hosted-Plattform. Community-fokussiert mit CONTRIBUTING.md, Issue-Templates.
- **SDK-Repo (MIT):** Eigener npm-Publish-Zyklus. Entwickler sehen das SDK als eigenstaendiges Produkt.
- **Website-Repo:** Kann oeffentlich oder privat sein. Marketing-Site mit SEO-Optimierung.

### UI/UX Experte
> Konsultierte Skills: ui-ux-pro-max

Landingpage (`LandingPage.tsx`, 748 Zeilen) ist eine vollstaendige Marketing-Seite mit: Hero, Features, Code-Beispiele, Stats, CTA, Footer. Die `/docs`-Seite gehoert thematisch dazu. Beim Umzug muss das Design-System (Tailwind-Theme, Dark Mode) konsistent bleiben.

### Developer
> Konsultierte Skills: nestjs-best-practices, docker-expert

Implementierungsaufwand: Mittel.

**SDK-Migration:**
- `sdk/` Verzeichnis wird neues Repo-Root
- Workspace-Config bleibt
- Eigene CI/CD (build + test + npm publish)

**Landingpage-Migration:**
- `LandingPage.tsx` + `Docs.tsx` extrahieren
- Eigenes Projekt (React+Vite oder alternatives Framework)
- Eigene CI/CD + Deployment

**Hauptrepo-Bereinigung:**
- `sdk/` entfernen
- Landingpage + Docs aus Frontend entfernen
- Route `/` im Dashboard auf Login/Dashboard redirect aendern
- CI/CD: SDK-Job entfernen

### Tester

| Bereich | Aenderung |
|---------|-----------|
| Hauptrepo | SDK-Job entfernen, E2E ohne Landingpage |
| SDK-Repo | Eigene CI: build + test, Integrationstests mit Docker-Backend |
| Website-Repo | Basic build + deploy Tests |

---

## Phase 3: Diskussion

### Entscheidungen

| # | Thema | Optionen | Entscheidung | Begruendung |
|---|-------|----------|-------------|-------------|
| 1 | Git-History | A) filter-repo / B) Frischer Start | **B) Frischer Start** | Sauberer. History bleibt im Monorepo als Archiv. |
| 2 | SDK-Integrationstests | A) Mock-Server / B) Docker-Backend | **B) Docker-Backend** | Realistischer. docker-compose.test.yml pullt Backend-Image. |
| 3 | SDK-Versionierung | A) Synchron / B) Unabhaengig | **B) Unabhaengig** | SDK hat eigenen Release-Zyklus (aktuell 1.2.6). |
| 4 | Landingpage-Framework | A) React+Vite / B) Neues Framework | **Offen — User entscheidet** | React+Vite ist schnellste Migration. Astro/Next.js waere besser fuer SEO. |
| 5 | API-Contract | A) Informell / B) Versioniert | **B) Versioniert** | `/api/v1/sdk/` beibehalten. Breaking Changes erfordern neue Version. |
| 6 | Dashboard-Root-Route | A) Redirect zu /login / B) Redirect zu /dashboard | **A) Redirect zu /login** | Unauthentifizierte User sehen Login. Authentifizierte werden zu /dashboard weitergeleitet. |

---

## Phase 4: Planung

### Geplante Issues

| # | Titel | Labels | Zugewiesen | Abhaengigkeit |
|---|-------|--------|-----------|---------------|
| 1 | chore: Repo `togglely-sdk` erstellen (oeffentlich, MIT) | role:developer, type:chore | Developer | - |
| 2 | chore: SDK-Code in neues Repo migrieren | role:developer, type:chore | Developer | #1 |
| 3 | chore: SDK CI/CD mit npm-Publish Pipeline | role:developer, type:chore | Developer | #2 |
| 4 | chore: Repo `togglely-website` erstellen | role:developer, type:chore | Developer | - |
| 5 | chore: Landingpage + Docs in Website-Repo migrieren | role:developer, type:chore | Developer | #4 |
| 6 | chore: Website CI/CD + Deployment aufsetzen | role:developer, type:chore | Developer | #5 |
| 7 | chore: sdk/ aus Hauptrepo entfernen | role:developer, type:chore | Developer | #2 |
| 8 | chore: Landingpage + Docs aus Frontend entfernen, Routing anpassen | role:developer, type:chore | Developer | #5 |
| 9 | chore: Hauptrepo CI/CD anpassen | role:developer, type:chore | Developer | #7, #8 |
| 10 | docs: SDK README + CONTRIBUTING pro Paket | role:opensource, type:docs | Open Source Experte | #2 |
| 11 | docs: Hauptrepo OSS-Readiness (README, CONTRIBUTING, Templates) | role:opensource, type:docs | Open Source Experte | #7 |
| 12 | test: SDK-Integrationstests mit Docker-Backend | role:tester, type:test | Tester | #2 |

---

## Phase 5: Naechste Schritte

### Action Items

| # | Aufgabe | Verantwortlich | Prioritaet |
|---|---------|---------------|-----------|
| 1 | Repo `togglely-sdk` erstellen + SDK migrieren | Developer | critical |
| 2 | SDK CI/CD aufsetzen (build, test, npm publish) | Developer | high |
| 3 | Repo `togglely-website` erstellen + Landingpage migrieren | Developer | high |
| 4 | Hauptrepo bereinigen (sdk/ + Landingpage entfernen) | Developer | high |
| 5 | Dashboard-Routing anpassen (/ → /login redirect) | Developer | high |
| 6 | SDK-Dokumentation pro Paket | Open Source Experte | medium |
| 7 | Hauptrepo OSS-Readiness | Open Source Experte | medium |
| 8 | SDK-Integrationstests mit Docker-Backend | Tester | medium |

### Review-Zuordnung

| Reviewer | Prueft |
|----------|--------|
| Architekt | API-Contract, Repo-Struktur, Docker-Stabilitaet |
| Tester | Test-Pipelines, Integrationstests |
| UI/UX Experte | Landingpage nach Migration, Design-Konsistenz |
| Open Source Experte | Lizenzen, README, npm-Publishing |

---

*Protokoll erstellt am 2026-03-30 durch Team-Meeting Skill v1.0.0*
*Aktualisierung: 3-Repo-Struktur (Backend+Dashboard, SDK, Website)*
