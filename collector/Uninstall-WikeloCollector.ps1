[CmdletBinding(SupportsShouldProcess)]
param([switch]$DryRun, [switch]$RemoveLocalData)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'WikeloCollector.psm1') -Force
$taskNames = @('WikeloSolver-Recipes', 'WikeloSolver-Prices')
if ($DryRun) {
    [pscustomobject]@{ DryRun=$true; Tasks=$taskNames; LocalData=(Get-WikeloCollectorPaths).Root; WouldRemoveLocalData=[bool]$RemoveLocalData }
    exit 0
}
foreach ($name in $taskNames) {
    if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
        if ($PSCmdlet.ShouldProcess($name, 'Unregister scheduled task')) { Unregister-ScheduledTask -TaskName $name -Confirm:$false }
    }
}
if ($RemoveLocalData) {
    $root = (Get-WikeloCollectorPaths).Root
    if ((Test-Path -LiteralPath $root) -and $PSCmdlet.ShouldProcess($root, 'Remove collector configuration, secret, state, output, and logs')) {
        Remove-Item -LiteralPath $root -Recurse -Force
    }
}
