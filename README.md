# 🚩 Flagify - Feature Flag Management Platform

Eine vollständige, selbstgehostete Feature Flag Management Plattform ähnlich wie LaunchDarkly. Verwalten Sie Feature Flags, Organisationen, Projekte und Umgebungen mit einer modernen Web-Oberfläche und einer leistungsstarken API.

## ✨ Features

- 🔐 **Benutzer-Authentifizierung & Autorisierung**
  - JWT-basierte Authentifizierung
  - Rollenbasierte Zugriffskontrolle (Owner, Admin, Member, Viewer)
  - Organisation-basierte Multi-Tenant-Architektur

- 🏢 **Organisationen & Projekte**
  - Mehrere Organisationen pro Benutzer
  - Projekte innerhalb von Organisationen
  - Team-Management mit Einladungen

- 🌍 **Umgebungen**
  - Entwicklung, Staging, Production
  - Unabhängige Flag-Zustände pro Umgebung

- 🚦 **Feature Flags**
  - Verschiedene Typen: Boolean, String, Number, JSON
  - Targeting-Regeln mit Bedingungen
  - Echtzeit-Aktualisierungen

- 📊 **Audit Logs**
  - Nachvollziehbarkeit aller Änderungen
  - Filterung nach Benutzer, Projekt, Entität

- 🔑 **API Keys**
  - Server, Client und SDK Keys
  - Ablaufdaten und Widerruf

- 🚀 **SDK für verschiedene Sprachen**
  - Offizielles JavaScript/TypeScript SDK
  - Einfache Integration in Anwendungen

## 🚀 Schnellstart

### Voraussetzungen

- Docker 20.10+
- Docker Compose 2.0+

### Installation

1. **Repository klonen oder herunterladen**

```bash
git clone <repository-url>
cd flagify
```

2. **Konfiguration anpassen (optional)**

```bash
# Kopieren Sie die Beispiel-Konfiguration
cp .env.example .env

# Bearbeiten Sie die Werte in .env
```

3. **Docker Container starten**

```bash
docker-compose up -d
```

4. **Auf die Anwendung zugreifen**

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- API Dokumentation: http://localhost:4000/health

### Demo-Zugangsdaten

- **Email**: `demo@flagify.io`
- **Password**: `demo1234`

## 📁 Projektstruktur

```
flagify/
├── backend/           # Node.js/Express Backend API
│   ├── src/
│   │   ├── controllers/   # API Controller
│   │   ├── middleware/    # Express Middleware
│   │   ├── routes/        # API Routes
│   │   ├── services/      # Business Logic
│   │   └── utils/         # Utilities
│   └── prisma/            # Database Schema
├── frontend/          # React/TypeScript Frontend
│   └── src/
│       ├── components/    # React Components
│       ├── pages/         # Page Components
│       └── store/         # Zustand Stores
├── sdk/               # Client SDKs
│   └── javascript/        # JavaScript/TypeScript SDK
└── docker-compose.yml # Docker Compose Konfiguration
```

## 🔧 Entwicklung

### Backend

```bash
cd backend
npm install
npm run dev
```

Umgebungsvariablen:
- `DATABASE_URL` - MongoDB Verbindungs-URL
- `REDIS_URL` - Redis Verbindungs-URL
- `JWT_SECRET` - Geheimer Schlüssel für JWT
- `PORT` - API Port (default: 4000)

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Datenbank-Migrationen

```bash
cd backend
npx prisma migrate dev
npx prisma db seed
```

## 📡 API Endpunkte

### Authentifizierung

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| POST | `/api/auth/register` | Benutzer registrieren |
| POST | `/api/auth/login` | Einloggen |
| GET | `/api/auth/me` | Aktueller Benutzer |

### Organisationen

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/organizations` | Alle Organisationen |
| POST | `/api/organizations` | Organisation erstellen |
| GET | `/api/organizations/:id` | Organisation Details |
| GET | `/api/organizations/:id/members` | Mitglieder anzeigen |

### Projekte

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/projects/organization/:orgId` | Projekte anzeigen |
| POST | `/api/projects/organization/:orgId` | Projekt erstellen |
| GET | `/api/projects/:id` | Projekt Details |

