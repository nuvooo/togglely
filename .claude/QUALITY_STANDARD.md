# Togglely Quality Standard

This file defines the minimum engineering bar for all future changes in this repository.

## Core Principle

Prefer the best maintainable solution over the fastest patch.

That means:
- prioritize correctness over speed
- prioritize production safety over local convenience
- prefer explicit, testable code over hidden behavior
- reduce duplication instead of spreading similar logic
- improve structure when touching weak areas

## Required Engineering Baseline

### 1. Every change must move the codebase forward
No neutral churn. No cosmetic-only edits without value. No speculative rewrites.

### 2. New logic must be testable
If code cannot be tested, it should be refactored until it can.

### 3. Avoid god-files
Do not add new business or protocol logic to bootstrap/setup files like `backend/src/main.ts`.
Extract helpers, services, constants, or modules instead.

### 4. Prefer centralization over repetition
If error mapping, parsing, defaults, auth extraction, or security checks are repeated, consolidate them.

### 5. Production-first security
- validate inputs
- keep auth and authorization explicit
- avoid permissive defaults unless intentional
- no secrets in code or logs
- no debug logging noise in production paths

### 6. Type safety should increase over time
Do not introduce unnecessary `any`, implicit assumptions, or unsafe null handling.
When touching weakly typed code, improve it incrementally.

### 7. Leave audit trails
Meaningful commits are required for meaningful changes.

## Practical Checklist

Before considering work "done", aim for:
- code is clearer than before
- duplication is reduced
- risk is reduced
- behavior is more consistent
- tests exist for extracted logic where practical
- docs/scripts are updated when they help reliability

## For this project specifically

Current priority order:
1. Backend robustness and maintainability
2. Test coverage for SDK and backend behavior
3. Safer structure and less duplication
4. Stricter validation and typing
5. Cleaner production readiness

This standard is intentionally strict.
If a quick fix conflicts with a durable fix, prefer the durable fix unless an urgent incident requires otherwise.
