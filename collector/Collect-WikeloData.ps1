[CmdletBinding()]
param(
    [ValidateSet('Recipes', 'Prices')][string]$Mode = 'Recipes',
    [switch]$DryRun,
    [switch]$Force,
    [switch]$RebuildCache,
    [string]$ConfigPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'WikeloCollector.psm1') -Force

$paths = Get-WikeloCollectorPaths
if (-not $ConfigPath) { $ConfigPath = $paths.Config }
$config = Read-WikeloCollectorConfig -Path $ConfigPath
New-Item -ItemType Directory -Force -Path $paths.Logs | Out-Null
Remove-WikeloExpiredLogs -LogDirectory $paths.Logs -RetentionDays ([int]$config.LogRetentionDays)
$logPath = Join-Path $paths.Logs ("collector-{0:yyyy-MM-dd}.log" -f [datetime]::UtcNow)
Set-WikeloCollectorLogPath -Path $logPath

function Write-CollectorLog([string]$Message) {
    $line = "{0:o} [{1}] {2}" -f [datetime]::UtcNow, $Mode.ToUpperInvariant(), $Message
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
    Write-Verbose $line
}

function Invoke-WikeloTrackedProcess {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$ArgumentList,
        [Parameter(Mandatory)][string]$WorkingDirectory,
        [Parameter(Mandatory)][string]$OutputDirectory,
        [Parameter(Mandatory)][string]$Phase,
        [string]$ExpectedOutputPath
    )
    $stdoutPath = Join-Path $OutputDirectory "$($Phase.ToLowerInvariant()).stdout.log"
    $stderrPath = Join-Path $OutputDirectory "$($Phase.ToLowerInvariant()).stderr.log"
    Write-CollectorLog "$Phase start: $FilePath $($ArgumentList -join ' ')"
    $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -WorkingDirectory $WorkingDirectory -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
    $timer = [Diagnostics.Stopwatch]::StartNew()
    try {
        while (-not $process.HasExited) {
            Start-Sleep -Seconds 15
            $process.Refresh()
            $outputFiles = @(Get-ChildItem -LiteralPath $OutputDirectory -Recurse -File -ErrorAction SilentlyContinue)
            $outputBytes = [long](($outputFiles | Measure-Object -Property Length -Sum).Sum)
            $cpuSeconds = [math]::Round($process.TotalProcessorTime.TotalSeconds, 1)
            Write-CollectorLog "$Phase heartbeat: pid=$($process.Id), cpuSeconds=$cpuSeconds, outputFiles=$($outputFiles.Count), outputBytes=$outputBytes, elapsedMinutes=$([math]::Round($timer.Elapsed.TotalMinutes, 1))"
        }
        $process.WaitForExit()
    } finally {
        $timer.Stop()
    }
    $stderr = if (Test-Path -LiteralPath $stderrPath) { @(Get-Content -LiteralPath $stderrPath -Tail 20 -ErrorAction SilentlyContinue) } else { @() }
    $exitCode = $process.ExitCode
    if ($null -eq $exitCode -and $ExpectedOutputPath -and (Test-Path -LiteralPath $ExpectedOutputPath -PathType Leaf)) {
        Write-CollectorLog "$Phase completed with no readable exit code, but expected output exists: $ExpectedOutputPath"
        return
    }
    if ($exitCode -ne 0) {
        Write-CollectorLog "$Phase failed: exitCode=$exitCode; stderr=$($stderr -join ' | ')"
        throw "$Phase exited with code $exitCode. See $stderrPath"
    }
    Write-CollectorLog "$Phase complete: exitCode=0, elapsedMinutes=$([math]::Round($timer.Elapsed.TotalMinutes, 1))"
}

function Ensure-WikeloLocalization {
    param([Parameter(Mandatory)][string]$ArchivePath, [Parameter(Mandatory)][string]$Unp4kPath, [Parameter(Mandatory)][string]$WorkingRoot, [Parameter(Mandatory)][string]$DataRoot)
    $target = Join-Path $DataRoot 'Localization\english\global.ini'
    if (Test-Path -LiteralPath $target -PathType Leaf) { return $target }
    Write-CollectorLog "Extracting English localization for record names."
    Push-Location $WorkingRoot
    try {
        & $Unp4kPath $ArchivePath 'Localization/english/global.ini'
        if ($LASTEXITCODE -ne 0 -and -not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "unp4k exited with code $LASTEXITCODE while extracting English localization." }
    } finally {
        Pop-Location
    }
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw 'unp4k did not produce Data/Localization/english/global.ini.' }
    Write-CollectorLog "Localization extracted: $target"
    $target
}

