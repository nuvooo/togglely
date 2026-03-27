# Togglely - Verbesserungsplan (Team-Meeting Ergebnis)

> Erstellt am: 2026-03-27
> Teilnehmer: Architekt, Open Source Experte, UI/UX Experte, Developer, Tester

---

## Phase 1: Security & Stability (Sprint 1)

### Issue #1: `fix(backend): remove console.log token exposure`
**Labels:** `priority:critical` `type:bugfix` `role:developer` `phase:1`

**Problem:**
`password-reset.service.ts:32` loggt Password-Reset-Tokens in die Konsole. `brands.service.ts` enthaelt 7 weitere console.log Statements.

**Akzeptanzkriterien:**
- [ ] Alle `console.log` in `password-reset.service.ts` entfernt/durch `Logger.debug()` ersetzt
- [ ] Alle `console.log` in `brands.service.ts` entfernt/durch `Logger.debug()` ersetzt
- [ ] Keine Tokens/Secrets in Logs sichtbar
- [ ] `npm run build` + `npm run biome:check` sauber

**Dateien:** `backend/src/modules/password-reset/password-reset.service.ts`, `backend/src/modules/brands/brands.service.ts`

---

### Issue #2: `fix(backend): add DTO validation for auth endpoints`
**Labels:** `priority:critical` `type:bugfix` `role:developer` `role:tester` `phase:1`

**Problem:**
Login/Register akzeptieren rohe Body-Objekte ohne Validierung. Keine Email-Validierung, keine Passwort-Policy.

**Akzeptanzkriterien:**
- [ ] `LoginDto` mit `@IsEmail()` und `@MinLength(8)` erstellt
- [ ] `RegisterDto` mit Email-, Passwort- und Namens-Validierung
- [ ] Passwort-Policy: min 8 Zeichen, Gross-/Kleinbuchstaben, Zahl
- [ ] Auth Controller nutzt DTOs statt roher Body-Objekte
- [ ] Validierungs-Tests geschrieben

**Dateien:** `backend/src/modules/auth/auth.controller.ts`, `backend/src/modules/auth/dto/` (neu)

---

### Issue #3: `fix(backend): implement global exception filter`
**Labels:** `priority:critical` `type:feature` `role:architekt` `role:developer` `phase:1`

**Problem:**
Fehlerantworten inkonsistent. Manche liefern `{ error: 'msg' }` mit Status 200, andere NestJS Exceptions. Prisma-Fehler nicht gemappt.

**Akzeptanzkriterien:**
- [ ] `GlobalExceptionFilter` implementiert (`@Catch()`)
- [ ] Prisma-Fehler gemappt (P2002 -> 409 Conflict, P2025 -> 404 Not Found)
- [ ] Einheitliches Format: `{ statusCode, message, error, timestamp }`
- [ ] Keine Stack-Traces in Production
- [ ] Tests geschrieben

**Dateien:** `backend/src/shared/filters/` (neu), `backend/src/main.ts`

---

### Issue #4: `fix(frontend): add React Error Boundary`
**Labels:** `priority:critical` `type:feature` `role:uiux` `role:developer` `phase:1`

**Problem:**
Kein Error Boundary. App crasht mit weissem Bildschirm ohne Feedback.

**Akzeptanzkriterien:**
- [ ] `ErrorBoundary` Komponente erstellt
- [ ] Fallback-UI mit Fehlermeldung und "Seite neu laden" Button
- [ ] `MainLayout` gewrappt
- [ ] i18n-Strings fuer Fehlermeldungen

**Dateien:** `frontend/src/components/ErrorBoundary.tsx` (neu)

---

### Issue #5: `fix(backend): implement deep health check`
**Labels:** `priority:critical` `type:feature` `role:architekt` `phase:1`

**Problem:**
`GET /health` liefert statisch `{status: 'ok'}` ohne DB/Redis zu pruefen.

**Akzeptanzkriterien:**
- [ ] `GET /health/deep` mit MongoDB + Redis Connectivity-Check
- [ ] Latenz-Messung pro Service
- [ ] Status 200 wenn OK, 503 wenn ein Service down
- [ ] Docker Health-Checks angepasst

