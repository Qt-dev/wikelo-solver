# Packet 02-backend: D1, imports, pricing, and Discord auth

## Objective
Implement the live server-side contract and security boundaries.

## Context
Cloudflare D1/Drizzle and Vinext route handlers; no live credentials during this run.

## Sources
Run plan, eval contract, API contract/types, official Discord and UEX behavior captured in the approved plan.

## Ownership
Backend/auth specialist.

## Do
Implement schema, recipe reads, signed atomic imports, strict UEX matching/price precedence, OAuth/session controls, same-origin preference writes, and targeted tests.

## Do not
Generate migrations, contact live services, store Discord provider tokens, accept fuzzy matches, or activate partial imports.

## Expected output
Server modules, routes, D1 schema, and backend tests.

## Verification
Runtime-independent security/price/import tests and production build.

## Handoff format
Files, evidence, assumptions, contract adherence, remaining risks.

## Write scope
- db/schema.ts
- lib/server/
- app/api/
- app/auth/
- tests/backend/

## Coordination rule
You are not alone in the codebase. Do not revert edits made by others. Adapt to nearby changes.
