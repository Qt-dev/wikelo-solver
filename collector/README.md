# Wikelo Windows collector

This Windows PowerShell 5.1+ collector finds configured `unp4k.exe` and `Data.p4k`, extracts into a unique directory under the system temporary directory, discovers recipe-shaped records by inspecting extracted JSON/XML content, validates a `wikelo-normalized-v1` envelope, and uploads it. It never extracts into the repository.

## Configure

Configuration, current-user DPAPI ciphertext, state, normalized output, and 14-day logs live under `%LOCALAPPDATA%\WikeloSolver`. DPAPI ciphertext can be decrypted only by the same Windows user on the same machine.

```powershell
$secret = Read-Host 'Upload HMAC secret' -AsSecureString
.\collector\Set-WikeloCollectorConfig.ps1 `
  -Unp4kPath 'D:\Tools\unp4k.exe' `
  -UnforgePath 'D:\Tools\unp4k\unforge.cli.exe' `
  -GameArchivePath 'D:\Games\StarCitizen\LIVE\Data.p4k' `
  -PatchVersion '4.x' -PatchBuild 'build-id' `
  -UploadUri 'https://planner.example/api/internal/imports/wikelo' `
  -PriceRefreshUri 'https://planner.example/api/internal/prices/refresh' `
  -UploadSecret $secret
```

Instead of exact paths, set `-Unp4kSearchRoots`, `-UnforgeSearchRoots`, and `-GameSearchRoots`; discovery recursively finds the tools/archive and fails on ambiguous game archives. The recipe refresh extracts `Data/Game2.dcb` (falling back to `Data/Game.dcb`) using positional unp4k arguments, then runs the matching `unforge.cli.exe`. It requires the generated `Data/libs/foundry/records/contracts/contractgenerator/thecollector.xml` path and parses `HaulingOverride` inputs plus `contractResults` rewards. Keep unp4k and unforge from the same pinned release (v4.0.87).

Run `Collect-WikeloData.ps1 -DryRun` to resolve paths and hash the archive without extraction, secret access, state changes, or network. A successful upload records archive SHA-256, size, and last-write timestamp; all three must match to skip the next recipe collection. `-Force` bypasses that skip.

Recipe extraction writes phase, heartbeat, PID, CPU time, output counts, exit codes, and captured unforge stdout/stderr to the daily log. Converted DCB/XML data is cached under `%LOCALAPPDATA%\WikeloSolver\data` and reused when the archive path, size, and last-write time match. Use `-Force` to re-normalize and upload from a valid cache; use `-RebuildCache` to regenerate the cache. On failure, the staging directory is preserved and its path is logged; inspect it before rerunning with `-Force`.

Non-loopback HTTP uploads are rejected. Signed POSTs use lowercase hex and these headers:

- `X-Wikelo-Timestamp`: Unix seconds
- `X-Wikelo-Request-Id`: UUID
- `X-Wikelo-Body-SHA256`: SHA-256 of the exact UTF-8 request bytes
- `X-Wikelo-Signature`: HMAC-SHA256 of `<timestamp>.<request-id>.<body-hash>`

## Scheduled tasks

Preview only:

```powershell
.\collector\Install-WikeloCollector.ps1 -DryRun
.\collector\Uninstall-WikeloCollector.ps1 -DryRun -RemoveLocalData
```

Running the installer creates current-user limited tasks: recipe collection daily at 03:00 and at logon, with `StartWhenAvailable` for missed runs; price refresh repeats every six hours. The uninstaller removes tasks and preserves local data unless `-RemoveLocalData` is explicitly supplied. Do not run installation from an elevated shell unless that ownership is intended.

## Validate

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tests\collector\Run-CollectorTests.ps1
```

The normalizer deliberately rejects empty discoveries and incomplete records. Source schema aliases are centralized in `WikeloCollector.psm1`; inspect a real extraction and extend aliases when game data changes rather than hard-coding an assumed directory.
