[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Import-Module (Join-Path $repo 'collector\WikeloCollector.psm1') -Force
$passed = 0
function Assert-Equal($Expected, $Actual, [string]$Message) {
    if ($Expected -ne $Actual) { throw "$Message Expected '$Expected', got '$Actual'." }
    $script:passed++
}
function Assert-True([bool]$Value, [string]$Message) {
    if (-not $Value) { throw $Message }
    $script:passed++
}
function Assert-Throws([scriptblock]$Action, [string]$Message) {
    try { & $Action; throw "ASSERTION_DID_NOT_THROW: $Message" }
    catch { if ($_.Exception.Message -like 'ASSERTION_DID_NOT_THROW:*') { throw } }
    $script:passed++
}

$fixture = Join-Path $PSScriptRoot 'fixtures\extracted'
$hash = 'a' * 64
$normalized = Convert-WikeloExtractionToNormalizedV1 -ExtractionPath $fixture -SourceHash $hash -ExtractedAt ([datetime]'2026-01-02T03:04:05Z')
Assert-True (Assert-WikeloNormalizedV1 $normalized) 'Expected normalized fixture to validate.'
Assert-Equal 'wikelo-normalized-v1' $normalized.schema 'Schema mismatch.'
Assert-Equal '4.2.0-live' $normalized.patch.version 'Version should be discovered from content.'
Assert-Equal '987654' $normalized.patch.build 'Build should be discovered from content.'
Assert-Equal 1 @($normalized.recipes).Count 'Recipe discovery should ignore the fixture path/name.'
Assert-Equal 'wikelo-armor-01' $normalized.recipes[0].gameRecipeId 'Recipe ID mismatch.'
Assert-Equal 2 @($normalized.recipes[0].components).Count 'Component count mismatch.'
Assert-Equal 4 $normalized.recipes[0].components[0].quantity 'Quantity alias mismatch.'

$collectorFixture = Join-Path $PSScriptRoot 'fixtures\collector-xml'
$collectorNormalized = Convert-WikeloExtractionToNormalizedV1 -ExtractionPath $collectorFixture -SourceHash $hash -PatchVersion '4.8.3' -PatchBuild 'test-build'
Assert-True (Assert-WikeloNormalizedV1 $collectorNormalized) 'Expected TheCollector fixture to validate.'
Assert-Equal 1 @($collectorNormalized.recipes).Count 'TheCollector contract discovery failed.'
Assert-Equal 'wikelo-inline' $collectorNormalized.recipes[0].gameRecipeId 'TheCollector contract ID mismatch.'
Assert-Equal 'Ore' $collectorNormalized.recipes[0].components[0].name 'DataForge reference name resolution failed.'
Assert-Equal 'Reward Box' $collectorNormalized.recipes[0].output.name 'Reward reference name resolution failed.'
Assert-Equal 3 @($collectorNormalized.recipes[0].outputs).Count 'Completion reward items should be collected.'
Assert-Equal 'Reward Token' $collectorNormalized.recipes[0].outputs[1].name 'Second reward name resolution failed.'
Assert-Equal 20 $collectorNormalized.recipes[0].outputs[1].quantity 'Second reward quantity mismatch.'
Assert-Equal 'Cds Superheavy Helmet 01' $collectorNormalized.recipes[0].outputs[2].name 'Crafted entity filename fallback failed.'
$invalid = $normalized | ConvertTo-Json -Depth 12 | ConvertFrom-Json
$invalid.patch.sourceHash = 'not-a-hash'
Assert-Throws { Assert-WikeloNormalizedV1 $invalid } 'Invalid source hash should be rejected.'

$body = [Text.Encoding]::UTF8.GetBytes('{"ok":true}')
$headers = New-WikeloSignedHeaders -BodyBytes $body -Secret 'test-secret' -RequestId '00000000-0000-0000-0000-000000000001' -Timestamp 1700000000
Assert-Equal '4062edaf750fb8074e7e83e0c9028c94e32468a8b6f1614774328ef045150f93' $headers['X-Wikelo-Body-SHA256'] 'Body hash mismatch.'
Assert-Equal '1700000000' $headers['X-Wikelo-Timestamp'] 'Timestamp mismatch.'
Assert-Equal '00000000-0000-0000-0000-000000000001' $headers['X-Wikelo-Request-Id'] 'Request ID mismatch.'
Assert-Equal '57c73e829df266125116f742a48e75675adc0d731b0488c82fa9ea31e2d7b1c5' $headers['X-Wikelo-Signature'] 'HMAC mismatch.'
Assert-Throws { Invoke-WikeloSignedPost -Uri 'http://example.com/import' -Body '{}' -Secret 'test' -DryRun } 'Non-loopback plaintext HTTP should be rejected.'

$priceTaskPreview = @(& (Join-Path $repo 'collector\Install-WikeloCollector.ps1') -Mode Prices -PriceIntervalHours 4 -DryRun)
Assert-Equal 1 $priceTaskPreview.Count 'Price-only task preview should contain one task.'
Assert-Equal 'WikeloSolver-Prices' $priceTaskPreview[0].Name 'Price-only task preview selected the wrong task.'
Assert-Equal 'Every 4 hours; StartWhenAvailable' $priceTaskPreview[0].Schedule 'Price task preview interval mismatch.'

$archiveTime = [datetime]'2026-02-03T04:05:06Z'
$state = [pscustomobject]@{ archiveHash = $hash; archiveLength = 123; archiveLastWriteUtc = $archiveTime.ToString('o') }
Assert-True (Test-WikeloArchiveUnchanged -State $state -ArchiveHash $hash -ArchiveLength 123 -ArchiveLastWriteUtc $archiveTime) 'Matching archive hash and metadata should skip.'
Assert-True (-not (Test-WikeloArchiveUnchanged -State $state -ArchiveHash $hash -ArchiveLength 124 -ArchiveLastWriteUtc $archiveTime)) 'Changed archive metadata must not skip.'

$sandbox = Join-Path ([IO.Path]::GetTempPath()) ("WikeloCollectorTests-$([guid]::NewGuid().ToString('N'))")
try {
    New-Item -ItemType Directory -Path (Join-Path $sandbox 'tools\nested') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $sandbox 'game\unexpected') -Force | Out-Null
    New-Item -ItemType File -Path (Join-Path $sandbox 'tools\nested\unp4k.exe') | Out-Null
    New-Item -ItemType File -Path (Join-Path $sandbox 'game\unexpected\Data.p4k') | Out-Null
    $config = Get-WikeloDefaultConfig
    $config.Unp4kSearchRoots = @((Join-Path $sandbox 'tools'))
    $config.GameSearchRoots = @((Join-Path $sandbox 'game'))
    Assert-True ((Resolve-WikeloUnp4k $config) -like '*tools\nested\unp4k.exe') 'unp4k discovery failed.'
    Assert-True ((Resolve-WikeloGameArchive $config) -like '*game\unexpected\Data.p4k') 'archive discovery failed.'
    $archivePath = Join-Path $sandbox 'game\unexpected\Data.p4k'
    $archiveInfo = Get-Item $archivePath
    $cacheRoot = Join-Path $sandbox 'cache'
    $stagingRoot = Join-Path $cacheRoot '.staging-test'
    New-Item -ItemType Directory -Force -Path (Join-Path $stagingRoot 'Data\libs\foundry\records\contracts\contractgenerator') | Out-Null
    New-Item -ItemType File -Force -Path (Join-Path $stagingRoot 'Data\Game2.dcb') | Out-Null
    New-Item -ItemType File -Force -Path (Join-Path $stagingRoot 'Data\libs\foundry\records\contracts\contractgenerator\thecollector.xml') | Out-Null
    Write-WikeloCacheManifest -CacheRoot $stagingRoot -ArchivePath $archivePath -ArchiveHash $hash -ArchiveLength $archiveInfo.Length -ArchiveLastWriteUtc $archiveInfo.LastWriteTimeUtc -DcbName 'Game2.dcb' -Unp4kPath 'unp4k.exe' -UnforgePath 'unforge.cli.exe'
    Publish-WikeloCache -StagingRoot $stagingRoot -CacheRoot $cacheRoot | Out-Null
    $cacheValidation = Get-WikeloCacheValidation -CacheRoot $cacheRoot -ArchivePath $archivePath -ArchiveLength $archiveInfo.Length -ArchiveLastWriteUtc $archiveInfo.LastWriteTimeUtc
    Assert-True $cacheValidation.Valid 'Matching cache metadata should validate.'
    Assert-Equal 'Game2.dcb' $cacheValidation.Manifest.dcbName 'Cache manifest DCB mismatch.'
    Assert-True (-not (Get-WikeloCacheValidation -CacheRoot $cacheRoot -ArchivePath $archivePath -ArchiveLength ($archiveInfo.Length + 1) -ArchiveLastWriteUtc $archiveInfo.LastWriteTimeUtc).Valid) 'Changed archive size must invalidate cache.'
    Remove-Item -LiteralPath (Join-Path $cacheRoot 'active\cache-manifest.json') -Force
    Assert-True (-not (Get-WikeloCacheValidation -CacheRoot $cacheRoot -ArchivePath $archivePath -ArchiveLength $archiveInfo.Length -ArchiveLastWriteUtc $archiveInfo.LastWriteTimeUtc).Valid) 'Missing cache marker must invalidate cache.'
    if ($env:OS -eq 'Windows_NT') {
        $secretPath = Join-Path $sandbox 'secret.dpapi'
        $secure = ConvertTo-SecureString 'local-test-secret' -AsPlainText -Force
        Protect-WikeloUploadSecret -Secret $secure -Path $secretPath -Confirm:$false
        Assert-True ((Get-Content -LiteralPath $secretPath -Raw) -notmatch 'local-test-secret') 'Secret file must not contain plaintext.'
        Assert-Equal 'local-test-secret' (Unprotect-WikeloUploadSecret -Path $secretPath) 'DPAPI round-trip failed.'
    }
} finally {
    if (Test-Path -LiteralPath $sandbox) { Remove-Item -LiteralPath $sandbox -Recurse -Force }
}

Write-Output "PASS: $passed collector assertions"
