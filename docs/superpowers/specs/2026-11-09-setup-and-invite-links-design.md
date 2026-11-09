# Ersteinrichtung & Einladungslinks ohne Mailserver

**Status:** abgestimmt am 2026-11-09 · **Scope:** Backend + Frontend (im neuen App-Shell)

## Ziel

Eine frische Togglely-Instanz wird über eine Einrichtungsseite in Betrieb genommen: der erste Nutzer legt sein Konto und die erste Organisation an. Danach ist die freie Registrierung geschlossen – neue Nutzer kommen ausschließlich über Einladungslinks, die Admins erzeugen und selbst weitergeben. Alles funktioniert ohne SMTP; ist SMTP konfiguriert, werden Links zusätzlich gemailt.

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Registrierung nach Setup | geschlossen (kein Schalter) |
| Erster Nutzer | OWNER der ersten Organisation, `emailVerified = true` |
| Instanz-Admin-Rolle | **nicht** eingeführt (YAGNI – es gibt keine instanzweiten Einstellungen) |
| Einladungslinks | 7 Tage gültig, einmalig, widerrufbar, optional an E-Mail gebunden |
| E-Mail-Versand | nur wenn SMTP konfiguriert (`SMTP_HOST` gesetzt) |

## Backend

### Setup
- `GET /api/setup/status` (öffentlich) → `{ setupRequired: boolean, mailEnabled: boolean }`. `setupRequired = (Anzahl User == 0)`.
- `POST /api/setup` (öffentlich, Throttle 5/15 min) Body `SetupDto { name, email, password (Passwort-Policy), organizationName }`.
  - Nur erlaubt, wenn noch kein User existiert, sonst **409**.
  - Race-sicher: Anlage in einer Prisma-Transaktion; vorher und innerhalb der Transaktion `user.count() === 0` prüfen. Zusätzlich ein Sperr-Dokument `instance_settings` mit festem `_id` (`key: "setup"`, unique) per `create` – ein zweiter paralleler Aufruf scheitert an der Unique-Constraint → 409.
  - Legt User (`emailVerified: true`), Organization, Membership (OWNER) an; Antwort wie Login `{ token, user }`.
- Bestehende Installationen (User vorhanden): `setupRequired = false`, nichts weiter zu migrieren.

### Registrierung
- `POST /api/auth/register` → **403** `{ message: "Registration is invite-only" }`, außer im Setup-Fall (kein User) – dort ebenfalls 403 mit Hinweis auf `/setup` (Setup läuft nur über `POST /api/setup`).
- `RegisterDto`/`AuthService.register` bleiben für Einladungs-Registrierung intern nutzbar.

### Einladungen
- Schema `OrganizationInvite`: `email String?` (optional), `@@unique([organizationId, email])` **entfernen** (Mongo behandelt mehrere `null` als Duplikat; außerdem blockiert der Unique-Index heute Re-Invites nach Annahme). Stattdessen im Code: höchstens eine *offene* Einladung pro (Org, E-Mail). Neues Feld `revokedAt DateTime?`, `createdById String? @db.ObjectId`.
- Token: 32 Byte Zufall (hex), gespeichert als **SHA-256-Hash** (`tokenHash`, unique); Klartext nur in der Erstell-Antwort. Lookup per Hash; Fallback-Lookup auf das alte Feld `token` für bestehende Einladungen.
- `POST /organizations/:id/invites` Body `{ email?: string, role }` (ADMIN+, bestehende Rollenregeln). Antwort `{ invite: { id, email, role, expiresAt }, inviteUrl, emailSent: boolean }` – `inviteUrl = ${FRONTEND_URL}/invite/<token>`. E-Mail nur wenn `email` gesetzt **und** SMTP aktiv.
- `GET /organizations/:id/invites` listet offene (nicht angenommen, nicht widerrufen, nicht abgelaufen) und kürzlich angenommene Einladungen, ohne Token.
- `DELETE /organizations/:id/invites/:inviteId` setzt `revokedAt` (statt löschen; Audit-Log-Eintrag).
- Einladung gültig ⇔ nicht abgelaufen, nicht angenommen, nicht widerrufen.
- `GET /auth/invite/:token` → `{ organizationName, role, email|null, existingUser: boolean (nur wenn email gebunden) }`.
- `POST /auth/invite/:token/register` Body `InviteRegisterDto { password, firstName, lastName, email? }`:
  - gebundene Einladung: E-Mail aus Einladung, `emailVerified: true`; Body-E-Mail ignoriert.
  - ungebundene: `email` Pflicht; `emailVerified: false` (Adresse unbewiesen); existiert die E-Mail bereits → 409 „bitte einloggen und Einladung annehmen“.
  - Antwort `{ token, user }` → direkt eingeloggt.