try {
    if ($Mode -eq 'Prices') {
        if (-not $config.PriceRefreshUri) { throw 'PriceRefreshUri is not configured.' }
        if ($DryRun) {
            Write-Output ([pscustomobject]@{ DryRun = $true; Mode = 'Prices'; Uri = $config.PriceRefreshUri })
        } else {
            $secret = Unprotect-WikeloUploadSecret -Path $paths.Secret
            Invoke-WikeloSignedPost -Uri $config.PriceRefreshUri -Body '{}' -Secret $secret | Out-Null
            Write-CollectorLog 'Price refresh request accepted.'
        }
        exit 0
    }

    $unp4k = Resolve-WikeloUnp4k -Config $config
    $archive = Resolve-WikeloGameArchive -Config $config
    $archiveInfo = Get-Item -LiteralPath $archive
    $cacheRoot = Get-WikeloCacheRoot -Config $config
    New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
    $state = $null
    if (Test-Path -LiteralPath $paths.State) { $state = Get-Content -LiteralPath $paths.State -Raw | ConvertFrom-Json }
    $unchanged = Test-WikeloArchiveMetadataUnchanged -State $state -ArchivePath $archive -ArchiveLength $archiveInfo.Length -ArchiveLastWriteUtc $archiveInfo.LastWriteTimeUtc
    if ($unchanged -and -not $Force) {
        Write-CollectorLog "Skipped unchanged archive $archive based on path, size, and last-write time."
        Write-Output ([pscustomobject]@{ Skipped = $true; Reason = 'Archive metadata unchanged'; ArchiveHash = $state.archiveHash })
        exit 0
    }
    $cachePreview = if ($RebuildCache) { [pscustomobject]@{ Valid = $false; Reason = 'rebuild requested' } } else { Get-WikeloCacheValidation -CacheRoot $cacheRoot -ArchivePath $archive -ArchiveLength $archiveInfo.Length -ArchiveLastWriteUtc $archiveInfo.LastWriteTimeUtc }
    $archiveHash = if ($cachePreview.Valid -and $cachePreview.Manifest.archiveHash) {
        [string]$cachePreview.Manifest.archiveHash
    } else {
        Write-CollectorLog "Archive hash start: path=$archive, bytes=$($archiveInfo.Length), algorithm=SHA256"
        $hashTimer = [Diagnostics.Stopwatch]::StartNew()
        try { (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() }
        finally {
            $hashTimer.Stop()
            Write-CollectorLog "Archive hash complete: elapsedMinutes=$([math]::Round($hashTimer.Elapsed.TotalMinutes, 1))"
        }
    }
    if ($DryRun) {
        Write-Output ([pscustomobject]@{ DryRun = $true; Mode = 'Recipes'; Unp4kPath = $unp4k; ArchivePath = $archive; ArchiveHash = $archiveHash; CacheRoot = $cacheRoot; CacheValid = $cachePreview.Valid; CacheReason = $cachePreview.Reason; WouldExtract = -not $cachePreview.Valid; WouldUpload = $true })
        exit 0
    }
    $cacheCheck = if ($RebuildCache) { [pscustomobject]@{ Valid = $false; Reason = 'rebuild requested' } } else { Get-WikeloCacheValidation -CacheRoot $cacheRoot -ArchivePath $archive -ArchiveLength $archiveInfo.Length -ArchiveLastWriteUtc $archiveInfo.LastWriteTimeUtc }
    Write-CollectorLog "Cache check: valid=$($cacheCheck.Valid), reason=$($cacheCheck.Reason), root=$cacheRoot"
    $stagingRoot = $null
    $extractionPath = $null
    $collectionSucceeded = $false
    try {
        if ($cacheCheck.Valid) {
            $extractionPath = $cacheCheck.ExtractionPath
            Write-CollectorLog "Cache hit: reusing $extractionPath; unp4k and unforge will not run."
            Ensure-WikeloLocalization -ArchivePath $archive -Unp4kPath $unp4k -WorkingRoot (Split-Path $extractionPath -Parent) -DataRoot $extractionPath | Out-Null
        } else {
            $unforge = Resolve-WikeloUnforge -Config $config
            $stagingRoot = Join-Path $cacheRoot ('.staging-' + [guid]::NewGuid().ToString('N'))
            $extractionPath = Join-Path $stagingRoot 'Data'
            New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
            Write-CollectorLog "Cache miss: building staging cache at $stagingRoot."
            Push-Location $stagingRoot
            try {
                & $unp4k $archive 'game2.dcb'
                if ($LASTEXITCODE -ne 0) { throw "unp4k exited with code $LASTEXITCODE while looking for Data/Game2.dcb." }
                if (-not (Test-Path -LiteralPath (Join-Path $extractionPath 'Game2.dcb') -PathType Leaf)) {
                    & $unp4k $archive 'game.dcb'
                    if ($LASTEXITCODE -ne 0) { throw "unp4k exited with code $LASTEXITCODE while looking for Data/Game.dcb." }
                }
                $dcb = Get-ChildItem -LiteralPath $extractionPath -File -ErrorAction SilentlyContinue |
                    Where-Object Name -In @('Game2.dcb', 'Game.dcb') | Select-Object -First 1
                if (-not $dcb) { throw 'Neither Data/Game2.dcb nor Data/Game.dcb was extracted from Data.p4k.' }
                Ensure-WikeloLocalization -ArchivePath $archive -Unp4kPath $unp4k -WorkingRoot $stagingRoot -DataRoot $extractionPath | Out-Null
                $collectorXml = Join-Path $extractionPath 'libs\foundry\records\contracts\contractgenerator\thecollector.xml'
                Invoke-WikeloTrackedProcess -FilePath $unforge -ArgumentList @('"' + $dcb.FullName + '"') -WorkingDirectory $stagingRoot -OutputDirectory $stagingRoot -Phase 'unforge' -ExpectedOutputPath $collectorXml
            } finally {
                Pop-Location
            }
            $collectorXml = Join-Path $extractionPath 'libs\foundry\records\contracts\contractgenerator\thecollector.xml'
            if (-not (Test-Path -LiteralPath $collectorXml -PathType Leaf)) { throw 'unforge completed but TheCollector XML was not generated.' }
            Write-WikeloCacheManifest -CacheRoot $stagingRoot -ArchivePath $archive -ArchiveHash $archiveHash -ArchiveLength $archiveInfo.Length -ArchiveLastWriteUtc $archiveInfo.LastWriteTimeUtc -DcbName $dcb.Name -Unp4kPath $unp4k -UnforgePath $unforge
        }
        $localizationPath = Join-Path $extractionPath 'Localization\english\global.ini'
        $envelope = Convert-WikeloExtractionToNormalizedV1 -ExtractionPath $extractionPath -SourceHash $archiveHash -PatchVersion $config.PatchVersion -PatchBuild $config.PatchBuild -PatchChannel $config.PatchChannel -LocalizationPath $localizationPath
        Assert-WikeloNormalizedV1 -Envelope $envelope | Out-Null
        if ($stagingRoot) {
            Publish-WikeloCache -StagingRoot $stagingRoot -CacheRoot $cacheRoot | Out-Null
            $stagingRoot = $null
            Write-CollectorLog "Cache published: $cacheRoot\active"
        }
        $body = $envelope | ConvertTo-Json -Depth 12 -Compress
        $outputTemp = "$($paths.Output).tmp"
        $body | Set-Content -LiteralPath $outputTemp -Encoding UTF8 -NoNewline
        Move-Item -LiteralPath $outputTemp -Destination $paths.Output -Force
        $secret = Unprotect-WikeloUploadSecret -Path $paths.Secret
        Invoke-WikeloSignedPost -Uri $config.UploadUri -Body $body -Secret $secret | Out-Null
        $stateTemp = "$($paths.State).tmp"
        [ordered]@{ archivePath = $archive; archiveHash = $archiveHash; archiveLength = $archiveInfo.Length; archiveLastWriteUtc = $archiveInfo.LastWriteTimeUtc.ToString('o'); uploadedAt = [datetime]::UtcNow.ToString('o') } |
            ConvertTo-Json | Set-Content -LiteralPath $stateTemp -Encoding UTF8
        Move-Item -LiteralPath $stateTemp -Destination $paths.State -Force
        Write-CollectorLog "Uploaded $(@($envelope.recipes).Count) normalized recipes."
        $collectionSucceeded = $true
    } finally {
        if ($stagingRoot -and (Test-Path -LiteralPath $stagingRoot)) {
            Write-CollectorLog "Preserving failed staging cache: $stagingRoot"
            Write-CollectorLog 'Rerun with -Force after inspecting this directory and the unforge stdout/stderr logs.'
        }
    }
} catch {
    Write-CollectorLog "ERROR: $($_.Exception.Message)"
    throw
}
