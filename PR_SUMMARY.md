# PR Summary

## What changed

This branch completes a cleanup/refactor pass around the SDK/backend integration and adds baseline repository quality automation.

### Backend cleanup
- tightened SDK-related backend logging
- added validation scripts
- extracted SDK HTTP utilities into dedicated helpers
- extracted SDK domain helpers into dedicated helpers
- added focused tests for the extracted helper modules

### Repository quality / CI
- added a GitHub Actions CI workflow
- CI now runs:
  - backend: install, typecheck, test, build
  - frontend: install, build
  - sdk: install, build, test
- added a conservative Biome baseline config
- added root scripts for formatting/checking with Biome

## Why

The goal of this pass was to make the codebase cleaner, easier to maintain, and safer to evolve without changing behavior unnecessarily.

In particular:
- backend SDK logic is now less tangled and easier to test
- repository quality expectations are documented
- CI gives immediate feedback on core regressions
- Biome is introduced carefully as tooling groundwork without forcing a massive formatting churn yet

## Follow-up suggestions

- add frontend unit/integration tests to CI beyond build-only validation
- enable `biome:check` in CI once the codebase has been normalized
- add coverage reporting/artifacts if desired
- open a follow-up PR for stricter production-readiness checks

## Notes

Current branch: `fix/sdk-refresh-strategy`
