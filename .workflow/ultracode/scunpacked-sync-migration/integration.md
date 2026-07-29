# Integration

## Accepted

- SCUnpacked is now the main Wikelo mission source through `lib/server/repository-sync.ts`.
- GitHub metadata resolves the repository revision; the container shallow-fetches only `contracts/` and returns a bounded snapshot.
- A daily game-data Workflow and six-hour UEX Workflow run without the game client or local computer.
- The import path accepts source provenance and preserves `notForRelease`; released recipes sort before flagged recipes.

## Rejected

- No browser scraping or game-client automation: both require a user machine and are less reliable than the public repository/API path.

## Conflicts

None. The existing UEX all-items refresh was retained because it already avoids per-item fan-out.

## Decisions

- Use Cloudflare Container `standard-1`, singleton, and GitHub-only egress because the source repository is too large for a normal Worker scan.
- Use Workflow instance IDs keyed by scheduled time to absorb duplicate cron deliveries.
- Rebuild `game_patches` in D1 migration so `last_checked_at` can have the database `CURRENT_TIMESTAMP` default safely.

## Final changes

- Worker bindings/schedules/container config: `wrangler.jsonc`, `worker/index.ts`, `worker/sync-workflows.ts`, `worker/repository-container.ts`.
- Repository fetcher: `collector/scunpacked-container/`, `lib/server/repository-sync.ts`.
- Data/import/UI migration: `drizzle/0007_scunpacked_sync.sql`, schema/contracts/import service/API/UI.

## Verification still needed

- Production deployment and first scheduled run after the user approves Cloudflare resource provisioning.
- Live UEX endpoint credentials and GitHub container egress in the target account.

## Remaining risks

- Commit-subject version parsing intentionally fails closed if upstream changes its release naming convention.
- Cloudflare Containers require a paid account and will incur usage when the daily job runs.

## Accepted
Pending packet results.

## Rejected
None.

## Conflicts
None yet.

## Decisions
- Repository source is authoritative.
- Cloud execution remains local-only scaffolding until deployment approval.

## Final changes
Pending.

## Verification still needed
All checks.

## Remaining risks
Container runtime and upstream repository behavior require deployment-stage validation.
