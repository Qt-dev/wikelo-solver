# Orchestration

## Parent critical path
Lock contracts, integrate agent patches, generate migration, run full verification, audit auth/import boundaries.

## Packets
- 01 collector: `collector/`, collector fixtures/tests.
- 02 backend: `db/schema.ts`, server modules, API/auth routes, backend tests.
- 03 UI: planner component and UI styles.
- 04 integration: parent-owned shared types/docs/config/migrations.

## Delegation
One wave of three write-capable agents, followed by parent integration.

## Agents
Collector specialist, backend/auth specialist, UI specialist.

## Delegation limits
Maximum three implementation agents; no nested agents; strict write scopes.

## Wait points
Parent continues shared documentation and verification setup while agents run, then waits once for handoffs.

## Fallback
Parent repairs contract or build issues locally. External setup remains disabled and documented.

## Verification order
Targeted tests, schema generation/inspection, lint, build, full test, optional browser smoke test.
