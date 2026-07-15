# Result 04-integration: Contract integration and verification

## Summary
Integrated all packets, replaced stale sample artifacts/docs, generated a fresh migration, aligned collector URLs and environment names, and corrected UEX integration to current terminal plus marketplace-average feeds.

## Evidence
- `npm run db:generate`: generated `drizzle/0000_legal_mole_man.sql` for 11 tables.
- `npm run lint`: pass.
- `npm test`: production build plus 8/8 Node tests pass.
- `npm run test:collector`: 20/20 assertions pass.

## Handoff
Handoff:
- Summary: local release is production-shaped and ready for private integration.
- Changed surfaces: shared contract, docs, env example, migration, tests, metadata, UEX adapter.
- Contracts satisfied: all full eval-contract surfaces compile and test.
- Assumptions: Sites injects server environment variables and D1 binding as documented.
- Local checks: all required local checks pass.
- Integration evidence: nine routes in production build; collector/backend HMAC contract matches.
- Risks: no live external systems were contacted.

## Files changed
Shared contract, README/env, migration, tests, layout metadata, and integration corrections.

## Decisions
Official UEX `.space` and `.uk` API origins are allowlisted; optional token stays server-only.

## Risks
Private deployment validation remains required before public access.

## Verification run
PASS.

## Open questions
Actual game paths/unp4k arguments are discovered or supplied on the gaming PC.
