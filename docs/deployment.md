# Togglely Deployment Guide

## Environments

| Environment | URL | Purpose |
|------------|-----|---------|
| Development | `http://localhost:3000` / `:4000` | Local Docker Compose |
| Staging | `https://staging.togglely.de` / `https://api-staging.togglely.de` | Pre-production testing |
| Production | `https://app.togglely.de` / `https://api.togglely.de` | Coolify |

## Pre-Deployment Checklist

```bash
# 1. Build succeeds
cd backend && npm run build
cd frontend && npm run build
cd sdk && npm run build

# 2. Tests pass
cd backend && npm test
cd sdk && npm test

# 3. Linting clean
npm run biome:check
```

## Deployment via Coolify

### First-Time Setup
1. Create new project in Coolify
2. Connect GitHub repository
3. Set environment variables (see `.env.example`)
4. Configure domains:
   - Backend: `api.togglely.de` -> Port 4000
   - Frontend: `app.togglely.de` -> Port 80
5. Enable auto-deploy on push to `main`

### Regular Deployment
1. Merge PR to `main`
2. Coolify auto-deploys (or manual trigger)
3. Verify health: `curl https://api.togglely.de/health`
4. Verify deep health: `curl https://api.togglely.de/api/health/deep`

## Rollback Procedure

### Quick Rollback (< 5 minutes)
1. Go to Coolify Dashboard
2. Select the deployment
3. Click "Rollback" to previous deployment

### Git Rollback
```bash
# Find last working commit
git log --oneline -10

# Revert the problematic commit
git revert <commit-hash>
git push origin main

# Coolify will auto-deploy the revert
```

## Database Backup & Restore

### Manual Backup
```bash
./scripts/backup.sh ./backups
```

### Automated Daily Backup (Cron)
```bash
# Add to crontab (runs daily at 2 AM)
0 2 * * * cd /path/to/togglely && ./scripts/backup.sh ./backups >> /var/log/togglely-backup.log 2>&1
```

### Restore
```bash
./scripts/restore.sh ./backups/togglely_backup_20260327_020000.tar.gz
```

## Staging Environment

### Setup
1. Create a separate Coolify project for staging
2. Connect the same GitHub repository
3. Set deploy branch to `develop` (not `main`)
4. Configure staging domains:
   - Backend: `api-staging.togglely.de` -> Port 4000
   - Frontend: `staging.togglely.de` -> Port 80
5. Use staging-specific environment variables:
   - `NODE_ENV=staging`
   - `CORS_ORIGINS=https://staging.togglely.de`
   - Separate `DATABASE_URL` pointing to staging DB
   - Separate `JWT_SECRET`

### Staging Workflow
1. Feature branches merge to `develop`
2. Staging auto-deploys from `develop`
3. QA testing on staging environment
4. When ready: merge `develop` to `main`
5. Production auto-deploys from `main`

### Smoke Tests (Post-Deploy)
```bash
# Health check
curl -f https://api-staging.togglely.de/health

# Deep health check
curl -f https://api-staging.togglely.de/api/health/deep

# Auth flow
curl -X POST https://api-staging.togglely.de/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234"}'

# SDK endpoint
curl https://api-staging.togglely.de/sdk/flags/test-project/development \
  -H "X-API-Key: test-key"
```

## Monitoring

### Health Checks
- Liveness: `GET /health` (always returns 200 if process is running)
- Readiness: `GET /api/health/deep` (checks DB connectivity, returns 503 if degraded)

### Logs
```bash
# Coolify logs
# Go to Coolify Dashboard -> Application -> Logs

# Docker logs (local)
docker-compose logs backend --tail 100 -f
docker-compose logs frontend --tail 100 -f
```

## Environment Variables

See `.env.example` for all required variables. Critical ones:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Must be unique per environment |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins |
| `VITE_API_URL` | Yes | Backend API URL for frontend |
| `FRONTEND_URL` | Yes | Frontend URL for email links |
