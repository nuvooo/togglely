# Togglely API Dokumentation

## Übersicht

### Base URLs

| Service | Local Development | Production (Coolify) |
|---------|------------------|----------------------|
| API | `http://localhost:4000/api` | `https://api.deine-domain.de/api` |
| SDK | `http://localhost:4000/sdk` | `https://api.deine-domain.de/sdk` |
| Frontend | `http://localhost:3000` | `https://app.deine-domain.de` |

## Empfohlene Architektur: Getrennte Domains

Wir empfehlen ein **Supabase-ähnliches Setup** mit getrennten Domains:

```
┌─────────────────┐      ┌─────────────────┐
│   SDK Client    │──────►│ api.togglely.de │
│   (deine App)   │      │   (Backend)     │
└─────────────────┘      └─────────────────┘
                                │
┌─────────────────┐      ┌──────┴──────────┐
│   Browser       │──────►│ app.togglely.de │
│   (Dashboard)   │      │   (Frontend)    │
└─────────────────┘      └─────────────────┘
```

**Vorteile:**
- ✅ Backend direkt für SDK erreichbar (bessere Performance)
- ✅ Klare Trennung der Services
- ✅ Unabhängiges Scaling
- ✅ Einfachere CORS-Konfiguration

### Coolify Setup (Empfohlen)

1. **Zwei Domains in Coolify anlegen:**
   - `api.deine-domain.de` → Backend Service (Port 4000)
   - `app.deine-domain.de` → Frontend Service (Port 80)

2. **Environment Variables:**

   **Backend:**
   ```env
   CORS_ORIGINS=https://app.deine-domain.de
   ```

   **Frontend:**
   ```env
   VITE_API_URL=https://api.deine-domain.de/api
   ```

3. **SDK Client Config:**
   ```typescript
   const client = new TogglelyClient({
     baseUrl: 'https://api.deine-domain.de',  // Direkt zum Backend!
     apiKey: 'togglely_sdk_xxx',
     project: 'my-project',
     environment: 'production'
   });
   ```

Siehe [COOLIFY_DOMAINS.md](./COOLIFY_DOMAINS.md) für detaillierte Anleitung.

## Authentifizierung

### POST /auth/login
**Request:**
```json
{
  "email": "demo@togglely.io",
  "password": "demo123!"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "...",
    "email": "demo@togglely.io",
    "name": "Demo User"
  }
}
```

### POST /auth/register
**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe"
}
```

### GET /auth/me
**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "user": {
    "id": "...",
    "email": "demo@togglely.io",
    "firstName": "Demo",
    "lastName": "User",
    "name": "Demo User",
    "organizationId": "...",
    "organization": {...}
  }
}
```

### PATCH /auth/profile
**Headers:** `Authorization: Bearer <token>`

**Request:**
```json
{
  "firstName": "New",
  "lastName": "Name"
}
```

## Organisationen

