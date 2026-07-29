# Eval contract

## Goal
Implement a PC-independent, repository-backed Wikelo data pipeline with scheduled cloud execution and clear unreleased-recipe status.

## Success criteria
- Only a complete validated repository snapshot can replace the active patch.
- `NotForRelease` survives parsing, persistence, API serialization, and UI display.
- UEX refresh needs only the documented full-dump endpoints.
- Existing signed v1 imports continue to work.

## Integration surfaces
`NormalizedImportV1` compatibility, `recipes`/`game_patches` schema, import service, recipe route DTOs, Worker bindings, and `RecipePlanner`.

## Downstream consumers
Anonymous recipe readers, signed collector imports, price refresh, saved to-dos, and internal status reporting.

## Required checks
Focused parser and UI tests; build; lint; backend/render suite; inspect scheduling and migration config.

## Deliverables
Repository normalizer, v2-compatible parsing, D1 migration, Cloudflare Workflow/container scaffolding, UEX workflow, UI flag, and workflow report.

## Blocking conditions
Do not deploy, apply remote migrations, set secrets, or activate schedules. Fail closed when source metadata or normalized content is incomplete.
