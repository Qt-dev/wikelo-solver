# Wikelo Solver implementation

## Goal
Apply the approved dark mission-planner design to a working Wikelo recipe dashboard, with a durable data model, UEX pricing adapter, and a daily unp4k ingestion boundary.

## Success criteria
- Dark Option B dashboard is responsive, accessible, searchable, sortable, and supports inventory and farmable component flags.
- Recipe value, missing-price state, reputation requirements/grants, categories, components and output are visible.
- D1 schema models recipes, components, price snapshots and user component preferences.
- A server-side UEX adapter is present; the public UI never exposes an API token.
- The product build succeeds.

## Current context
The user approved the stack and the darker Option B preview. The repo is an uncommitted Vinext Sites starter.

## Constraints
- Actual Discord OAuth cannot be safely scaffolded without a confirmed Sites-compatible public identity-provider path and credentials; show a clearly labelled connection handoff rather than claim a live login.
- Live Wikelo recipes require a local Star Citizen installation/data.p4k for unp4k extraction; ship a structured ingestion boundary and sample payload, not invented claims about the latest live dataset.
- UEX API credentials are optional; public price endpoints can be used where allowed, but secret-bearing calls stay server-side.

## Risk level
High: public UI, schema, price integration, identity intent and ingestion contract.

## Approval gates
Implementation is approved. Do not deploy, create accounts, store credentials, run migrations against production, or invoke unp4k against a game installation.

## Mode
Delegated. Two bounded write packets with non-overlapping scopes; parent owns hosting configuration, integration and verification.

## Work packets
- 01-dashboard-ui: approved dark Option B UI and client interactions.
- 02-data-layer: D1 schema, typed sample data, UEX adapter and ingestion contract.

## Eval contract
See `eval-contract.md`.

## Integration policy
Parent integrates the packets. UI only consumes its local sample state for this first build; backend surfaces are designed as the next wiring point and must not cause client-side secret or runtime-binding access.

## Verification plan
Inspect diff, generate migration, run lint and deployment build, then update the rendered-page test if starter-only assumptions were removed.

## Completion criteria
The site source builds successfully, artifacts document the data/auth limitations, and the user can approve a later deployment separately.