### Feature Flags

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/api/feature-flags/project/:projectId` | Flags anzeigen |
| POST | `/api/feature-flags/project/:projectId` | Flag erstellen |
| POST | `/api/feature-flags/:id/toggle` | Flag umschalten |
| PATCH | `/api/feature-flags/:id/value` | Wert ändern |

### SDK Endpunkte (für Client-Anwendungen)

| Methode | Endpunkt | Beschreibung |
|---------|----------|--------------|
| GET | `/sdk/flags/:environmentKey` | Alle Flags |
| GET | `/sdk/flags/:environmentKey/:flagKey` | Einzelnes Flag |
| POST | `/sdk/evaluate/:environmentKey/:flagKey` | Flag mit Kontext auswerten |

## 💻 SDK Integration

### JavaScript/TypeScript

```bash
npm install @flagify/sdk
```

```typescript
import { FlagifyClient } from '@flagify/sdk';

const client = new FlagifyClient({
  apiKey: 'your-api-key',
  environment: 'production',
  baseUrl: 'https://your-flagify-instance.com'
});

// Boolean Flag prüfen
const isEnabled = await client.isEnabled('new-feature');
if (isEnabled) {
  // Neue Funktionalität anzeigen
}

// String Wert abrufen
const message = await client.getString('welcome-message', 'Welcome!');

// Number Wert abrufen
const limit = await client.getNumber('max-items', 10);

// JSON Konfiguration abrufen
const config = await client.getJSON('app-config', {});

// Mit Kontext (für Targeting)
client.setContext({
  userId: '123',
  email: 'user@example.com',
  country: 'DE'
});
const isEnabledForUser = await client.isEnabled('beta-feature');
```

## 🏗️ Architektur

### Multi-Tenant Architektur

Flagify verwendet eine Organisation-basierte Multi-Tenant-Architektur:

```
Benutzer
  └── Organisationen (Owner, Admin, Member, Viewer)
        └── Projekte
              └── Umgebungen (Dev, Staging, Prod)
                    └── Feature Flags
                          └── Targeting Regeln
```

### Datenbank-Schema

- **MongoDB**: Dokumentenbasierte Datenbank für alle Daten
- **Redis**: Caching für SDK-Anfragen (30s TTL)

### Sicherheit

- Passwörter werden mit bcrypt gehasht
- JWT für Session-Management
- API Keys für SDK-Zugriff
- Rollenbasierte Zugriffskontrolle

## 📝 Umgebungsvariablen

| Variable | Beschreibung | Standard |
|----------|--------------|----------|
| `DATABASE_URL` | MongoDB URL | - |
| `REDIS_URL` | Redis URL | - |
| `JWT_SECRET` | JWT Secret | - |
| `PORT` | API Port | 4000 |
| `NODE_ENV` | Umgebung | development |

## 🧪 Tests

```bash
# Backend Tests
cd backend
npm test

# Frontend Tests
cd frontend
npm test
```

## 📦 Deployment

### Docker Production

```bash
# Build
docker-compose -f docker-compose.yml build

# Start
docker-compose -f docker-compose.yml up -d
```

### Manuelles Deployment

1. MongoDB und Redis installieren
2. Node.js 20+ installieren
3. Backend bauen und starten
4. Frontend bauen und servieren

## 🤝 Beitragen

Beiträge sind willkommen! Bitte folgen Sie diesen Schritten:

1. Fork erstellen
2. Feature Branch: `git checkout -b feature/AmazingFeature`
3. Änderungen committen: `git commit -m 'Add some AmazingFeature'`
4. Branch pushen: `git push origin feature/AmazingFeature`
5. Pull Request erstellen

## 📄 Lizenz

MIT License - siehe [LICENSE](LICENSE) für Details.

## 🙏 Danksagungen

- Inspiriert von LaunchDarkly
- Gebaut mit React, Node.js, MongoDB, Redis
- Icons von Heroicons
