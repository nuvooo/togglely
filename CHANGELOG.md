# Changelog

All notable changes to the Togglely project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.5] - 2026-03-27

### Changed

- **sdk:** Synchronized all SDK package versions to 1.2.5
- **sdk/react:** Updated React peer dependency from `>=16.8.0` to `>=18.0.0` (required by `useSyncExternalStore`)

### Fixed

- **sdk:** Decoupled cached reads from implicit refresh loops ([95c901e])
- **sdk:** Cleaned up unused state variable and updated code examples for SDK integration ([b53bb63])
- **backend:** Hardened auth and API key handling ([41f3341])

### CI

- **ci:** Fixed backend and SDK workflow failures ([41f5a05])
- **ci:** Added GitHub workflow and Biome baseline ([847c8d1])

### Refactored

- **backend:** Reduced unsafe casts and duplicate defaults ([c52ac2f])
- **backend:** Extracted SDK domain helpers ([a64a4bf])
- **backend:** Extracted SDK HTTP utilities ([f3352d5])
- **backend:** Tightened SDK logging and added validation scripts ([ef6d335])

## [1.2.4] - 2026-03-27

### Added

- **frontend:** Added React Error Boundary with i18n fallback UI ([f82e0f9])
- **frontend:** Added toast notifications, code splitting, and lazy loading ([2dcfc30])
- **backend:** Activated audit logging for flag mutations ([e058393])
- **devops:** Added backup/restore scripts and deployment documentation ([aafa7a8])
- **devops:** Added Dependabot for automated dependency updates ([3fc02ee])

### Fixed

- **frontend:** Added missing i18n translations for hardcoded strings ([f2bcfd4])
- **backend:** Added rate limiting to auth and password-reset endpoints ([b20ece7])
- **devops:** Hardened nginx security headers and added static asset caching ([38d5959])

### Refactored

- **frontend:** Split FeatureFlags into smaller components ([79ca58f])
- **backend:** Added DTOs for all controller endpoints ([c91f4be])

### Changed

- **chore:** Migrated Biome config to v2.4.9 and enabled parameter decorators ([7b0ff72])
- **style:** Applied Biome v2.4.9 formatting across entire codebase ([5663eb7])

## [1.0.0] - Initial Release

### Added

- Core SDK with framework-agnostic feature flag management and offline support
- React SDK with hooks-based feature toggle integration
- Vue SDK with composables for feature toggles
- Svelte SDK with store-based feature toggles
- Vanilla JavaScript SDK for framework-independent usage
- Multi-tenant support
- CLI tool (`togglely-pull`) for pulling flag configurations
