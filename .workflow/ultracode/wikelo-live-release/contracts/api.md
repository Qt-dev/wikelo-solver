# Downstream contract: live planner API

Producer: backend packet
Consumers: UI and collector packets
Surface: JSON APIs and normalized import envelope
Location: `lib/contracts/api.ts`

## Guarantees
- IDs are stable strings; timestamps are ISO-8601 strings; monetary values are integer aUEC.
- Preference status is exactly `needed`, `owned`, or `farmable`.
- A recipe total has `complete=false` whenever a needed component lacks a price.
- Recipe payload includes active patch metadata, source freshness, output, reputation, category, components, and total.
- Import envelope version is `wikelo-normalized-v1` and includes patch metadata plus complete recipe/component records.
- HMAC covers `<timestamp>.<request-id>.<sha256-body>`; requests older than five minutes or replayed IDs are rejected.

## Compatibility checks
TypeScript build, API tests, collector normalization/signing tests, UI build.

## Allowed changes
Add optional fields or internal metadata without changing required semantics.

## Forbidden changes
No client-side secrets, fuzzy auto-accepted UEX mappings, zero-valued missing prices, plaintext session tokens, or partial activation.