### GET /organizations
**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "organizations": [
    {
      "id": "...",
      "name": "Demo Organization",
      "slug": "demo-organization",
      "role": "OWNER"
    }
  ]
}
```

### GET /organizations/my
Eigene Organisation abrufen.

### POST /organizations
**Request:**
```json
{
  "name": "My Org",
  "slug": "my-org"
}
```

### GET /organizations/:id/members
Mitglieder einer Organisation abrufen.

## Projekte

### GET /projects
Alle Projekte des Benutzers abrufen.

**Response:**
```json
{
  "projects": [
    {
      "id": "...",
      "name": "Sample Project",
      "key": "sample-project",
      "type": "SINGLE",
      "environments": [...]
    }
  ]
}
```

### GET /projects/organization/:orgId
Projekte einer Organisation abrufen.

### POST /projects/organization/:orgId
**Request:**
```json
{
  "name": "New Project",
  "key": "new-project",
  "type": "SINGLE",
  "description": "...",
  "allowedOrigins": []
}
```

### GET /projects/:id/flags-with-brands
Projekt mit allen Flags und Brand-Werten abrufen.

## Feature Flags

### GET /feature-flags
Alle Feature Flags abrufen.

**Query:** `?projectId=xxx`

### GET /feature-flags/project/:projectId
Feature Flags eines Projekts abrufen.

### POST /feature-flags/project/:projectId
Feature Flag erstellen.

**Request:**
```json
{
  "name": "Dark Mode",
  "key": "dark_mode",
  "type": "BOOLEAN",
  "description": "...",
  "initialValues": {
    "development": { "enabled": true, "value": "true" },
    "production": { "enabled": false, "value": "false" }
  }
}
```

### POST /feature-flags/:flagId/toggle
Feature Flag togglen.

**Request:**
```json
{
  "environmentId": "...",
  "enabled": true
}
```

### PATCH /feature-flags/:flagId/environments/:envId/value
Wert eines Feature Flags ändern.

**Request:**
```json
{
  "enabled": true,
  "value": "true",
  "brandId": "..." // optional für Brand-spezifische Werte
}
```

### DELETE /feature-flags/:flagId
Feature Flag löschen.

## Brands

### GET /brands/project/:projectId
Brands eines Projekts abrufen.

### GET /brands/:brandId/flags
Flags mit Brand-spezifischen Werten abrufen.

## SDK

### GET /sdk/:projectKey/:environmentKey/:flagKey
Flag-Wert für SDK abrufen.

**Query:** `?brandKey=xxx`

**Response:**
```json
{
  "value": true,
  "enabled": true,
  "flagType": "BOOLEAN"
}
```

## Environments

### GET /environments/project/:projectId
Umgebungen eines Projekts abrufen.

### POST /environments
Umgebung erstellen.

**Request:**
```json
{
  "name": "Staging",
  "key": "staging",
  "projectId": "...",
  "organizationId": "..."
}
```

## API Keys

### GET /api-keys/my
Eigene API Keys abrufen.

### POST /api-keys/organization/:orgId
API Key erstellen.

**Request:**
```json
{
  "name": "SDK Key",
  "type": "SDK",
  "expiresInDays": 365
}
```

## KI-Agenten anbinden (MCP)

Togglely stellt einen MCP-Endpoint (Model Context Protocol) bereit, mit dem KI-Agenten wie Claude Code Feature-Flags direkt anlegen, schalten und aufräumen können.

- Endpoint: `<base>/api/mcp` (Streamable HTTP, stateless – jede Anfrage authentifiziert sich selbst)
- Authentifizierung: `Authorization: Bearer tkm_…` (API-Key-Typ `MCP`)

### Key anlegen

1. Im Dashboard unter der API-Keys-Seite der Organisation einen neuen Key vom Typ **MCP (KI-Agent)** anlegen. Das geht ab der Rolle MEMBER; ADMIN/OWNER sehen und widerrufen alle MCP-Keys, ein MEMBER nur seine eigenen.
2. Ein Key gehört zu **genau einem Projekt**.
3. Pro Key wird festgelegt, in welchen Environments die KI schalten darf („Darf schalten in“, Vorschlag: `development`). Ohne Auswahl kann der Key Flags nur lesen, anlegen und löschen, aber nicht schalten.
4. Der Key wird **nur einmal** angezeigt. Gespeichert wird nur sein Hash.

### Anbinden (Claude Code)

```bash
claude mcp add --transport http togglely https://<host>/api/mcp --header "Authorization: Bearer tkm_…"
```

Der fertige Befehl wird nach dem Anlegen im Dashboard zum Kopieren angezeigt.

### Tools

| Tool | Eingabe | Wirkung |
|---|---|---|
| `get_project` | – | Projekt, Environments (inkl. `canToggle`) und Brands |
| `list_flags` | `search?` | Flags mit Status je Environment/Brand |
| `get_flag` | `flagKey` | Flag-Details mit Status/Wert je Environment und Brand |
| `create_flag` | `key`, `name`, `description?`, `type` (`BOOLEAN`/`STRING`/`NUMBER`/`JSON`) | Legt ein Flag an (überall deaktiviert, mit dem Standardwert des Typs) |
| `update_flag` | `flagKey`, `name?`, `description?` | Ändert Name/Beschreibung |
| `set_flag_state` | `flagKey`, `environmentKey`, `enabled?`, `value?` | Schaltet/setzt den Wert nur im Environment-Default (nicht in Brand-Überschreibungen); nur in freigegebenen Environments |
| `delete_flag` | `flagKey`, `confirm` | Ohne `confirm: true` nur Zustandsübersicht inkl. `blockers`, mit `confirm: true` wird gelöscht |

### Sicherheitsmodell

- **Ein Projekt pro Key:** Flags anderer Projekte sind nicht erreichbar.
- **Environment-Freigabe:** Schalten ist serverseitig nur in den beim Anlegen freigegebenen Environments möglich, sonst liefert das Tool einen Fehler (`isError`). Lesen ist in allen Environments des Projekts möglich. Geschaltet wird nur der Environment-Default, nicht Brand-Überschreibungen.
- **Rechte:** Der Key wirkt mit der aktuellen Rolle seines Erstellers (VIEWER: nur lesen). Wird der Ersteller deaktiviert oder aus der Organisation entfernt, wird der Key abgelehnt.
- **Löschen:** `delete_flag` ist ab MEMBER erlaubt, aber nur, wenn das Flag in allen Environments inklusive Brand-Überschreibungen denselben Zustand hat. Der Ablauf ist zweistufig: erst ohne `confirm` prüfen, dann mit `confirm: true` löschen. Bei abweichenden Zuständen wird die Liste der abweichenden Environments/Brands zurückgegeben. Außerdem blockieren aktive (aktivierte) Targeting-Regeln und nicht beendete Experimente (Status nicht `COMPLETED`/`ARCHIVED`) das Löschen; sie stehen in der Prüfung unter `blockers`. `set_flag_state` ändert nur den Environment-Default – Brand-Überschreibungen und Targeting-Regeln müssen im Dashboard angepasst werden.
- **Rate Limits:** 120 Anfragen/min pro Key und 600 Anfragen/min pro IP.
- **Audit-Log:** Änderungen laufen über dieselben Services wie im Dashboard (Validierung, Change-Events) und erscheinen im Audit-Log mit dem Hinweis „via MCP-Schlüssel“.
- MCP-Keys werden von den SDK-Endpunkten nicht akzeptiert, und der MCP-Endpoint akzeptiert nur MCP-Keys.
