# Orchestration

## Parent critical path
Write contract and hosting binding -> delegate UI and data layers -> integrate -> generate migration -> build/lint -> report.

## Packets
- 01-dashboard-ui: worker; owns `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `app/components/`.
- 02-data-layer: worker; owns `db/schema.ts`, `lib/`, `app/api/`, `scripts/`, `data/`.

## Delegation
Native delegation is allowed by the explicit original request for UI/front-end/back-end agents.

## Agents
Two write-capable agents in one implementation wave.

## Delegation limits
2 agents; one implementation wave; parent-only integration and verification.

## Wait points
Wait for both packets before running migration generation and build.

## Fallback
If packet output conflicts with the contract, parent narrows or replaces the affected surface locally.

## Verification order
Diff inspection -> Drizzle migration generation -> lint -> build -> rendered-page test update/run.
