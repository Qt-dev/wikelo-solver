# Packet 04-integration: Contract integration and verification

## Objective
Integrate delegated outputs, generate the migration, repair cross-surface issues, verify the release, and document external setup.

## Context
Parent-owned critical path after agent handoffs.

## Sources
All packet results and the full eval contract.

## Ownership
Parent agent.

## Do
Review every patch, update shared types/docs/config, generate and inspect migration, run required checks, and perform a final security audit.

## Do not
Deploy, run live migrations, enter secrets, install scheduled tasks, or publish.

## Expected output
Coherent local release and evidence-backed final report.

## Verification
Migration generation, lint, build, tests, and optional browser smoke test.

## Handoff format
Final report with passed/skipped checks and exact next external steps.

## Write scope
- lib/contracts/
- README.md
- package.json
- drizzle/
- .workflow/ultracode/wikelo-live-release/

## Coordination rule
You are not alone in the codebase. Do not revert edits made by others. Adapt to nearby changes.
