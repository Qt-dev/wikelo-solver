# Data ingestion

The supported ingestion tooling lives in [`collector/`](../collector/). It extracts game data outside the repository, discovers Wikelo recipe records by content, validates the `wikelo-normalized-v1` envelope, and uploads it to `/api/internal/imports/wikelo` with replay-resistant HMAC headers.

Use the collector's dry run and fixture suite before configuring a live endpoint:

```powershell
.\collector\Collect-WikeloData.ps1 -DryRun
npm run test:collector
```

No production D1 write, task installation, or external request occurs during the normal build or test commands.