- `POST /auth/invite/:token/accept` (eingeloggt):
  - gebunden: nur wenn `user.email === invite.email` **und** `user.emailVerified` (Schutz gegen Übernahme durch früher frei registrierte Konten).
  - ungebunden: jeder eingeloggte Nutzer (Besitz des Links ist der Nachweis).
  - bereits Mitglied → 409.
- `GET /auth/pending-invites` liefert nur noch **gebundene** Einladungen verifizierter Nutzer (unverändert).
- Alle Mutationen schreiben Audit-Logs (`invite.created|revoked|accepted`).

### Mail-Status
- `mailEnabled = !!SMTP_HOST` (ConfigService) zentral in `MailService.isEnabled()`. `register`/`resend-verification`/`password-reset` senden nur bei aktivem SMTP; `password-reset/request` antwortet ohne SMTP weiterhin generisch (kein Leak), loggt eine Warnung.

## Frontend (neuer Shell, Graphit-Tokens)

- **Setup-Seite** `/setup` (öffentlich, zentrierte Karte): Name, E-Mail, Passwort (+ Bestätigung), Organisationsname → nach Erfolg eingeloggt auf `projectPicker`/Org. `App` lädt einmal `GET /setup/status`; bei `setupRequired` leiten `/login` und `/` auf `/setup` um; sonst ist `/setup` → `/login`.
- **Login:** Link „Registrieren“ entfernt; Hinweis „Kein Konto? Lass dich von einem Admin einladen.“ `/register` → Redirect auf `/login`.
- **Mitglieder-Seite** (`/orgs/:id/members`): Dialog „Einladen“ mit Rolle + optionaler E-Mail; nach Erstellen Link-Feld mit Kopieren-Button, Hinweis ob Mail versendet wurde („Link wurde an … gesendet“ / „Kein Mailserver – Link selbst weitergeben“). Tabelle offener Einladungen (E-Mail oder „Offener Link“, Rolle, läuft ab, Widerrufen).
- **Einladungsseite** `/invite/:token`: zeigt Org + Rolle. Nicht eingeloggt: Formular (Name, Passwort, E-Mail nur bei ungebundenem Link) + „Ich habe schon ein Konto → Einloggen“ (Login mit `?next=/invite/<token>`). Eingeloggt: Button „Beitreten“. Nach Erfolg → Org-Projekte.
- **Verifizierungshinweise** nur wenn `mailEnabled`.

## Tests

Backend: Setup (erst-/zweitmalig, paralleler Aufruf → genau ein Erfolg), Register 403, Invite create/list/revoke inkl. Rollenregeln, Token-Hash-Lookup + Legacy-Token, register gebunden/ungebunden/E-Mail existiert, accept gebunden (verifiziert/unverifiziert/falsche E-Mail) / ungebunden / bereits Mitglied / widerrufen / abgelaufen, mailEnabled-Verhalten. Frontend: Setup-Redirect-Logik, Invite-Dialog (Link anzeigen/kopieren), InviteAccept-Varianten. E2E-Smoke gegen echte MongoDB: frische DB → Setup → Einladung ungebunden → zweiter Nutzer registriert sich → ist Mitglied.

## Nicht im Scope

Instanz-Admin-Rolle/Einstellungsseite, SSO, Nutzerverwaltung über Orgs hinweg.
