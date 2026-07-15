# Integration

## Accepted
All three agent packets after contract review and parent corrections.

## Rejected
Stale sample snapshot/validator and outdated UEX single-feed fallback assumption.

## Conflicts
Collector default upload URL and environment variable names were reconciled with landed routes.

## Decisions
Use current `items_prices_all` terminal data and `marketplace_prices_averages_all` Q0 buy/AUEC fallback; keep unknown prices incomplete.

## Final changes
Generated migration, live docs/env example, corrected metadata, unified tests, removed obsolete sample ingestion artifacts.

## Verification still needed
Private Sites deployment with real D1, Discord app, UEX response, and one dry-run/real collector extraction.

## Remaining risks
Game schemas and external APIs can change; mappings fail closed and surface review/missing states.
