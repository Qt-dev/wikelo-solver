# Result 01-collector: Windows game-data collector

## Summary
Implemented a PowerShell 5.1+ collector with DPAPI configuration, archive change detection, temporary unp4k extraction, content-based discovery, normalized v1 validation, signed uploads, log retention, dry runs, and scheduled-task installer/uninstaller scripts.

## Evidence
`npm run test:collector` passes 20 assertions, including DPAPI round-trip, signing vectors, malformed data, dry runs, and PowerShell parsing.

## Handoff
Handoff:
- Summary: gaming-PC collector is locally complete and safe-by-default.
- Changed surfaces: `collector/`, `tests/collector/`.
- Contracts satisfied: normalized v1 and signed request headers.
- Assumptions: real extraction aliases may evolve by patch; unp4k CLI template is configurable.
- Local checks: 20/20 collector assertions.
- Integration evidence: default upload URL reconciled to `/api/internal/imports/wikelo`.
- Risks: real Data.p4k and Task Scheduler installation are untested by design.

## Files changed
Collector module, runner, configuration, installer/uninstaller, README, fixtures, and test harness.

## Decisions
No guessed p4k record path; no plaintext non-loopback HTTP; extraction stays outside the repo.

## Risks
Game schema changes may require extending centralized aliases.

## Verification run
PASS.

## Open questions
Confirm the user's actual unp4k argument template and extracted record aliases during private integration.
