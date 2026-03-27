# Togglely Deployment Guide

## Environments

| Environment | URL | Purpose |
|------------|-----|---------|
| Development | `http://localhost:3000` / `:4000` | Local Docker Compose |
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
