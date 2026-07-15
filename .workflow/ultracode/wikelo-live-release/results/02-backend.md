# Result 02-backend: D1, imports, pricing, and Discord auth

## Summary
Implemented the D1 schema, active-patch recipe API, signed imports, UEX refresh, Discord OAuth/session routes, and user-scoped preferences.

## Evidence
Eight total Node tests pass after integration; production build discovers all nine requested API/auth routes.

## Handoff
Handoff:
- Summary: backend contract and security boundaries are implemented.
- Changed surfaces: D1 schema, server modules, public/internal APIs, OAuth routes, backend tests.
- Contracts satisfied: atomic activation, replay protection, incomplete totals, strict mapping, hashed sessions.
- Assumptions: reviewed aliases are administered directly in D1; provider credentials come from Sites secrets.
- Local checks: security/data-policy tests, lint, production build.
- Integration evidence: generated fresh 11-table migration and reconciled UEX current terminal/marketplace feeds.
- Risks: live OAuth, UEX response fixtures, and D1 runtime migration await private deployment.

## Files changed
`db/schema.ts`, `lib/server/`, `app/api/`, `app/auth/`, `tests/backend/`.

## Decisions
Discord provider tokens are discarded; only an app-session token hash is stored. UEX permits exact UUID, reviewed alias, or unique exact normalized name only.

## Risks
External response and cookie behavior need integration testing on the private Sites origin.

## Verification run
PASS.

## Open questions
None for local implementation.