**Dateien:** `backend/src/modules/health/`

---

### Issue #6: `fix(backend): add rate limiting to auth and SDK endpoints`
**Labels:** `priority:critical` `type:feature` `role:architekt` `role:developer` `phase:1`

**Problem:**
Nur globales Throttling (100 req/60s). Auth-Endpoints und SDK nicht individuell limitiert. Brute-Force-Anfaelligkeit.

**Akzeptanzkriterien:**
- [ ] Auth Endpoints: 5 Versuche/15 Minuten (Login, Register, Password-Reset)
- [ ] SDK Endpoints: 200 req/Minute pro API-Key
- [ ] Konfigurierbar ueber Env-Vars
- [ ] 429 Too Many Requests Response mit Retry-After Header

**Dateien:** `backend/src/modules/auth/`, `backend/src/modules/sdk/`, `backend/src/app.module.ts`

---

### Issue #7: `fix(backend): remove hardcoded secrets and move to config`
**Labels:** `priority:high` `type:bugfix` `role:developer` `phase:1`

**Problem:**
Hardcoded Werte: Demo-Passwort `'demo123!'`, JWT-Expiry `'7d'`, CORS-Default `'*'`, Token-Expiry `+1 hour`.

**Akzeptanzkriterien:**
- [ ] Alle hardcoded Werte in `ConfigService` / Env-Vars verschoben
- [ ] `.env.example` aktualisiert
- [ ] Keine Default-CORS `'*'` in Production

**Dateien:** `backend/src/modules/auth/auth.service.ts`, `backend/src/modules/password-reset/`, `backend/src/main.ts`, `.env.example`

---

## Phase 2: Quality Foundation (Sprint 2-3)

### Issue #8: `refactor(backend): enable TypeScript strict mode`
**Labels:** `priority:high` `type:refactor` `role:architekt` `role:developer` `phase:2`

**Problem:**
`tsconfig.json` hat `strictNullChecks: false`, `noImplicitAny: false`, `strictBindCallApply: false`. TypeScript-Sicherheitsnetz deaktiviert.

**Akzeptanzkriterien:**
- [ ] `strict: true` in `tsconfig.json` aktiviert
- [ ] Alle resultierenden Type-Errors behoben
- [ ] Kein `any` als Workaround
- [ ] `npm run build` erfolgreich

**Dateien:** `backend/tsconfig.json`, diverse Service/Controller-Dateien

---

### Issue #9: `test(backend): add unit tests for core services`
**Labels:** `priority:high` `type:test` `role:tester` `phase:2`

**Problem:**
<5% Test-Coverage. Nur 4 Spec-Files fuer 47 Services. Kein Coverage-Threshold.

**Akzeptanzkriterien:**
- [ ] Tests fuer `AuthService` (Login, Register, JWT)
- [ ] Tests fuer `FlagsService` (Create, Update, Toggle, Delete)
- [ ] Tests fuer `ProjectsService` (Create, Delete, Import/Export)
- [ ] Tests fuer `OrganizationsService` (Create, Members, Roles)
- [ ] Coverage-Threshold: 60% fuer neue Dateien in `jest.config.js`
- [ ] CI prueft Coverage

**Dateien:** `backend/src/modules/*/`, `backend/jest.config.js`

---

### Issue #10: `refactor(backend): add DTOs for all controller endpoints`
**Labels:** `priority:high` `type:refactor` `role:developer` `phase:2`

**Problem:**
Flags, Projects, Environments, ApiKeys, Organizations, Brands Controller nutzen rohe Body-Objekte ohne Validierung.

**Akzeptanzkriterien:**
- [ ] DTOs mit class-validator fuer jeden Controller-Endpoint
- [ ] `UpdateFlagDto`, `UpdateProjectDto`, `CreateEnvironmentDto`, `CreateApiKeyDto`, `CreateBrandDto`
- [ ] Alle DTOs mit Validierungs-Decoratoren
- [ ] Keine rohen `@Body() body: {...}` mehr

