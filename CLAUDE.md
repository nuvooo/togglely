# Togglely - Claude Code Konfiguration

## Projekt
Togglely ist eine Self-Hosted Multi-Tenant Feature Toggle Management Platform.


## KI-Richtlinien
- [KI-Regeln (Kurzfassung)](.claude/AI_RULES.md) - Die 7 Pflichten
- [Entwicklungsrichtlinien](.claude/AGENTS.md) - Detaillierte Regeln fuer KI-Assistenten
- [Quality Standard](.claude/QUALITY_STANDARD.md) - Engineering-Baseline
- [Team-Agenten System](.claude/TEAM.md) - 5 Rollen mit Meeting-Protokoll

## Tech-Stack
- **Backend:** NestJS 11, Prisma 5, MongoDB, Redis, Winston
- **Frontend:** React 19, Vite 8, Tailwind 4, Zustand 5, i18next
- **SDK:** Eigenes Repo: github.com/nuvooo/togglely-sdk (Core + React + Vue + Svelte + Vanilla)
- **Website:** Eigenes Repo: github.com/nuvooo/togglely-website (Landingpage + Docs)
- **DevOps:** Docker, Coolify, GitHub Actions, Prometheus + Grafana

## Wichtige Regeln
- `import type` NICHT verwenden im Backend (bricht NestJS DI)
- Biome: `useImportType: "off"` muss aktiv bleiben
- Conventional Commits: `feat(scope):`, `fix(scope):`, `refactor(scope):`
- Alle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`

## Befehle
```bash
# Backend
cd backend && npm run build && npm test

# Frontend
cd frontend && npm run build && npm test

# Linting
npm run biome:check
```
