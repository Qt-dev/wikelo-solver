# Eval contract

## Goal
Deliver an internally coherent local release whose UI, APIs, database, and collector agree on identity, price, preference, patch, and import semantics.

## Success criteria
Active-patch reads are complete; failed imports do not replace active data; incomplete prices remain explicit; owned/farmable inputs cost zero; OAuth state/session controls are enforced; preference data is user-scoped.

## Integration surfaces
`lib/contracts/api.ts`, D1 schema, `/api/recipes`, `/api/session`, `/api/preferences`, `/api/internal/*`, `/auth/discord/*`, collector normalized schema v1.

## Downstream consumers
The UI consumes public/session/preference APIs. The collector consumes the normalized import envelope and HMAC rules. Pricing and recipe totals consume item mappings and preference status.

## Required checks
Build and lint; normalized import fixtures; signature/replay/idempotency tests; price precedence and incomplete-total tests; OAuth/session/preferences tests; rendered shell test.

## Deliverables
Working local code, generated migration, Windows collector scripts, environment/setup documentation, and Ultracode evidence.

## Blocking conditions
Contract drift, insecure token storage, non-atomic patch activation, automatic fuzzy item matches, or UI hiding missing prices.
