# Data-sync configuration

The scheduled jobs run entirely on GitHub-hosted runners. Configure these repository values before enabling them:

- Actions secret `WIKELO_IMPORT_SECRET`: the same value used by the deployed Worker.
- Actions variable `WIKELO_SYNC_ORIGIN`: the HTTPS origin for this app, without a trailing slash (for example `https://site.<account>.workers.dev`).

Run either workflow manually once after deployment to verify its secret and origin. GitHub schedules are best-effort; the workflows are idempotent, so delayed or duplicate deliveries are safe.
