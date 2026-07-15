# Packet 01-collector: Windows game-data collector

## Objective
Produce a safe, testable Windows unp4k extraction, normalization, signing, upload, and scheduling toolkit.

## Context
Runs on the user's gaming PC; game internals can change by patch.

## Sources
Run plan, eval contract, shared API contract and type definitions.

## Ownership
Collector specialist.

## Do
Discover content, validate normalized schema, protect secrets with DPAPI, support dry runs, retain 14 days of logs, and define requested scheduled tasks.

## Do not
Install tasks, contact live services, guess a permanent p4k path, or expose secrets.

## Expected output
Collector scripts, fixtures/tests, and operator README.

## Verification
Fixture validation, signature determinism, malformed input rejection, and PowerShell parse checks.

## Handoff format
Files, evidence, assumptions, contract adherence, remaining risks.

## Write scope
- collector/
- tests/collector/

## Coordination rule
You are not alone in the codebase. Do not revert edits made by others. Adapt to nearby changes.
