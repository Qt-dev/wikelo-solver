# Wikelo Solver site build

## Goal
Create a modern recipe/value dashboard for the latest Wikelo patch, with local inventory preferences, searchable/sortable recipes, UEX-derived pricing, Discord identity, and a daily unp4k ingestion path.

## Success criteria
- UI direction and modern stack are approved before product implementation.
- Recipe browsing supports search, category/reputation/price sorting, ownership/farmable flags, missing-price visibility, and availability filtering.
- Data model leaves a clear boundary for daily game extraction, UEX pricing refresh, and Discord-backed persistence.
- Site builds successfully and receives browser smoke validation.

## Constraints
- Empty Sites/Vinext workspace; preserve starter architecture.
- No real Discord/UEX credentials are available in this turn, so integrations must be represented by explicit adapter boundaries and honest demo data.
- Latest patch data must be refreshable from an ingestion artifact rather than hard-coded as a permanent source of truth.

## Risk
High: public-facing app with auth, external data, persistent preferences, and data freshness requirements.

## Approval gates
- User approves the visual direction and proposed stack before implementation.
- Do not publish until implementation and validation pass.

## Mode
Delegated Ultracode workflow: UI design sidecars plus parent integration and verification.

## Work packets
- UI direction A/B/C: three parallel, read-only design preview artifacts.
- Parent: setup, approval gate, integration, product implementation, build and smoke checks.

## Eval contract
- Outcome: usable first version with explicit integration placeholders where credentials/data feeds are unavailable.
- Shared surfaces: app/page.tsx, app/globals.css, app/layout.tsx, .openai/hosting.json.
- Required checks: design approval, npm run build, browser smoke of search/sort/flags.
- Blocking conditions: missing user approval for design/stack, missing external credentials for live integrations.
- Handoff evidence: preview artifacts, changed files, build output, smoke checklist.

## Integration policy
Parent owns final integration. Preview agents create artifacts outside the site source and do not edit product files.

## Verification plan
Inspect preview options, obtain approval, build one product patch, run build, then perform focused browser smoke testing.

## Completion criteria
Site is implemented and validated locally; hosting is only attempted after user explicitly approves the selected stack/direction.
