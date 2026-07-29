# scunpacked-data sync migration

## Goal
Replace gaming-PC mission extraction with scunpacked-data ingestion, automate UEX refreshes in Cloudflare, and surface a recipe's NotForRelease flag in the UI.

## Success criteria
- Repository-backed normalized imports replace Data.p4k as the supported source.
- A Cloudflare scheduled path exists for both game and UEX syncs without PC tasks.
- D1/API/UI preserve and display NotForRelease recipes safely.
- Existing signed import compatibility and atomic patch activation remain intact.

## Current context
The app has a D1-backed Vinext Worker, signed import routes, a PowerShell Data.p4k collector, and a server-side UEX refresher.

## Constraints
- No production deployment, remote migrations, credentials, or scheduler changes in this run.
- Preserve existing user data and signed v1 imports.
- scunpacked-data is the mission source of truth.

## Risk level
High: shared data contract, D1 migration, Worker scheduling, and planner UI.

## Approval gates
Implementation is authorized. Deployment, remote migration, secrets, and scheduler activation remain out of scope pending explicit approval.

## Mode
Delegated Ultracode workflow: one exploration packet, two disjoint implementation packets, then parent integration and verification.

## Work packets
- 01-discovery: trace cloud runtime/configuration and test seams (read-only).
- 02-repository-normalizer: add repository source normalization and import contract support.
- 03-release-status-ui: add schema/API/UI NotForRelease behavior and focused tests.

## Eval contract
See `eval-contract.md`.

## Integration policy
The parent owns worker configuration, scheduler orchestration, UEX refactoring, migrations that overlap shared data flow, and all integration. Agents may edit only their assigned scopes.

## Verification plan
Run targeted tests, lint, build, and the backend/render test suite; inspect migration and Worker configuration manually.

## Completion criteria
Source adapter, migration, scheduled orchestration, UEX full-dump sync, release-status UI, artifacts, and passing proportional checks are present locally.