**Dateien:** `backend/src/modules/*/dto/` (neu fuer jedes Modul)

---

### Issue #11: `feat(backend): activate audit logging for all mutations`
**Labels:** `priority:high` `type:feature` `role:architekt` `role:developer` `phase:2`

**Problem:**
`AuditLogsService` existiert, wird aber nirgends aufgerufen. Keine Nachvollziehbarkeit von Aenderungen.

**Akzeptanzkriterien:**
- [ ] Audit-Log bei: Flag-Create/Update/Delete/Toggle
- [ ] Audit-Log bei: Project-Create/Delete
- [ ] Audit-Log bei: Member-Add/Remove/Role-Change
- [ ] Audit-Log bei: API-Key-Create/Revoke
- [ ] Log-Eintraege: userId, action, resourceType, resourceId, timestamp, metadata

**Dateien:** `backend/src/modules/audit-logs/`, alle Service-Dateien mit Mutationen

---

### Issue #12: `feat(backend): add database transaction support`
**Labels:** `priority:high` `type:feature` `role:architekt` `phase:2`

**Problem:**
Komplexe Operationen (Project-Deletion = 8 DB-Ops, Org-Deletion, Flag-Creation mit Environments) nutzen keine Transactions. Datenkonsistenz-Risiko.

**Akzeptanzkriterien:**
- [ ] `PrismaService.$transaction()` fuer alle Multi-Step-Operationen
- [ ] Project-Deletion atomar
- [ ] Organization-Deletion atomar
- [ ] Flag-Creation mit Default-Environments atomar

**Dateien:** `backend/src/modules/projects/projects.service.ts`, `backend/src/modules/organizations/organizations.service.ts`

---

### Issue #13: `test(frontend): add unit tests with React Testing Library`
**Labels:** `priority:high` `type:test` `role:tester` `phase:2`

**Problem:**
Null Unit-Tests im Frontend. Nur Cypress E2E Tests vorhanden.

**Akzeptanzkriterien:**
- [ ] Jest + React Testing Library Setup
- [ ] Tests fuer: AuthStore (Login/Logout/Token-Handling)
- [ ] Tests fuer: Theme-Store (Dark/Light/System)
- [ ] Tests fuer: Wiederverwendbare UI-Komponenten
- [ ] Tests fuer: Form-Validierung
- [ ] CI-Integration

**Dateien:** `frontend/package.json`, `frontend/src/**/*.test.tsx` (neu)

---

### Issue #14: `fix(frontend): fix type safety - remove all error:any patterns`
**Labels:** `priority:medium` `type:refactor` `role:developer` `phase:2`

**Problem:**
`error: any` Pattern im gesamten Frontend. Keine typisierten Error-Interfaces.

**Akzeptanzkriterien:**
- [ ] `ApiError` Interface definiert
- [ ] Alle `catch (error: any)` durch typisierte Fehlerbehandlung ersetzt
- [ ] Error-Utility fuer konsistentes Error-Parsing

**Dateien:** `frontend/src/lib/errors.ts` (neu), diverse Seiten/Stores

---

## Phase 3: Professional UX (Sprint 4)

### Issue #15: `feat(frontend): add toast notification system`
**Labels:** `priority:high` `type:feature` `role:uiux` `role:developer` `phase:3`

**Problem:**
App nutzt `browser alert/confirm` fuer Feedback. Unprofessionell und blockierend.

**Akzeptanzkriterien:**
- [ ] Toast-System (sonner oder react-hot-toast) integriert
- [ ] Alle `alert()` und `confirm()` durch Toasts/Confirmation-Dialogs ersetzt
- [ ] Typen: Success, Error, Warning, Info
- [ ] Auto-Dismiss nach 5 Sekunden
- [ ] Accessibility: aria-live Region

**Dateien:** `frontend/src/components/ui/toast.tsx` (neu), alle Seiten mit alert/confirm

---

### Issue #16: `fix(frontend): complete i18n coverage`
**Labels:** `priority:medium` `type:bugfix` `role:uiux` `phase:3`

