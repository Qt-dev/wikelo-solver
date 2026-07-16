[CmdletBinding(SupportsShouldProcess)]
param(
    [ValidateSet('All', 'Recipes', 'Prices')][string]$Mode = 'All',
    [ValidateRange(1, 24)][int]$PriceIntervalHours = 6,
    [switch]$DryRun
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$collector = Join-Path $PSScriptRoot 'Collect-WikeloData.ps1'
$powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$recipeArguments = "-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File `"$collector`" -Mode Recipes"
$priceArguments = "-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File `"$collector`" -Mode Prices"
$definitions = @(
    [pscustomobject]@{ Name='WikeloSolver-Recipes'; Schedule='Daily 03:00 plus user logon; StartWhenAvailable'; Execute=$powerShell; Arguments=$recipeArguments }
    [pscustomobject]@{ Name='WikeloSolver-Prices'; Schedule="Every $PriceIntervalHours hours; StartWhenAvailable"; Execute=$powerShell; Arguments=$priceArguments }
)
$definitions = @($definitions | Where-Object {
    $Mode -eq 'All' -or
    ($Mode -eq 'Recipes' -and $_.Name -eq 'WikeloSolver-Recipes') -or
    ($Mode -eq 'Prices' -and $_.Name -eq 'WikeloSolver-Prices')
})
if ($DryRun) { $definitions; exit 0 }
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 4)
$recipeAction = New-ScheduledTaskAction -Execute $powerShell -Argument $recipeArguments
$recipeTriggers = @(
    New-ScheduledTaskTrigger -Daily -At '03:00'
    New-ScheduledTaskTrigger -AtLogOn -User $currentUser
)
$priceAction = New-ScheduledTaskAction -Execute $powerShell -Argument $priceArguments
$priceStart = (Get-Date).Date.AddMinutes(15)
if ($priceStart -le (Get-Date)) { $priceStart = $priceStart.AddDays(1) }
$priceTrigger = New-ScheduledTaskTrigger -Once -At $priceStart -RepetitionInterval (New-TimeSpan -Hours $PriceIntervalHours) -RepetitionDuration (New-TimeSpan -Days 3650)
if ($PSCmdlet.ShouldProcess('Current user Task Scheduler', 'Register Wikelo Solver scheduled tasks')) {
    if ($Mode -in @('All', 'Recipes')) {
        Register-ScheduledTask -TaskName 'WikeloSolver-Recipes' -Action $recipeAction -Trigger $recipeTriggers -Settings $settings -Principal $principal -Description 'Collect and upload normalized Wikelo recipes.' -Force | Out-Null
    }
    if ($Mode -in @('All', 'Prices')) {
        Register-ScheduledTask -TaskName 'WikeloSolver-Prices' -Action $priceAction -Trigger $priceTrigger -Settings $settings -Principal $principal -Description "Request a Wikelo price refresh every $PriceIntervalHours hours." -Force | Out-Null
    }
}
$definitions
