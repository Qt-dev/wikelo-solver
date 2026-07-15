# Wikelo live release

## Goal
Build the approved dark Option B into a local, production-shaped Wikelo recipe planner with live-import APIs, UEX pricing, Discord login, persisted component preferences, and a Windows unp4k collector.

## Success criteria
- Public recipe API exposes the active patch, components, outputs, reputation, totals, and missing-price state.
- Signed, replay-safe imports can atomically activate a complete patch.
- Discord OAuth creates a secure server session and preferences remain isolated per user.
- UI consumes APIs and supports search, sorting, readiness, owned/farmable flags, and stale/missing-data states.
- Collector can discover/normalize extracted data, sign uploads, and install scheduled tasks without being executed during this run.

## Current context
Vinext/React/TypeScript Sites starter with D1/Drizzle, an approved dark UI prototype, a preliminary schema, and sample data.

## Constraints
- No deployment, production migration, credential entry, Discord app changes, or machine-level task installation in this run.
- Preserve unrelated user work. Use disjoint packet write scopes.
- Unknown Star Citizen p4k paths are discovered from extracted content rather than hard-coded as facts.

## Risk level
High: authentication, public/internal APIs, database migration, signed ingestion, and cross-packet contracts.

## Approval gates
Local implementation and generated migration are approved by the build request. Deployment, real secrets, production migration, and running the collector installer require later explicit approval.

## Mode
Delegated Ultracode workflow with three write-capable agents and parent integration.

## Work packets
1. Windows unp4k collector and normalization fixtures.
2. D1 schema, live recipe/import/price/auth/preference backend.
3. Approved Option B UI connected to the shared API contract.
4. Parent integration, migration generation, tests, security review, and documentation.

## Eval contract
Full contract in `eval-contract.md`; shared API shape in `contracts/api.md`.

## Integration policy
Agents own disjoint paths. Parent owns shared types, package scripts, migration generation, cross-packet fixes, and final verification.

## Verification plan
Run collector unit fixtures, backend tests, ESLint, TypeScript/Vinext production build, rendered HTML tests, and inspect generated migration. Browser QA is attempted only if the managed environment permits binding a local port.

## Completion criteria
All required checks pass, remaining external setup is documented, and no sample-only behavior is presented as live.