**Problem:**
50+ hardcoded Strings in Organizations.tsx, FeatureFlags.tsx, ApiKeys.tsx statt i18n-Keys.

**Akzeptanzkriterien:**
- [ ] Alle hardcoded Strings durch `t('key')` ersetzt
- [ ] Neue Keys in `en.ts` und `de.ts` hinzugefuegt
- [ ] Keine hardcoded Strings mehr in JSX

**Dateien:** `frontend/src/pages/Organizations.tsx`, `frontend/src/pages/FeatureFlags.tsx`, `frontend/src/pages/ApiKeys.tsx`, `frontend/src/i18n/locales/`

---

### Issue #17: `refactor(frontend): split FeatureFlags.tsx into smaller components`
**Labels:** `priority:medium` `type:refactor` `role:developer` `role:uiux` `phase:3`

**Problem:**
`FeatureFlags.tsx` = 773 Zeilen. Unuebersichtlich, schwer wartbar.

**Akzeptanzkriterien:**
- [ ] Aufgeteilt in: FlagList, FlagCard, FlagForm, FlagFilters, FlagToggle
- [ ] Jede Komponente < 200 Zeilen
- [ ] Props typisiert
- [ ] Bestehende Cypress-Tests laufen weiter

**Dateien:** `frontend/src/pages/flags/` (neuer Ordner)

---

### Issue #18: `feat(frontend): add code splitting with React.lazy`
**Labels:** `priority:medium` `type:feature` `role:developer` `phase:3`

**Problem:**
Gesamte App in einem Bundle. Kein Lazy Loading fuer Seiten.

**Akzeptanzkriterien:**
- [ ] Alle Page-Komponenten via `React.lazy()` geladen
- [ ] `Suspense` mit Skeleton-Fallback
- [ ] Bundle-Size messbar reduziert
- [ ] Keine Funktionsaenderung

**Dateien:** `frontend/src/App.tsx` oder Router-Konfiguration

---

## Phase 4: DevOps & Scale (Sprint 5-6)

### Issue #19: `feat(devops): add monitoring stack (Prometheus + Grafana)`
**Labels:** `priority:high` `type:feature` `role:architekt` `phase:4`

**Problem:**
Kein Monitoring. Keine Metriken, keine Alerts, keine Dashboards. Bei Production-Ausfall: blind.

**Akzeptanzkriterien:**
- [ ] `docker-compose.monitoring.yml` mit Prometheus + Grafana
- [ ] Backend exportiert Metriken (Request-Count, Latenz, Error-Rate)
- [ ] Grafana-Dashboard fuer: API-Performance, DB-Latenz, Error-Rate
- [ ] Alert-Rules fuer: Hohe Error-Rate, Langsame Responses, Service-Down

**Dateien:** `docker-compose.monitoring.yml` (neu), `backend/src/shared/metrics/` (neu)

---

### Issue #20: `feat(devops): add structured logging with Winston`
**Labels:** `priority:high` `type:feature` `role:architekt` `role:developer` `phase:4`

**Problem:**
Nur Morgan fuer HTTP-Logs. Keine strukturierten Logs, keine Correlation-IDs, kein JSON-Format.

**Akzeptanzkriterien:**
- [ ] Winston als Logger konfiguriert
- [ ] JSON-Log-Format fuer Production
- [ ] Correlation-IDs pro Request
- [ ] Log-Levels konfigurierbar (DEBUG/INFO/WARN/ERROR)
- [ ] Morgan durch Winston HTTP-Logger ersetzt

**Dateien:** `backend/src/shared/logger/` (neu), `backend/src/main.ts`

---

### Issue #21: `feat(devops): add database backup strategy`
**Labels:** `priority:critical` `type:feature` `role:architekt` `phase:4`

**Problem:**
Keine Backup-Strategie. Docker-Volumes ohne Backup = Totalverlust bei Ausfall.

