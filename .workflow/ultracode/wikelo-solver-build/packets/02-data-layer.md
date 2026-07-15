# Packet 02: data layer

## Objective
Implement the server-side data contract for imported Wikelo recipes and UEX prices.

## Ownership
`db/schema.ts`, `lib/`, `app/api/`, `scripts/`, `data/` only.

## Do
Create typed schema and pure adapter helpers. Document a daily unp4k import flow that consumes extracted JSON rather than assuming a user game installation. Keep UEX tokens server-only.

## Do not
Do not edit UI, hosting, package files, migrations, tests or invoke external data writes.

## Handoff format
List files changed, schema decisions, local validation and risks.
