# Ersteinrichtung & Einladungslinks – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Verbindliche Details (Endpunkte, Felder, Regeln) stehen in der Spec `docs/superpowers/specs/2026-11-09-setup-and-invite-links-design.md` – dieser Plan legt Reihenfolge, Dateien, Tests und Abnahme fest. TDD: erst Test, rot sehen, implementieren, grün.

**Goal:** Frische Instanz per Setup-Seite einrichten, danach Registrierung nur per Einladungslink (ohne Mailserver nutzbar).

**Architecture:** Neues Backend-Modul `setup` (Status + einmaliges Setup mit DB-Sperre). Einladungen erhalten gehashte Tokens, optionale E-Mail, Widerruf. `MailService.isEnabled()` steuert Versand. Frontend: Setup-Seite, Einladungsdialog mit Link, überarbeitete Einladungsseite, Login ohne Registrieren.

**Tech Stack:** NestJS 11, Prisma 5 (MongoDB), class-validator, Jest · React 19, React Router 7, vitest.

**Commit-Trailer (jede Nachricht):**
```
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QwoxMtZKrNR4NyJuxLehgT
```

---

## Teil A – Backend (`backend/`)

### A1: Schema
- `prisma/schema.prisma`:
  - `model InstanceLock { id String @id @default(auto()) @map("_id") @db.ObjectId; key String @unique; createdAt DateTime @default(now()); @@map("instance_locks") }`
  - `OrganizationInvite`: `email String?`, `@@unique([organizationId, email])` entfernen (Index `@@index([organizationId, email])` behalten), neu `tokenHash String? @unique`, `revokedAt DateTime?`, `createdById String? @db.ObjectId`; `token` wird `String? @unique` (Legacy).
- `npx prisma generate`; `npx tsc --noEmit`. Commit `feat(setup): schema for setup lock and invite links`.

### A2: MailService.isEnabled
- `src/shared/mail.service.ts` (+ `src/modules/mail/mail.service.ts`, falls dort ebenfalls versendet wird): `isEnabled(): boolean` = `!!config.get('SMTP_HOST')`. Versandmethoden kehren ohne SMTP sofort mit `false` zurück und loggen `debug`.
- Tests: ohne `SMTP_HOST` wird `mailerService.sendMail` nicht aufgerufen.
- Aufrufer (`auth.controller` register/resend, `password-reset.service`) nutzen die Rückgabe; Antworten an Clients unverändert generisch.

### A3: Setup-Modul
- `src/modules/setup/{setup.module,setup.controller,setup.service}.ts`, DTO `dto/setup.dto.ts` (`name` 1–200, `email` IsEmail ≤254, `password` `@IsPasswordPolicy()`, `organizationName` 1–100).
- `GET /api/setup/status` → `{ setupRequired, mailEnabled }`; `POST /api/setup` (Throttle 5/15 min).
- Service: wenn `user.count() > 0` → `ConflictException('Instance is already set up')`. Sonst `instanceLock.create({ data: { key: 'setup' } })` (P2002 → 409), dann in `$transaction`: erneut `user.count()===0` prüfen, User (bcrypt `BCRYPT_ROUNDS`, `emailVerified: true`), Organization (Slug wie `OrganizationsService.create`), Membership OWNER. Antwort `{ token, user }` über `AuthService.issueToken` (AuthService exportieren oder Token-Signatur extrahieren – keine Duplikation).
- Bestehenden `SetupController` (Demo-Reset, `src/modules/auth/setup.controller.ts`) **nicht** mit diesem verwechseln; Routen `/api/setup/reset-demo` bleibt dort. Neuer Controller-Pfad `setup` kollidiert nicht (unterschiedliche Sub-Routen).
- Tests (`setup.service.spec.ts`): Erst-Setup legt alles an + verifiziert; zweiter Aufruf 409; Lock-Kollision 409; Status-Antwort.

### A4: Registrierung schließen
- `auth.controller.ts` `POST register` → `ForbiddenException('Registration is invite-only')`. Throttle bleibt. Test.

### A5: Einladungen
- `organizations.controller.ts` + `organizations.service.ts` (Invite-Logik in den Service ziehen, falls noch im Controller):
  - `createInvite(orgId, actor, { email?, role })`: Rollenregeln wie bisher (`assertCanGrantRole`). Bei `email`: bereits Mitglied → 409; offene Einladung für dieselbe E-Mail → widerrufen und neu anlegen (statt 403). Token `randomBytes(32).toString('hex')`, gespeichert `tokenHash = hashToken(token)`, `expiresAt = +7d`, `createdById`. Mail nur wenn `email && mailService.isEnabled()`. Antwort `{ invite: {id,email,role,expiresAt}, inviteUrl: \`${FRONTEND_URL}/invite/${token}\`, emailSent }`. Audit `invite.created`.
  - `listInvites(orgId)`: offene + in den letzten 30 Tagen angenommene, ohne Token-Felder, mit `status: 'pending'|'accepted'|'expired'|'revoked'`.
  - `revokeInvite(orgId, inviteId)`: `revokedAt = now` (404 wenn fremd/ungültig). Audit `invite.revoked`.
  - DTO `CreateInviteDto.email` optional.
