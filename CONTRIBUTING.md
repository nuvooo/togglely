# Contributing to Togglely

Thank you for your interest in contributing to Togglely! This guide will help you get started.

## Project Structure

Togglely is split across multiple repositories:

| Repository | Description | Visibility |
|------------|-------------|------------|
| [togglely](https://github.com/nuvooo/togglely) | Backend (NestJS) + Frontend (React) | Public (MIT) |
| [togglely-sdk](https://github.com/nuvooo/togglely-sdk) | SDK packages (Core, React, Vue, Svelte, Vanilla) | Public (MIT) |
| [togglely-website](https://github.com/nuvooo/togglely-website) | Landing page + Documentation | Private |

For SDK contributions, please head to the [togglely-sdk](https://github.com/nuvooo/togglely-sdk) repository.

## Development Setup

### Prerequisites

- Node.js 20+
- Docker & Docker Compose
- Git

### Getting Started

1. Fork and clone the repository:
   ```bash
   git clone https://github.com/<your-username>/togglely.git
   cd togglely
   ```

2. Start the infrastructure (MongoDB + Redis):
   ```bash
   docker-compose up -d mongodb redis
   ```

3. Install backend dependencies and start:
   ```bash
   cd backend
   cp .env.example .env
   npm install
   npm run start:dev
   ```

4. Install frontend dependencies and start:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

5. Verify everything works:
   ```bash
   cd backend && npm run build && npm test
   cd ../frontend && npm run build
   ```

## Code Style

- **Linter/Formatter:** [Biome](https://biomejs.dev/) - run `npm run biome:check` from the project root
- **TypeScript:** Strict mode, no `any`, no `@ts-ignore`
- **Backend:** Do NOT use `import type` for DI-injected classes (breaks NestJS dependency injection)
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) format:
  - `feat(scope):` New feature
  - `fix(scope):` Bug fix
  - `refactor(scope):` Code restructuring
  - `test(scope):` Adding/updating tests
  - `docs(scope):` Documentation changes
  - `chore(scope):` Maintenance/tooling

## Pull Request Process

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. Make your changes and ensure:
   - All tests pass (`npm test` in backend)
   - Build succeeds (`npm run build` in both backend and frontend)
   - Linting passes (`npm run biome:check` from root)
   - No `console.log` in production code

3. Commit using Conventional Commits format

4. Push and open a Pull Request against `main`

5. Fill out the PR template and wait for review

## Reporting Issues

- Use the [issue tracker](https://github.com/nuvooo/togglely/issues)
- Check existing issues before creating a new one
- Use the provided issue templates (bug report or feature request)

## Architecture Overview

- **Backend:** NestJS 11 with modular architecture (one module per feature)
- **Database:** MongoDB via Prisma 5
- **Caching:** Redis with 30s TTL for SDK endpoints
- **Frontend:** React 19 + Vite + Tailwind CSS + Zustand
- **Auth:** JWT-based with role-based access control

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
