[CmdletBinding(SupportsShouldProcess)]
param(
    [string]$Unp4kPath,
    [string]$UnforgePath,
    [string]$GameArchivePath,
    [string[]]$Unp4kSearchRoots,
    [string[]]$UnforgeSearchRoots,
    [string[]]$GameSearchRoots,
    [string]$UploadUri,
    [string]$PriceRefreshUri,
    [string]$PatchVersion,
    [string]$PatchBuild,
    [string]$PatchChannel,
    [string]$CacheRoot,
    [Security.SecureString]$UploadSecret,
    [switch]$DryRun
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'WikeloCollector.psm1') -Force
$paths = Get-WikeloCollectorPaths
$config = Read-WikeloCollectorConfig -Path $paths.Config
foreach ($name in @('Unp4kPath','UnforgePath','GameArchivePath','Unp4kSearchRoots','UnforgeSearchRoots','GameSearchRoots','UploadUri','PriceRefreshUri','PatchVersion','PatchBuild','PatchChannel','CacheRoot')) {
    $value = Get-Variable -Name $name -ValueOnly
    if ($PSBoundParameters.ContainsKey($name)) { $config.$name = $value }
}
if ($DryRun) {
    [pscustomobject]@{ DryRun = $true; ConfigPath = $paths.Config; SecretWouldBeUpdated = [bool]$UploadSecret; Config = $config }
    exit 0
}
Write-WikeloCollectorConfig -Config $config -Path $paths.Config -Confirm:$false
if ($UploadSecret) { Protect-WikeloUploadSecret -Secret $UploadSecret -Path $paths.Secret -Confirm:$false }
[pscustomobject]@{ ConfigPath = $paths.Config; SecretUpdated = [bool]$UploadSecret }
