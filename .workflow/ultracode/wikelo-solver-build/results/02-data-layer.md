# Result 02: data layer

## Summary
Added a D1 data model, server-only UEX mapping/fetch helpers, a sample-only API payload, and a documented daily unp4k normalization/validation contract.

## Evidence
- `db/schema.ts` defines six tables.
- `drizzle/0000_plain_machine_man.sql` was generated and inspected.
- `scripts/README.md` prohibits automatic game-path discovery, unp4k execution and production writes.

## Handoff
- Summary: Data contracts are ready for an environment-owned extraction/import pipeline.
- Changed surfaces: schema, server helpers, sample API/data and ingestion documentation.
- Contracts satisfied: Patch-scoped recipes, price snapshots, per-user preferences and token-safe UEX client boundary.
- Assumptions: UEX and Discord credentials remain hosted secrets; a local game installation provides the source archive.
- Local checks: Drizzle migration generation succeeded.
- Integration evidence: Production build and render tests passed.
- Risks: No live source data or credentials were available, so payloads are clearly marked sample-only.

## Files changed
- db/schema.ts
- lib/server/recipe-totals.ts
- lib/server/uex.ts
- app/api/sample-snapshot/route.ts
- data/sample-snapshot.json
- scripts/README.md
- scripts/validate-normalized-import.mjs

## Verification run
`npm run db:generate` passed.
