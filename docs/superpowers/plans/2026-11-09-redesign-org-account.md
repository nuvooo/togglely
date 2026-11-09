# App-Shell Redesign – Plan 3+4: Organisation, Konto, Auth, Übersicht, Bereinigung

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec: `docs/superpowers/specs/2026-11-09-app-shell-redesign-design.md` (§1 IA, §3 Bausteine, §4 Seitenmuster, §5 Bereinigung). Bausteine aus Plan 2 verwenden: `components/page/{PageHeader,PageToolbar}`, `components/data/DataTable`, `components/feedback/{EmptyState,ErrorState}`, `components/ui/confirm-dialog`, `lib/permissions.ts` (`useProjectRole`, `notifyWriteError`, `RoleUnavailableNotice`), `components/auth/AuthLayout`. Nur Tokens. TDD für Logik.

**Branch:** `feat/redesign-org-account` (gestapelt auf `feat/setup-and-notifications`).

**Commit-Trailer:**
```
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QwoxMtZKrNR4NyJuxLehgT
```

## Paket P – Organisation (`/orgs/:orgId/*`)
- **Projekte** (`OrganizationDetail.tsx` → `pages/orgs/projects/OrgProjectsPage.tsx`): PageHeader (Org-Name), DataTable Projekte (Name/Key, Typ-Badge, Environments, Flags, geändert), „Neues Projekt“-Dialog (ADMIN+; `?action=create-project` öffnet ihn), EmptyState.
- **Mitglieder** (`OrganizationMembers.tsx`): auf PageHeader/DataTable umstellen, bestehende Einladungs-/Reset-Link-Funktionen unverändert.
- **API-Keys org-gebunden** (`ApiKeys.tsx` → `pages/orgs/api-keys/ApiKeysPage.tsx`): lädt `GET /api-keys/organization/:orgId` (Backend prüfen/ergänzen: VIEWER+ lesen, maskiert für < ADMIN; Typ, Name, erstellt, zuletzt benutzt, läuft ab, Environment-Bindung falls vorhanden). Anlegen (ADMIN): Name, Typ CLIENT/SERVER mit Erklärung (CLIENT = Browser/öffentlich, SERVER = geheim), Ablauf; Klartext-Key einmalig anzeigen (CopyLinkField, Bestätigungs-Checkbox wie Webhook-Secret). Löschen mit ConfirmDialog. `GET /api-keys/my` bleibt für Abwärtskompatibilität.
- **Audit-Log org-gebunden** (`AuditLogs.tsx` → `pages/orgs/audit-log/AuditLogPage.tsx`): `GET /audit-logs/organization/:orgId` mit Query `limit` (≤200), `cursor`/`before` (createdAt) für „Mehr laden“, Filter `projectId`, `action` (Präfix), `userId` (Backend ergänzen, validiert). DataTable: Zeit, Nutzer, Aktion (übersetzte Labels für bekannte Aktionen, sonst Rohwert), Objekt, Projekt; aufklappbare Zeile mit old/new Werten (JSON, Text).
- **Org-Einstellungen** (`OrganizationSettings.tsx` → `pages/orgs/settings/OrgSettingsPage.tsx`): Abschnitts-Layout wie Projekt-Einstellungen: Allgemein (Name, Beschreibung), Gefahrenzone (Org löschen, Bestätigung durch Eintippen des Namens, nur OWNER; danach `forgetOrg` + `refreshWorkspace`).
- **Org-Liste / Neu** (`OrganizationList.tsx`, `CreateOrganization.tsx`): Liste als DataTable (Name, Rolle, Projekte, Mitglieder), Anlegen als kompakte Formularseite.
- Router auf neue Seiten, alte Dateien löschen, Tests portieren/ergänzen. Backend-Änderungen mit Tests (AccessService, DTO-Validierung).

## Paket Q – Konto, Auth, Übersicht
- **Konto** (`Settings.tsx` → `pages/account/AccountPage.tsx`): Abschnitte Profil (Name, E-Mail read-only), Sicherheit (Passwort ändern; Hinweis: andere Sitzungen werden beendet), Darstellung (Theme, Sprache) – Hash-Anker `#profile/#security/#appearance` beibehalten.
- **Auth-Seiten** (Login, Setup, InviteAccept, ForgotPassword, ResetPassword, VerifyEmail, ResendVerification): einheitlich `AuthLayout` (Logo, Karte, Footer mit Theme/Sprache), gleiche Abstände/Typo, Fehler als Inline-Alert, keine Heroicons/Headless UI. Login: Demo-Hinweis nur bei `?demo=true`; tote `href="#"`-Links entfernen.
- **Übersicht** (`Dashboard.tsx` → `pages/overview/OverviewPage.tsx`): Kennzahlen-Kacheln (Organisationen, Projekte, Flags gesamt, aktiv in Produktion, laufende Experimente), „Zuletzt geändert“ (Flags über alle Projekte des Nutzers, 10 Einträge, Link zum Flag) und Projekte-Tabelle. Backend: `GET /overview` (neues kleines Modul, nur Projekte der Mitgliedschaften des Nutzers; Zählungen per `count`, zuletzt geänderte Flags per `findMany orderBy updatedAt desc take 10`), Tests inkl. Mandantentrennung. Leerzustand für neue Nutzer ohne Org: „Organisation anlegen“-CTA.
- Router anpassen, alte Dateien löschen, Tests.

## Paket R – Bereinigung (nach P und Q)
- Abhängigkeiten `@heroicons/react`, `@headlessui/react`, `@base-ui/react` entfernen, falls ungenutzt (grep), `npm install` und Lockfile minimal.
- `lint:colors` auf `src/pages src/components` (gesamt) ausweiten; verbleibende Roh-Farben ersetzen.
- Biome-Lint-Fehler in neuen/umgebauten Dateien beheben (keine flächige Neuformatierung).
- i18n: ungenutzte Schlüssel entfernen (Skript wie in Plan 2), de/en identisch.
- Abnahme: tsc, Tests, Build, lint:colors grün; Headless-Screenshots aller Seiten Dark/Light Desktop/Mobil ohne Konsolenfehler.