**Akzeptanzkriterien:**
- [ ] Backup-Script fuer MongoDB (`mongodump`)
- [ ] Automatischer taeglicher Backup (Cron)
- [ ] Off-Site Storage (S3 oder aehnlich)
- [ ] Restore-Procedure dokumentiert und getestet
- [ ] Backup-Rotation (30 Tage aufbewahren)

**Dateien:** `scripts/backup.sh` (neu), `docs/backup-restore.md` (neu)

---

### Issue #22: `feat(devops): add staging environment and deployment strategy`
**Labels:** `priority:high` `type:feature` `role:architekt` `phase:4`

**Problem:**
Kein Staging. Kein Blue-Green Deployment. Kein dokumentiertes Rollback.

**Akzeptanzkriterien:**
- [ ] Staging-Environment definiert (staging.togglely.de)
- [ ] Deployment-Procedure dokumentiert (Coolify)
- [ ] Rollback-Procedure: `git revert` + Coolify Redeploy
- [ ] Pre-Production Smoke-Tests definiert

**Dateien:** `docs/deployment.md` (neu), Coolify-Konfiguration

---

### Issue #23: `chore(devops): add Dependabot for automated dependency updates`
**Labels:** `priority:medium` `type:chore` `role:opensource` `phase:4`

**Problem:**
Keine automatischen Dependency-Updates. Security-Vulnerabilities werden nicht entdeckt.

**Akzeptanzkriterien:**
- [ ] `.github/dependabot.yml` konfiguriert
- [ ] Woechentliche Updates fuer: npm (backend, frontend, sdk)
- [ ] Automatische PRs mit Changelog
- [ ] Security-Updates: sofort

**Dateien:** `.github/dependabot.yml` (neu)

---

### Issue #24: `chore(sdk): synchronize package versions and add CHANGELOG`
**Labels:** `priority:medium` `type:chore` `role:opensource` `phase:4`

**Problem:**
Versionen nicht synchron: Core=1.2.5, Wrappers=1.2.4, Workspace=1.1.1. Kein CHANGELOG.

**Akzeptanzkriterien:**
- [ ] Alle SDK-Pakete auf gleiche Version synchronisiert
- [ ] `CHANGELOG.md` erstellt mit bisheriger History
- [ ] Versioning-Workflow dokumentiert
- [ ] React SDK peerDependency auf React 18+ korrigiert

**Dateien:** `sdk/*/package.json`, `CHANGELOG.md` (neu)

---

### Issue #25: `feat(devops): enforce HTTPS and harden CORS`
**Labels:** `priority:high` `type:feature` `role:architekt` `role:developer` `phase:4`

**Problem:**
nginx.conf forciert kein HTTPS. CORS-Default ist `*`. Kein CSRF-Schutz.

**Akzeptanzkriterien:**
- [ ] HTTP -> HTTPS Redirect in nginx.conf
- [ ] CORS-Default NICHT `*` in Production
- [ ] CORS-Origins explizit konfigurierbar
- [ ] Security-Headers gehaertet (HSTS, X-Content-Type-Options, X-Frame-Options)

**Dateien:** `nginx.conf`, `backend/src/main.ts`

---

## Zusammenfassung

| Phase | Issues | Prioritaet | Aufwand |
|-------|--------|-----------|---------|
| Phase 1: Security & Stability | #1-#7 | KRITISCH | Sprint 1 |
| Phase 2: Quality Foundation | #8-#14 | HOCH | Sprint 2-3 |
| Phase 3: Professional UX | #15-#18 | MITTEL | Sprint 4 |
| Phase 4: DevOps & Scale | #19-#25 | HOCH | Sprint 5-6 |

**Gesamt: 25 Issues, 6 Sprints**

### Rollen-Verteilung

| Rolle | Primaere Issues |
|-------|----------------|
| Architekt | #3, #5, #6, #8, #11, #12, #19, #20, #21, #22, #25 |
| Developer | #1, #2, #3, #7, #10, #14, #15, #17, #18, #20, #25 |
| Tester | #2, #9, #13 |
| UI/UX Experte | #4, #15, #16, #17 |
| Open Source Experte | #23, #24 |
