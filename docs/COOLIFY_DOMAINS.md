# Coolify Multi-Domain Setup (Supabase-Style)

Dieses Dokument beschreibt das empfohlene Production-Setup mit getrennten Domains für Frontend und Backend - ähnlich wie Supabase es macht.

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                        Coolify                               │
│                                                              │
│  ┌─────────────────┐         ┌─────────────────┐            │
│  │   app.togglely  │         │  api.togglely   │            │
│  │     .de         │         │     .de         │            │
│  │                 │         │                 │            │
│  │   Frontend      │         │    Backend      │            │
│  │   (Port 3000)   │◄───────►│   (Port 4000)   │            │
│  │                 │  API    │                 │            │
│  └─────────────────┘         └────────┬────────┘            │
│                                       │                      │
│                              ┌────────┴────────┐            │
│                              │   MongoDB       │            │
│                              │   Redis         │            │
│                              └─────────────────┘            │
└─────────────────────────────────────────────────────────────┘
         ▲                              ▲
         │                              │
    Browser User                    SDK Client
    (Dashboard)                     (Deine App)
```

## Vorteile dieses Setups

1. **Klare Trennung**: Frontend und Backend sind unabhängig skalierbar
2. **CORS einfacher**: Backend erlaubt beide Domains
3. **Direkter SDK-Zugriff**: SDK spricht direkt mit dem Backend (bessere Performance)
4. **Einfacheres Debugging**: Getrennte Logs und Monitoring

## Coolify Konfiguration

### Schritt 1: Resource erstellen

In Coolify:
1. "New Resource" → "Docker Compose"
2. Docker Compose aus `docker-compose.coolify.yml` importieren

### Schritt 2: Domains konfigurieren

**Backend Domain:**
- Gehe zu: Resource → Backend Service → Settings → Domains
- Füge hinzu: `https://api.deine-domain.de`
- Port: `4000`
- Health Check: `/health`

**Frontend Domain:**
- Gehe zu: Resource → Frontend Service → Settings → Domains
- Füge hinzu: `https://app.deine-domain.de`
- Port: `3000` (oder `80` im Container)
- Health Check: `/`

### Schritt 3: Environment Variables

**Backend Environment:**
```env
NODE_ENV=production
DATABASE_URL=mongodb://mongodb:27017/togglely?replicaSet=rs0
REDIS_URL=redis://redis:6379
JWT_SECRET=dein-super-geheimer-jwt-key
PORT=4000
CORS_ORIGINS=https://app.deine-domain.de,https://deine-website.de
```

**Frontend Environment:**
```env
VITE_API_URL=https://api.deine-domain.de/api
```

**Wichtig**: Das Frontend verwendet jetzt die **Backend-Domain** für API-Calls!

### Schritt 4: SDK Konfiguration

In deiner Anwendung, die das SDK verwendet:

```typescript
import { TogglelyClient } from '@togglely/sdk-core';

const client = new TogglelyClient({
  // Direkt zur Backend API - nicht über Frontend!
  baseUrl: 'https://api.deine-domain.de',
  apiKey: 'togglely_sdk_xxx',
  project: 'my-project',
  environment: 'production',
});

// Flag abfragen
const isEnabled = await client.isEnabled('new-feature');
```

## URLs im Überblick

| Service | URL | Beschreibung |
|---------|-----|--------------|
| Dashboard | `https://app.deine-domain.de` | Web UI für Admins |
| API Docs | `https://api.deine-domain.de/api/swagger` | Swagger UI |
| SDK API | `https://api.deine-domain.de/sdk/flags/...` | Für SDK Clients |
| Health | `https://api.deine-domain.de/health` | Backend Health Check |

## CORS Konfiguration

Das Backend erlaubt automatisch:
1. Alle Origins aus `CORS_ORIGINS` (komma-getrennt)
2. Wildcards: `*.deine-domain.de`
3. `*` (alle Origins) nur wenn explizit gesetzt

**Beispiel:**
```env
# Erlaubt nur diese Domains
CORS_ORIGINS=https://app.deine-domain.de,https://www.deine-website.de

# Oder Wildcard (alle Subdomains)
CORS_ORIGINS=https://*.deine-domain.de

# Nur für Development!
CORS_ORIGINS=*
```

## Fehlersuche

### Backend startet nicht
```bash
# Logs prüfen
docker-compose logs backend

# Häufige Ursachen:
# - MongoDB nicht bereit (Replica Set init)
# - JWT_SECRET nicht gesetzt
# - Port 4000 belegt
```

### CORS Fehler im Browser
```
Access to fetch at 'https://api...' from origin 'https://app...' has been blocked by CORS
```

**Lösung:**
1. Prüfe, ob die Frontend-Domain in `CORS_ORIGINS` steht
2. Backend neu starten nach Env-Änderung
3. Browser-Cache leeren

### SDK kann nicht verbinden
```bash
# Teste direkt:
curl "https://api.deine-domain.de/health"

# Sollte zurückgeben:
# {"status":"ok","timestamp":"..."}

# SDK Endpoint testen:
curl "https://api.deine-domain.de/sdk/flags/my-project/production/my-flag?apiKey=xxx"
```

## Migration von Single-Domain

Falls du von einem Single-Domain Setup migrierst:

1. **Altes Setup** (Frontend proxyt /api und /sdk):
   ```
   togglely.de → Frontend → /api/* → Backend
   ```

2. **Neues Setup** (getrennte Domains):
   ```
   app.togglely.de → Frontend
   api.togglely.de → Backend (direkt)
   ```

3. **SDK Clients updaten**:
   - Ändere `baseUrl` von `https://togglely.de` zu `https://api.togglely.de`

4. **CORS anpassen**:
   - Füge Frontend-Domain zu `CORS_ORIGINS` hinzu

## Lokale Entwicklung

Für lokale Entwicklung bleibt alles gleich:

```env
# Backend .env
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# Frontend .env  
VITE_API_URL=http://localhost:4000/api

# SDK Config
baseUrl: 'http://localhost:4000'
```

## Zusammenfassung

| | Single Domain | Multi Domain (Empfohlen) |
|---|---|---|
| **URLs** | `togglely.de` | `app.togglely.de` + `api.togglely.de` |
| **CORS** | Komplexer (Proxy) | Einfacher (direkt) |
| **Performance** | Gut | Besser (kein Proxy) |
| **Scaling** | Gemeinsam | Unabhängig |
| **Setup** | Einfacher | Etwas komplexer |

Für Production empfehlen wir das **Multi-Domain Setup**!