- `auth.controller.ts` Invite-Routen → neuer `InvitesService` (`src/modules/auth/invites.service.ts`):
  - `findValidInvite(token)`: Lookup `tokenHash = hashToken(token)`, Fallback `token = token` (Legacy); gültig nur wenn nicht abgelaufen/angenommen/widerrufen (sonst 404 bzw. 409 „already used“).
  - `GET /auth/invite/:token` → `{ organizationName, role, email, existingUser }` (`existingUser` nur bei gebundener E-Mail, sonst `false`).
  - `POST /auth/invite/:token/register` (DTO `InviteRegisterDto` + `email?`): gebunden → E-Mail aus Einladung, `emailVerified: true`; ungebunden → `email` Pflicht (400), `emailVerified: false`, existiert → 409. Membership anlegen, Einladung `acceptedAt/acceptedById`, Audit `invite.accepted`. Antwort `{ token, user }`.
  - `POST /auth/invite/:token/accept`: gebunden → E-Mail muss passen **und** `emailVerified` (403 sonst); ungebunden → jeder eingeloggte Nutzer. Bereits Mitglied → 409.
  - Annahme atomar: `updateMany({ where: { id, acceptedAt: null, revokedAt: null }, data: {...} })` und `count === 1` prüfen, sonst 409 (verhindert Doppelnutzung).
- Tests (`invites.service.spec.ts`, `organizations` Controller-Spec ergänzen): alle Fälle der Spec-Testliste.

### A6: Prüfen & E2E
- `npx tsc --noEmit`, `npx jest` grün.
- E2E-Skript (Scratchpad, echte MongoDB via `mongodb-memory-server` auf freiem Port, Backend gebaut auf freiem Port, `NODE_ENV=production`, kein `SMTP_HOST`): Status `setupRequired: true` → Setup → Status false → zweites Setup 409 → `register` 403 → ungebundene Einladung erstellen (Antwort enthält `inviteUrl`, `emailSent: false`) → `GET invite` → Registrierung über Link mit E-Mail → eingeloggt, Mitglied mit Rolle → Link erneut nutzen 409 → widerrufene Einladung 404 → gebundene Einladung für bestehenden *unverifizierten* User: accept 403.

## Teil B – Frontend (`frontend/`, neuer Shell, nur Tokens, `npm run lint:colors` erweitern um neue Dateien)

### B1: Setup-Status & Routing
- `src/lib/setup.ts`: `fetchSetupStatus()` (cached Promise) + Hook `useSetupStatus()`.
- `App.tsx`: öffentliche Route `/setup` (`pages/Setup.tsx`); wenn `setupRequired` → `/login`, `/register`, `/` leiten nach `/setup`; ohne Setup-Bedarf `/setup` → `/login`. `/register` → `/login` (Registrierung geschlossen). Tests (Router).

### B2: Setup-Seite
- Zentrierte Karte (Logo, „Togglely einrichten“), Felder Name, E-Mail, Passwort + Bestätigung (Client-Prüfung der Passwort-Policy wie Backend), Organisationsname. Submit `POST /setup` → Token/User wie Login in `authStore` speichern, `refreshWorkspace()`, navigieren zu `/projects`. Fehleranzeige. Test für Validierung + Submit.

### B3: Login
- Link „Registrieren“ entfernen; Hinweis „Kein Konto? Lass dich von einem Admin einladen.“. Unterstützt `?next=` (nur relative Pfade, die mit `/` beginnen und nicht `//`), Redirect nach Login dorthin. Test für `next`-Sanitizing.

### B4: Mitglieder – Einladen
- `pages/organizations/OrganizationMembers.tsx`: Dialog „Einladen“ (Rolle-Select nach Rechten, E-Mail optional). Nach Erfolg: Link-Feld (readonly, Mono) + Kopieren-Button, Hinweis je nach `emailSent`. Tabelle „Einladungen“ (E-Mail oder „Offener Link“, Rolle, Status, läuft ab, „Widerrufen“ mit Bestätigungsdialog). `GET/POST/DELETE /organizations/:id/invites`. Test für Dialog → Link wird angezeigt/kopiert.

### B5: Einladungsseite
- `pages/InviteAccept.tsx`: lädt `GET /auth/invite/:token`; zeigt Org + Rolle.
  - Eingeloggt: „Beitreten“ → `POST accept` → `refreshWorkspace()` → `orgPath(orgId)`.
  - Nicht eingeloggt: Formular Vorname, Nachname, Passwort (+Bestätigung), E-Mail nur wenn ungebunden → `POST register` → einloggen → Org. Link „Ich habe schon ein Konto“ → `/login?next=/invite/<token>`.
  - Fehlerzustände: ungültig/abgelaufen/benutzt.
  - Tests für gebunden/ungebunden/eingeloggt.

### B6: Mail-abhängige Hinweise
- Verifizierungs-/„E-Mail gesendet“-Texte nur wenn `mailEnabled` (aus Setup-Status).

### B7: Prüfen
- `npx tsc --noEmit -p tsconfig.json`, `npm test`, `npm run build`, `npm run lint:colors` grün; Headless-Durchlauf (Controller).
