# Integration

## Accepted
- Approved dark Option B dashboard.
- D1 binding declaration and six-table schema.
- Server-only UEX adapter and sample-only public contract route.
- Normalized unp4k ingestion documentation and validator.
- Cross-platform package scripts and product-focused render tests.

## Rejected
- App-owned Discord OAuth scaffold: Sites guidance requires a confirmed platform-compatible public identity-provider path and real credentials.
- Any automatic game extraction or live D1 import: no game archive or production release authorization is available.

## Conflicts
None. The UI has no Worker-only imports and stays independent from D1 at render time.

## Decisions
- Sample records are explicitly marked as non-live.
- Recipe rows show a UEX price gap when a component price is absent.
- "Ready" filtering now derives from user component selections.

## Final changes
See packet result files and generated migration `drizzle/0000_plain_machine_man.sql`.

## Verification still needed
Hosted preview and real external integration checks after credentials and source data are supplied.

## Remaining risks
The local development server cannot bind in this managed Windows environment, so browser interaction smoke testing was skipped; build and server-render tests passed.
