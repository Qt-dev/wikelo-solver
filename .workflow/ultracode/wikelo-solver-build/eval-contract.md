# Eval contract

## Goal
Deliver the approved first-version Wikelo Solver dashboard without presenting demo data or unavailable OAuth as live production integrations.

## Success criteria
- UI performs client-side search, sorting and inventory/farmable/availability filtering against representative structured data.
- Recipes calculate a component total only when every priced, non-farmable component has a price; missing inputs are explicitly displayed.
- Data model supports patch-scoped imports, components, price snapshots and per-user preference flags.
- UEX request code is server-only and environment-driven.

## Integration surfaces
- `.openai/hosting.json` declares D1 as `DB`.
- `db/schema.ts` is the D1 model consumed by the data layer.
- UI source is self-contained for this initial visual build and does not import Worker-only bindings.

## Downstream consumers
- Daily unp4k job writes patch/recipe/component records.
- UEX refresh job writes price snapshots.
- Future Discord OAuth callback writes user preference records after hosting/auth confirmation.

## Required checks
- `npm run db:generate`
- `npm run lint`
- deployment build

## Deliverables
- Responsive approved UI, data schema, integration adapters, ingestion documentation, migration output and updated product test.

## Blocking conditions
- No production D1 binding, Discord credentials, UEX access token or game data.p4k are available; do not fake live data or auth.
