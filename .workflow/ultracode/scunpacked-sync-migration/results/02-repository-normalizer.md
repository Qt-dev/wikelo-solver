# Result 02: repository normalizer

## Summary

Added a pure SCUnpacked contract normalizer for Wikelo missions, including released-state metadata.

## Evidence

- `lib/server/scunpacked.ts` filters to `MissionGiver: Wikelo`, validates inputs/rewards, normalizes quantities, and preserves `NotForRelease`.
- `tests/backend/scunpacked.test.mjs` covers valid input, malformed input, deduplication, numeric handling, and JSON records.

## Handoff

- Summary: `normalizeScunpackedContracts()` produces recipe-compatible records.
- Changed surfaces: normalized import pipeline.
- Contracts satisfied: outputs/components, reputation, `notForRelease`.
- Assumptions: `contracts/*.json` remains the upstream representation.
- Local checks: focused tests, ESLint, TypeScript, diff check passed.
- Integration evidence: `lib/server/repository-sync.ts` consumes the exported normalizer.
- Risks: upstream schema changes will safely omit invalid contracts rather than importing malformed data.

## Files changed

- `lib/server/scunpacked.ts`
- `tests/backend/scunpacked.test.mjs`
