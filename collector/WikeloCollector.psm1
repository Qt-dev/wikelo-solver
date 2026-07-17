Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:WikeloCollectorLogPath = $null

function Set-WikeloCollectorLogPath {
    param([string]$Path)
    $script:WikeloCollectorLogPath = $Path
}

function Write-WikeloCollectorDiagnostic {
    param([Parameter(Mandatory)][string]$Message)
    $line = "{0:o} [DIAGNOSTIC] {1}" -f [datetime]::UtcNow, $Message
    if ($script:WikeloCollectorLogPath) { Add-Content -LiteralPath $script:WikeloCollectorLogPath -Value $line -Encoding UTF8 }
    Write-Verbose $line
}

function Get-WikeloCollectorPaths {
    [CmdletBinding()]
    param([string]$LocalAppData = $env:LOCALAPPDATA)

    if ([string]::IsNullOrWhiteSpace($LocalAppData)) { throw 'LOCALAPPDATA is not available.' }
    $root = Join-Path $LocalAppData 'WikeloSolver'
    [pscustomobject]@{
        Root = $root
        Config = Join-Path $root 'collector.json'
        Secret = Join-Path $root 'upload-secret.dpapi'
        State = Join-Path $root 'collector-state.json'
        Output = Join-Path $root 'wikelo-normalized-v1.json'
        Logs = Join-Path $root 'logs'
        Cache = Join-Path $root 'data'
    }
}

function Get-WikeloDefaultConfig {
    [pscustomobject]@{
        Unp4kPath = $null
        UnforgePath = $null
        GameArchivePath = $null
        Unp4kSearchRoots = @()
        UnforgeSearchRoots = @()
        GameSearchRoots = @()
        UploadUri = 'http://127.0.0.1:3000/api/internal/imports/wikelo'
        PriceRefreshUri = 'http://127.0.0.1:3000/api/internal/prices/refresh'
        PatchVersion = $null
        PatchBuild = $null
        PatchChannel = 'live'
        LogRetentionDays = 14
        CacheRoot = $null
    }
}

function Get-WikeloCacheRoot {
    [CmdletBinding()]
    param($Config = (Read-WikeloCollectorConfig))
    $paths = Get-WikeloCollectorPaths
    if ($Config.CacheRoot) { return [Environment]::ExpandEnvironmentVariables([string]$Config.CacheRoot) }
    $paths.Cache
}

function Get-WikeloCacheValidation {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$CacheRoot,
        [Parameter(Mandatory)][string]$ArchivePath,
        [Parameter(Mandatory)][long]$ArchiveLength,
        [Parameter(Mandatory)][datetime]$ArchiveLastWriteUtc
    )
    $activeRoot = Join-Path $CacheRoot 'active'
    $manifestPath = Join-Path $activeRoot 'cache-manifest.json'
    $dataRoot = Join-Path $activeRoot 'Data'
    $collectorPath = Join-Path $dataRoot 'libs\foundry\records\contracts\contractgenerator\thecollector.xml'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { return [pscustomobject]@{ Valid = $false; Reason = 'completion marker is missing'; Root = $activeRoot } }
    try { $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json } catch { return [pscustomobject]@{ Valid = $false; Reason = 'completion marker is invalid'; Root = $activeRoot } }
    $sameArchive = ([string]$manifest.archivePath -eq [string](Resolve-Path -LiteralPath $ArchivePath).Path) -and
        ([long]$manifest.archiveLength -eq $ArchiveLength) -and
        ([datetime]$manifest.archiveLastWriteUtc).ToUniversalTime().Ticks -eq $ArchiveLastWriteUtc.ToUniversalTime().Ticks
    if (-not $sameArchive) { return [pscustomobject]@{ Valid = $false; Reason = 'archive path, size, or last-write time changed'; Root = $activeRoot; Manifest = $manifest } }
    if (-not (Test-Path -LiteralPath (Join-Path $dataRoot 'Game2.dcb') -PathType Leaf) -and -not (Test-Path -LiteralPath (Join-Path $dataRoot 'Game.dcb') -PathType Leaf)) { return [pscustomobject]@{ Valid = $false; Reason = 'cached DCB is missing'; Root = $activeRoot; Manifest = $manifest } }
    if (-not (Test-Path -LiteralPath $collectorPath -PathType Leaf)) { return [pscustomobject]@{ Valid = $false; Reason = 'cached TheCollector XML is missing'; Root = $activeRoot; Manifest = $manifest } }
    [pscustomobject]@{ Valid = $true; Reason = 'cache metadata matches'; Root = $activeRoot; ExtractionPath = $dataRoot; Manifest = $manifest }
}

function Write-WikeloCacheManifest {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$CacheRoot,
        [Parameter(Mandatory)][string]$ArchivePath,
        [Parameter(Mandatory)][string]$ArchiveHash,
        [Parameter(Mandatory)][long]$ArchiveLength,
        [Parameter(Mandatory)][datetime]$ArchiveLastWriteUtc,
        [Parameter(Mandatory)][string]$DcbName,
        [Parameter(Mandatory)][string]$Unp4kPath,
        [Parameter(Mandatory)][string]$UnforgePath
    )
    [ordered]@{
        archivePath = (Resolve-Path -LiteralPath $ArchivePath).Path
        archiveHash = $ArchiveHash.ToLowerInvariant()
        archiveLength = $ArchiveLength
        archiveLastWriteUtc = $ArchiveLastWriteUtc.ToUniversalTime().ToString('o')
        dcbName = $DcbName
        unp4kPath = $Unp4kPath
        unforgePath = $UnforgePath
        completedAt = [datetime]::UtcNow.ToString('o')
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $CacheRoot 'cache-manifest.json') -Encoding UTF8
}

function Publish-WikeloCache {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$StagingRoot, [Parameter(Mandatory)][string]$CacheRoot)
    $activeRoot = Join-Path $CacheRoot 'active'
    $backupRoot = Join-Path $CacheRoot ('.previous-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force -Path $CacheRoot | Out-Null
    if (Test-Path -LiteralPath $activeRoot) { Move-Item -LiteralPath $activeRoot -Destination $backupRoot -Force }
    try {
        Move-Item -LiteralPath $StagingRoot -Destination $activeRoot -Force
    } catch {
        if (Test-Path -LiteralPath $backupRoot -PathType Container) { Move-Item -LiteralPath $backupRoot -Destination $activeRoot -Force }
        throw
    }
    if (Test-Path -LiteralPath $backupRoot) { Remove-Item -LiteralPath $backupRoot -Recurse -Force }
    $activeRoot
}

function Read-WikeloCollectorConfig {
    [CmdletBinding()]
    param([string]$Path = (Get-WikeloCollectorPaths).Config)

    $config = Get-WikeloDefaultConfig
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $config }
    $saved = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    foreach ($property in $saved.PSObject.Properties) {
        if ($config.PSObject.Properties.Name -contains $property.Name) {
            $config.$($property.Name) = $property.Value
        }
    }
    $config
}

function Write-WikeloCollectorConfig {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)]$Config,
        [string]$Path = (Get-WikeloCollectorPaths).Config
    )

    $parent = Split-Path -Parent $Path
    if ($PSCmdlet.ShouldProcess($Path, 'Write collector configuration')) {
        New-Item -ItemType Directory -Force -Path $parent | Out-Null
        $temp = "$Path.tmp"
        $Config | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $temp -Encoding UTF8
        Move-Item -LiteralPath $temp -Destination $Path -Force
    }
}

function Protect-WikeloUploadSecret {
    [CmdletBinding(SupportsShouldProcess)]
    param(
        [Parameter(Mandatory)][Security.SecureString]$Secret,
        [string]$Path = (Get-WikeloCollectorPaths).Secret
    )

    if ($env:OS -ne 'Windows_NT') { throw 'DPAPI secret storage is supported only on Windows.' }
    if ($PSCmdlet.ShouldProcess($Path, 'Store current-user DPAPI-protected upload secret')) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
        ConvertFrom-SecureString -SecureString $Secret | Set-Content -LiteralPath $Path -Encoding ASCII
    }
}

function Unprotect-WikeloUploadSecret {
    [CmdletBinding()]
    param([string]$Path = (Get-WikeloCollectorPaths).Secret)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Upload secret is not configured: $Path"
    }
    $ciphertext = (Get-Content -LiteralPath $Path -Raw).Trim()
    $secure = ConvertTo-SecureString -String $ciphertext
    $credential = [System.Net.NetworkCredential]::new('', $secure)
    $credential.Password
}

function Resolve-WikeloUnp4k {
    [CmdletBinding()]
    param($Config = (Read-WikeloCollectorConfig))

    if ($Config.Unp4kPath) {
        $configured = [Environment]::ExpandEnvironmentVariables([string]$Config.Unp4kPath)
        if (Test-Path -LiteralPath $configured -PathType Leaf) { return (Resolve-Path -LiteralPath $configured).Path }
        throw "Configured unp4k executable does not exist: $configured"
    }
    $command = Get-Command 'unp4k.exe' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    foreach ($rootValue in @($Config.Unp4kSearchRoots)) {
        $root = [Environment]::ExpandEnvironmentVariables([string]$rootValue)
        if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
        $found = Get-ChildItem -LiteralPath $root -Filter 'unp4k.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    throw 'unp4k.exe was not found. Configure Unp4kPath or Unp4kSearchRoots.'
}

function Resolve-WikeloGameArchive {
    [CmdletBinding()]
    param($Config = (Read-WikeloCollectorConfig))

    if ($Config.GameArchivePath) {
        $configured = [Environment]::ExpandEnvironmentVariables([string]$Config.GameArchivePath)
        if (Test-Path -LiteralPath $configured -PathType Leaf) { return (Resolve-Path -LiteralPath $configured).Path }
        throw "Configured game archive does not exist: $configured"
    }
    $matches = [System.Collections.Generic.List[string]]::new()
    foreach ($rootValue in @($Config.GameSearchRoots)) {
        $root = [Environment]::ExpandEnvironmentVariables([string]$rootValue)
        if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
        Get-ChildItem -LiteralPath $root -Filter 'Data.p4k' -File -Recurse -ErrorAction SilentlyContinue |
            ForEach-Object { $matches.Add($_.FullName) }
    }
    $unique = @($matches | Sort-Object -Unique)
    if ($unique.Count -eq 1) { return $unique[0] }
    if ($unique.Count -gt 1) { throw "Multiple Data.p4k archives found; set GameArchivePath explicitly:`n$($unique -join "`n")" }
    throw 'Data.p4k was not found. Configure GameArchivePath or GameSearchRoots.'
}

function Resolve-WikeloUnforge {
    [CmdletBinding()]
    param($Config = (Read-WikeloCollectorConfig))

    if ($Config.UnforgePath) {
        $configured = [Environment]::ExpandEnvironmentVariables([string]$Config.UnforgePath)
        if (Test-Path -LiteralPath $configured -PathType Leaf) { return (Resolve-Path -LiteralPath $configured).Path }
        throw "Configured unforge executable does not exist: $configured"
    }
    $command = Get-Command 'unforge.cli.exe' -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return $command.Source }
    foreach ($rootValue in @($Config.UnforgeSearchRoots)) {
        $root = [Environment]::ExpandEnvironmentVariables([string]$rootValue)
        if (-not (Test-Path -LiteralPath $root -PathType Container)) { continue }
        $found = Get-ChildItem -LiteralPath $root -Filter 'unforge.cli.exe' -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    throw 'unforge.cli.exe was not found. Configure UnforgePath or UnforgeSearchRoots.'
}

function Get-WikeloProperty {
    param($Object, [string[]]$Names)
    if ($null -eq $Object) { return $null }
    foreach ($name in $Names) {
        if ($Object -is [Collections.IDictionary]) {
            foreach ($key in $Object.Keys) { if ([string]$key -ieq $name) { return $Object[$key] } }
        } else {
            $property = $Object.PSObject.Properties | Where-Object Name -IEQ $name | Select-Object -First 1
            if ($property) { return $property.Value }
        }
    }
    $null
}

function Get-WikeloObjectChildren {
    param($Object)
    if ($null -eq $Object -or $Object -is [string] -or $Object.GetType().IsPrimitive) { return }
    if ($Object -is [Collections.IDictionary]) {
        foreach ($value in $Object.Values) { Write-Output -NoEnumerate $value }
    } elseif ($Object -is [Collections.IEnumerable] -and $Object -isnot [pscustomobject]) {
        foreach ($value in $Object) { Write-Output -NoEnumerate $value }
    } else {
        foreach ($property in $Object.PSObject.Properties) {
            if ($property.Name -notmatch '^#') { Write-Output -NoEnumerate $property.Value }
        }
    }
}

function Find-WikeloRecipeCandidates {
    param($Root)
    $queue = [Collections.Queue]::new()
    $queue.Enqueue($Root)
    while ($queue.Count -gt 0) {
        $node = $queue.Dequeue()
        if ($null -eq $node) { continue }
        $components = Get-WikeloProperty $node @('components', 'ingredients', 'requirements', 'inputs', 'costs')
        $name = Get-WikeloProperty $node @('name', 'displayName', 'title', 'recipeName')
        if ($null -ne $components -and -not [string]::IsNullOrWhiteSpace([string]$name)) {
            Write-Output -NoEnumerate $node
            continue
        }
        foreach ($child in @(Get-WikeloObjectChildren $node)) {
            if ($null -ne $child -and $child -isnot [string] -and -not $child.GetType().IsPrimitive) { $queue.Enqueue($child) }
        }
    }
}

function Find-WikeloFirstPropertyValue {
    param($Root, [string[]]$Names)
    $queue = [Collections.Queue]::new()
    $queue.Enqueue($Root)
    $visited = 0
    while ($queue.Count -gt 0 -and $visited -lt 100000) {
        $node = $queue.Dequeue()
        $visited++
        if ($null -eq $node) { continue }
        $value = Get-WikeloProperty $node $Names
        if ($null -ne $value -and -not [string]::IsNullOrWhiteSpace([string]$value)) { return $value }
        foreach ($child in @(Get-WikeloObjectChildren $node)) {
            if ($null -ne $child -and $child -isnot [string] -and -not $child.GetType().IsPrimitive) { $queue.Enqueue($child) }
        }
    }
    $null
}

function ConvertTo-WikeloNumber {
    param($Value, [double]$Default = 0)
    if ($null -eq $Value) { return $Default }
    $parsed = 0.0
    if ([double]::TryParse([string]$Value, [Globalization.NumberStyles]::Any, [Globalization.CultureInfo]::InvariantCulture, [ref]$parsed)) { return $parsed }
    $Default
}

function Get-WikeloStableId {
    param([string]$Text, [string]$Prefix)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $hash = $sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Text)) } finally { $sha.Dispose() }
    "$Prefix-$(([BitConverter]::ToString($hash) -replace '-', '').Substring(0, 24).ToLowerInvariant())"
}

function ConvertTo-WikeloComponent {
    param($Component)
    $item = Get-WikeloProperty $Component @('item', 'commodity', 'resource', 'input')
    if ($null -eq $item) { $item = $Component }
    $name = [string](Get-WikeloProperty $item @('name', 'displayName', 'title', 'itemName'))
    if ([string]::IsNullOrWhiteSpace($name)) { $name = [string](Get-WikeloProperty $Component @('name', 'displayName', 'title', 'itemName')) }
    if ([string]::IsNullOrWhiteSpace($name)) { throw 'A recipe component has no discoverable name.' }
    $id = [string](Get-WikeloProperty $item @('gameItemId', 'itemId', 'id', 'uuid', 'className', 'class'))
    if ([string]::IsNullOrWhiteSpace($id)) { $id = Get-WikeloStableId $name 'item' }
    $category = [string](Get-WikeloProperty $item @('category', 'type', 'group'))
    if ([string]::IsNullOrWhiteSpace($category)) { $category = 'unknown' }
    $quantity = ConvertTo-WikeloNumber (Get-WikeloProperty $Component @('quantity', 'amount', 'count', 'value')) 1
    [ordered]@{ gameItemId = $id; name = $name; category = $category; quantity = $quantity }
}

function ConvertTo-WikeloRecipe {
    param($Candidate)
    $name = [string](Get-WikeloProperty $Candidate @('name', 'displayName', 'title', 'recipeName'))
    $category = [string](Get-WikeloProperty $Candidate @('category', 'type', 'group'))
    if ([string]::IsNullOrWhiteSpace($category)) { $category = 'unknown' }
    $rawComponents = Get-WikeloProperty $Candidate @('components', 'ingredients', 'requirements', 'inputs', 'costs')
    $components = @($rawComponents | ForEach-Object { ConvertTo-WikeloComponent $_ })
    if ($components.Count -eq 0) { throw "Recipe '$name' has no components." }

    $rawOutput = Get-WikeloProperty $Candidate @('output', 'reward', 'result', 'product')
    if ($null -eq $rawOutput) { $rawOutput = $Candidate }
    $outputName = [string](Get-WikeloProperty $rawOutput @('name', 'displayName', 'title', 'itemName', 'outputName'))
    if ([string]::IsNullOrWhiteSpace($outputName) -or $outputName -eq $name) {
        $explicitOutputName = Get-WikeloProperty $Candidate @('outputName', 'rewardName', 'resultName')
        if ($explicitOutputName) { $outputName = [string]$explicitOutputName }
    }
    if ([string]::IsNullOrWhiteSpace($outputName)) { $outputName = $name }
    $outputId = [string](Get-WikeloProperty $rawOutput @('gameItemId', 'itemId', 'id', 'uuid', 'className'))
    if ([string]::IsNullOrWhiteSpace($outputId)) { $outputId = $null }
    $outputQuantity = ConvertTo-WikeloNumber (Get-WikeloProperty $rawOutput @('quantity', 'amount', 'count', 'outputQuantity')) 1
    $id = [string](Get-WikeloProperty $Candidate @('gameRecipeId', 'recipeId', 'id', 'uuid', 'className'))
    if ([string]::IsNullOrWhiteSpace($id)) {
        $identity = "$name|$category|$outputName|$(($components | ConvertTo-Json -Compress -Depth 5))"
        $id = Get-WikeloStableId $identity 'recipe'
    }
    [ordered]@{
        gameRecipeId = $id
        name = $name
        category = $category
        output = [ordered]@{ gameItemId = $outputId; name = $outputName; quantity = $outputQuantity; kind = 'item'; grantTiming = 'mission_completion'; externalUrl = $null }
        outputs = @([ordered]@{ gameItemId = $outputId; name = $outputName; quantity = $outputQuantity; kind = 'item'; grantTiming = 'mission_completion'; externalUrl = $null })
        reputationNeeded = ConvertTo-WikeloNumber (Get-WikeloProperty $Candidate @('reputationNeeded', 'requiredReputation', 'reputationRequirement')) 0
        reputationNeededLabel = $null
        reputationGranted = ConvertTo-WikeloNumber (Get-WikeloProperty $Candidate @('reputationGranted', 'grantedReputation', 'reputationReward')) 0
        components = $components
    }
}

function Read-WikeloExtractedDocument {
    param([Parameter(Mandatory)][IO.FileInfo]$File)
    try {
        if ($File.Extension -ieq '.json') { return (Get-Content -LiteralPath $File.FullName -Raw | ConvertFrom-Json) }
        if ($File.Extension -in @('.xml', '.socpak')) {
            [xml]$xml = Get-Content -LiteralPath $File.FullName -Raw
            return $xml
        }
    } catch {
        Write-Verbose "Ignoring unparseable candidate '$($File.FullName)': $($_.Exception.Message)"
    }
    $null
}

function Get-WikeloXmlValue {
    param([System.Xml.XmlElement]$Node, [string[]]$Names)
    foreach ($name in $Names) {
        if ($Node.HasAttribute($name)) { return $Node.GetAttribute($name) }
        $child = $Node.SelectSingleNode("./*[local-name()='$name']")
        if ($child) { return $child.InnerText }
    }
    $null
}

function Read-WikeloLocalization {
    [CmdletBinding()]
    param([string]$Path)
    $values = @{}
    if (-not $Path -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $values }
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith(';') -or $trimmed.StartsWith('#') -or $trimmed.StartsWith('[') -or $trimmed -notmatch '=') { continue }
        $parts = $trimmed.Split('=', 2)
        $key = $parts[0].Trim()
        if ($key) { $values[$key.ToLowerInvariant()] = $parts[1].Trim() }
    }
    $values
}

function Resolve-WikeloLocalizedName {
    param([string]$Value, [hashtable]$Localization)
    if ([string]::IsNullOrWhiteSpace($Value)) { return $Value }
    $key = if ($Value.StartsWith('@')) { $Value.Substring(1) } else { $Value }
    if ($Localization.ContainsKey($key.ToLowerInvariant())) {
        $resolved = [string]$Localization[$key.ToLowerInvariant()]
        if ($resolved -match '(?i)uninitialized|loc_empty|placeholder') { return $null }
        return $resolved
    }
    if ($Value -match '(?i)uninitialized|loc_empty|placeholder') { return $null }
    $Value
}

function Resolve-WikeloReferenceName {
    param([string]$Reference, [hashtable]$ReferenceNames, [hashtable]$Localization = @{})
    if ([string]::IsNullOrWhiteSpace($Reference)) { return $Reference }
    $key = $Reference.Trim()
    if ($ReferenceNames.ContainsKey($key)) {
        $name = Resolve-WikeloLocalizedName ([string]$ReferenceNames[$key]) $Localization
        if ($name) { return $name }
    }
    if ($key.StartsWith('@') -and $ReferenceNames.ContainsKey($key.Substring(1))) {
        $name = Resolve-WikeloLocalizedName ([string]$ReferenceNames[$key.Substring(1)]) $Localization
        if ($name) { return $name }
    }
    $fallback = Resolve-WikeloLocalizedName $key $Localization
    if ($fallback) { return $fallback }
    $Reference
}

function Get-WikeloXmlReferenceValue {
    param([System.Xml.XmlElement]$Node)
    [string](Get-WikeloXmlValue $Node @('entityClass','resource','reference','__ref'))
}

function Get-WikeloXmlReference {
    param([System.Xml.XmlElement]$Node, [hashtable]$ReferenceNames, [hashtable]$Localization = @{})
    $reference = [string](Get-WikeloXmlValue $Node @('entityClass','resource','reference','__ref'))
    if ([string]::IsNullOrWhiteSpace($reference)) { return $null }
    Resolve-WikeloReferenceName $reference $ReferenceNames $Localization
}

function Get-WikeloRewardReferenceValue {
    param([System.Xml.XmlElement]$Node)
    if ($Node.LocalName -eq 'ContractResult_ItemsWeighting') {
        $weighted = $Node.SelectSingleNode(".//*[local-name()='ItemAwardEntityClass']")
        if ($weighted) { return Get-WikeloXmlReferenceValue $weighted }
    }
    if ($Node.LocalName -eq 'BlueprintRewards') { return [string](Get-WikeloXmlValue $Node @('blueprintPool')) }
    Get-WikeloXmlReferenceValue $Node
}

function ConvertTo-WikeloFileDisplayName {
    param([IO.FileInfo]$File)
    $stem = [IO.Path]::GetFileNameWithoutExtension($File.Name)
    $isBlueprint = $stem -match '^bp_(reward|craft)_'
    $stem = $stem -replace '^bp_(reward|craft)_', ''
    $words = (($stem -creplace '([a-z0-9])([A-Z])', '$1 $2') -replace '[_-]+', ' ').Trim()
    if (-not $words) { return $null }
    $name = [Globalization.CultureInfo]::InvariantCulture.TextInfo.ToTitleCase($words.ToLowerInvariant())
    if ($isBlueprint) { return "$name Blueprint" }
    $name
}

function Get-WikeloRewardGrantTiming {
    param([System.Xml.XmlElement]$Node)
    $results = @($Node.SelectNodes("./*[local-name()='missionResults']/*[local-name()='Bool']"))
    if ($results.Count -gt 1 -and $results[1].GetAttribute('value') -eq '1') { return 'mission_start' }
    if ($results.Count -gt 0 -and $results[0].GetAttribute('value') -eq '1') { return 'mission_completion' }
    'other'
}

function Get-WikeloBlueprintEntries {
    param(
        [string]$PoolReference,
        [hashtable]$ReferenceNames,
        [hashtable]$ReferencePaths,
        [hashtable]$Localization,
        [string]$GrantTiming
    )
    $entries = [Collections.Generic.List[object]]::new()
    $poolPath = if ($ReferencePaths.ContainsKey($PoolReference)) { $ReferencePaths[$PoolReference] } elseif ($PoolReference.StartsWith('@') -and $ReferencePaths.ContainsKey($PoolReference.Substring(1))) { $ReferencePaths[$PoolReference.Substring(1)] } else { $null }
    if ($poolPath) {
        try {
            [xml]$poolDocument = Get-Content -LiteralPath $poolPath -Raw
            foreach ($blueprintReward in @($poolDocument.SelectNodes("//*[local-name()='BlueprintReward' and @blueprintRecord]"))) {
                $blueprintReference = $blueprintReward.GetAttribute('blueprintRecord')
                if (-not $blueprintReference) { continue }
                $blueprintName = Resolve-WikeloReferenceName $blueprintReference $ReferenceNames $Localization
                $blueprintPath = if ($ReferencePaths.ContainsKey($blueprintReference)) { $ReferencePaths[$blueprintReference] } elseif ($blueprintReference.StartsWith('@') -and $ReferencePaths.ContainsKey($blueprintReference.Substring(1))) { $ReferencePaths[$blueprintReference.Substring(1)] } else { $null }
                $scmdbUrl = $null
                if ($blueprintPath) {
                    try {
                        [xml]$blueprintDocument = Get-Content -LiteralPath $blueprintPath -Raw
                        $rootName = $blueprintDocument.DocumentElement.LocalName
                        if ($rootName -match '(?i)(?:^|\.)(BP_CRAFT_[A-Za-z0-9_]+)$') {
                            $fabId = $Matches[1]
                            $scmdbUrl = "https://scmdb.net/?page=fab&fab=$([uri]::EscapeDataString($fabId))"
                        }
                        $creationNode = $blueprintDocument.SelectSingleNode("//*[local-name()='CraftingProcess_Creation' and @entityClass]")
                        if ($creationNode) {
                            $createdReference = $creationNode.GetAttribute('entityClass')
                            $createdName = Resolve-WikeloReferenceName $createdReference $ReferenceNames $Localization
                            if ($createdName -and $createdName -ne $createdReference -and $createdName -notmatch '^[0-9a-f]{8}-[0-9a-f-]{27,}$') { $blueprintName = "$createdName Blueprint" }
                        }
                    } catch { Write-Verbose "Unable to parse blueprint '$blueprintReference' from '$blueprintPath': $($_.Exception.Message)" }
                }
                $entries.Add([ordered]@{ gameItemId = $blueprintReference; name = $blueprintName; quantity = 1; kind = 'blueprint'; grantTiming = $GrantTiming; externalUrl = $scmdbUrl })
            }
        } catch { Write-Verbose "Unable to parse blueprint pool '$PoolReference' from '$poolPath': $($_.Exception.Message)" }
    }
    if ($entries.Count -eq 0) {
        $entries.Add([ordered]@{ gameItemId = $PoolReference; name = (Resolve-WikeloReferenceName $PoolReference $ReferenceNames $Localization); quantity = 1; kind = 'blueprint'; grantTiming = $GrantTiming; externalUrl = $null })
    }
    @($entries)
}

function Get-WikeloRewardEntries {
    param([System.Xml.XmlElement]$Node, [hashtable]$ReferenceNames, [hashtable]$ReferencePaths, [hashtable]$Localization)
    $entries = [Collections.Generic.List[object]]::new()
    $grantTiming = Get-WikeloRewardGrantTiming $Node
    if ($Node.LocalName -eq 'ContractResult_ItemsWeighting') {
        foreach ($award in @($Node.SelectNodes(".//*[local-name()='ItemAwardEntityClass']"))) {
            $reference = Get-WikeloXmlReferenceValue $award
            if ($reference) {
                $quantity = ConvertTo-WikeloNumber (Get-WikeloXmlValue $award @('amountToAward','amount','quantity')) 1
                $entries.Add([ordered]@{ gameItemId = $reference; quantity = [math]::Max(1, [math]::Ceiling($quantity)); kind = 'item'; grantTiming = $grantTiming; externalUrl = $null })
            }
        }
    } elseif ($Node.LocalName -eq 'BlueprintRewards') {
        $reference = [string](Get-WikeloXmlValue $Node @('blueprintPool'))
        if ($reference) { foreach ($entry in @(Get-WikeloBlueprintEntries $reference $ReferenceNames $ReferencePaths $Localization $grantTiming)) { $entries.Add($entry) } }
    } else {
        $reference = Get-WikeloXmlReferenceValue $Node
        if ($reference) {
            $quantity = ConvertTo-WikeloNumber (Get-WikeloXmlValue $Node @('amount','amountToAward','quantity')) 1
            $entries.Add([ordered]@{ gameItemId = $reference; quantity = [math]::Max(1, [math]::Ceiling($quantity)); kind = 'item'; grantTiming = $grantTiming; externalUrl = $null })
        }
    }
    @($entries)
}

function Get-WikeloRewardReference {
    param([System.Xml.XmlElement]$Node, [hashtable]$ReferenceNames, [hashtable]$Localization = @{})
    if ($Node.LocalName -eq 'ContractResult_ItemsWeighting') {
        $weighted = $Node.SelectSingleNode(".//*[local-name()='ItemAwardEntityClass']")
        if ($weighted) { return Get-WikeloXmlReference $weighted $ReferenceNames $Localization }
    }
    if ($Node.LocalName -eq 'BlueprintRewards') {
        $pool = [string](Get-WikeloXmlValue $Node @('blueprintPool'))
        if ($pool) {
            if ($ReferenceNames.ContainsKey($pool)) { return Resolve-WikeloLocalizedName ([string]$ReferenceNames[$pool]) $Localization }
            return Resolve-WikeloLocalizedName $pool $Localization
        }
    }
    Get-WikeloXmlReference $Node $ReferenceNames $Localization
}

function Get-WikeloReferencedRoot {
    param([string]$Reference, [hashtable]$ReferencePaths, [hashtable]$DocumentCache)
    if (-not $Reference) { return $null }
    $key = if ($ReferencePaths.ContainsKey($Reference)) { $Reference } elseif ($Reference.StartsWith('@') -and $ReferencePaths.ContainsKey($Reference.Substring(1))) { $Reference.Substring(1) } else { return $null }
    if (-not $DocumentCache.ContainsKey($key)) {
        try {
            [xml]$document = Get-Content -LiteralPath $ReferencePaths[$key] -Raw
            $DocumentCache[$key] = $document
        } catch { return $null }
    }
    $DocumentCache[$key].SelectSingleNode("//*[@__ref='$Reference' or @__ref='@$Reference']")
}

function Get-WikeloReferencedNumber {
    param([string]$Reference, [string[]]$Names, [hashtable]$ReferencePaths, [hashtable]$DocumentCache)
    $node = Get-WikeloReferencedRoot $Reference $ReferencePaths $DocumentCache
    if (-not $node) { return 0 }
    ConvertTo-WikeloNumber (Get-WikeloXmlValue $node $Names) 0
}

function Get-WikeloXmlRootMetadata {
    [CmdletBinding()]
    param([Parameter(Mandatory)][IO.FileInfo]$File)
    $reader = $null
    $rootRef = $null
    $rootName = $null
    $nestedRefs = [Collections.Generic.List[object]]::new()
    $creationRefs = [Collections.Generic.List[object]]::new()
    $compositionRefs = [Collections.Generic.List[string]]::new()
    $elementCount = 0
    try {
        $settings = [Xml.XmlReaderSettings]::new()
        $settings.IgnoreComments = $true
        $reader = [Xml.XmlReader]::Create($File.FullName, $settings)
        while ($reader.Read()) {
            if ($reader.NodeType -eq [Xml.XmlNodeType]::Element) {
                $elementCount++
                $ref = $reader.GetAttribute('__ref')
                $name = @('Name', 'name', 'DisplayName', 'displayName', 'debugName') | ForEach-Object { $reader.GetAttribute($_) } | Where-Object { $_ } | Select-Object -First 1
                $isPreferredName = $false
                if ($reader.LocalName -eq 'Localization') {
                    $name = $reader.GetAttribute('Name')
                    $isPreferredName = [bool]$name
                } elseif ($reader.LocalName -eq 'VehicleComponentParams') {
                    $name = $reader.GetAttribute('vehicleName')
                    $isPreferredName = [bool]$name
                } elseif ($reader.LocalName -eq 'SCItemPurchasableParams') {
                    $name = $reader.GetAttribute('displayName')
                    $isPreferredName = [bool]$name
                }
                if ($name -match '(?i)loc_uninitialized|loc_empty|loc_placeholder|^<=\s*placeholder\s*=>$') { $name = $null; $isPreferredName = $false }
                if ($reader.Depth -eq 0 -and $ref) {
                    $rootRef = $ref
                    if ($name) { $rootName = $name }
                } elseif ($ref) {
                    $nestedRefs.Add([pscustomobject]@{ Reference = $ref; Name = $name })
                }
                if ($reader.LocalName -eq 'CraftingProcess_Creation') {
                    $createdRef = $reader.GetAttribute('entityClass')
                    if ($createdRef) {
                        $createdName = '@item_Name_' + (([IO.Path]::GetFileNameWithoutExtension($File.Name)) -replace '^bp_craft_', '')
                        $creationRefs.Add([pscustomobject]@{ Reference = $createdRef; Name = $createdName })
                    }
                }
                if ($reader.LocalName -eq 'ResourceContainerDefaultCompositionEntry') {
                    $compositionRef = $reader.GetAttribute('entry')
                    if ($compositionRef) { $compositionRefs.Add($compositionRef) }
                }
                if ($rootRef -and $name -and (-not $rootName -or $isPreferredName)) { $rootName = $name }
                if ($rootRef -and $rootName -and $isPreferredName -and $reader.LocalName -ne 'SCItemPurchasableParams' -and $creationRefs.Count -eq 0 -and $compositionRefs.Count -eq 0) {
                    return [pscustomobject]@{ Path = $File.FullName; Reference = $rootRef; Name = $rootName; IsRoot = $true; Kind = 'root' }
                }
                if ($rootRef -and $rootName -and $elementCount -ge 64) {
                    [pscustomobject]@{ Path = $File.FullName; Reference = $rootRef; Name = $rootName; IsRoot = $true; Kind = 'root' }
                    foreach ($created in $creationRefs) { [pscustomobject]@{ Path = $File.FullName; Reference = $created.Reference; Name = $created.Name; IsRoot = $false; Kind = 'creation' } }
                    foreach ($composition in $compositionRefs) { [pscustomobject]@{ Path = $File.FullName; Reference = $composition; Name = $rootName; IsRoot = $false; Kind = 'composition' } }
                    return
                }
            }
        }
        if ($rootRef) {
            [pscustomobject]@{ Path = $File.FullName; Reference = $rootRef; Name = $rootName; IsRoot = $true; Kind = 'root' }
            foreach ($created in $creationRefs) { [pscustomobject]@{ Path = $File.FullName; Reference = $created.Reference; Name = $created.Name; IsRoot = $false; Kind = 'creation' } }
            foreach ($composition in $compositionRefs) { [pscustomobject]@{ Path = $File.FullName; Reference = $composition; Name = $rootName; IsRoot = $false; Kind = 'composition' } }
        } else {
            foreach ($nested in $nestedRefs) { [pscustomobject]@{ Path = $File.FullName; Reference = $nested.Reference; Name = $nested.Name; IsRoot = $false; Kind = 'nested' } }
        }
    } finally {
        if ($reader) { $reader.Dispose() }
    }
}

function Convert-WikeloCollectorXmlToNormalizedV1 {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$ExtractionPath,
        [Parameter(Mandatory)][string]$SourceHash,
        [string]$PatchVersion,
        [string]$PatchBuild,
        [string]$PatchChannel = 'live',
        [string]$LocalizationPath,
        [datetime]$ExtractedAt = [datetime]::UtcNow
    )

    $collectorPath = Get-Item -LiteralPath (Join-Path $ExtractionPath 'libs\foundry\records\contracts\contractgenerator\thecollector.xml') -ErrorAction SilentlyContinue
    if (-not $collectorPath) {
        $collectorPath = Get-ChildItem -LiteralPath $ExtractionPath -Recurse -File -Filter 'thecollector.xml' -ErrorAction SilentlyContinue | Select-Object -First 1
    }
    if (-not $collectorPath) { throw 'TheCollector XML was not found at Data/libs/foundry/records/contracts/contractgenerator/thecollector.xml.' }
    if (-not $LocalizationPath) { $LocalizationPath = Join-Path $ExtractionPath 'Localization\english\global.ini' }
    $localization = Read-WikeloLocalization -Path $LocalizationPath
    Write-WikeloCollectorDiagnostic "Localization source: $LocalizationPath; keys=$($localization.Count)"

    $xmlFiles = @(Get-ChildItem -LiteralPath $ExtractionPath -Recurse -File -Filter '*.xml')
    Write-WikeloCollectorDiagnostic "XML index: discovered $($xmlFiles.Count) XML files; reading root metadata only."
    $referenceNames = @{}
    $referencePaths = @{}
    $compositionReferenceNames = @{}
    $xmlIndexStopwatch = [Diagnostics.Stopwatch]::StartNew()
    $xmlIndexNumber = 0
    foreach ($file in $xmlFiles) {
        $xmlIndexNumber++
        try {
            foreach ($metadata in @(Get-WikeloXmlRootMetadata -File $file)) {
                $ref = [string]$metadata.Reference
                $name = [string]$metadata.Name
                $localizedName = if ($name) { Resolve-WikeloLocalizedName $name $localization } else { $null }
                if (($metadata.IsRoot -or $metadata.Kind -eq 'creation') -and (-not $localizedName -or $localizedName.StartsWith('@'))) {
                    $name = ConvertTo-WikeloFileDisplayName -File $file
                    if ($metadata.Kind -eq 'creation') { $name = $name -replace ' Blueprint$', '' }
                }
                if (-not $name) { $name = $ref }
                $referenceNames[$ref] = $name
                $referencePaths[$ref] = $file.FullName
                if ($ref.StartsWith('@')) {
                    $referenceNames[$ref.Substring(1)] = $name
                    $referencePaths[$ref.Substring(1)] = $file.FullName
                }
                if ($metadata.Kind -eq 'composition' -and $name -and $name -ne $ref) {
                    $compositionReferenceNames[$ref] = [pscustomobject]@{ Name = $name; Path = $file.FullName }
                }
            }
        } catch { Write-Verbose "Ignoring unreadable XML metadata '$($file.FullName)': $($_.Exception.Message)" }
        if (($xmlIndexNumber % 100) -eq 0 -or $xmlIndexNumber -eq $xmlFiles.Count) {
            Write-WikeloCollectorDiagnostic "XML index progress: $xmlIndexNumber/$($xmlFiles.Count) files, $($referencePaths.Count) references, $([math]::Round($xmlIndexStopwatch.Elapsed.TotalMinutes, 1)) minutes elapsed."
        }
    }
    foreach ($compositionRef in $compositionReferenceNames.Keys) {
        $referenceNames[$compositionRef] = $compositionReferenceNames[$compositionRef].Name
        $referencePaths[$compositionRef] = $compositionReferenceNames[$compositionRef].Path
    }
    # These crafting resource type UUIDs have no standalone localized entity record in the extracted XML.
    $resourceNameOverrides = @{
        'bde5a2c8-2ef4-46ac-9403-2fcb79e4016c' = 'Quantainium'
        '4a47cad8-0271-4048-b19b-d9b52521fc20' = 'Savrilium'
    }
    foreach ($resourceId in $resourceNameOverrides.Keys) { $referenceNames[$resourceId] = $resourceNameOverrides[$resourceId] }
    $xmlIndexStopwatch.Stop()
    Write-WikeloCollectorDiagnostic "XML index complete: $($referencePaths.Count) references in $([math]::Round($xmlIndexStopwatch.Elapsed.TotalMinutes, 1)) minutes."
    try { [xml]$collector = Get-Content -LiteralPath $collectorPath.FullName -Raw } catch { throw "Unable to parse $($collectorPath.FullName): $($_.Exception.Message)" }

    $contracts = @($collector.SelectNodes("//*[local-name()='Contract']"))
    Write-WikeloCollectorDiagnostic "TheCollector scan: found $($contracts.Count) Contract nodes."
    $recipes = [Collections.Generic.List[object]]::new()
    # Keep fallback titles out of the emitted payload, but remember them long enough to
    # replace internal/test debug names with the real title of a matching reward contract.
    $fallbackTitleRecipeIds = @{}
    $internalFallbackTitleRecipeIds = @{}
    $referenceDocuments = @{}
    foreach ($contract in $contracts) {
        $template = $null
        $templateRef = [string](Get-WikeloXmlValue $contract @('template'))
        if ($templateRef) {
            $templatePath = if ($referencePaths.ContainsKey($templateRef)) { $referencePaths[$templateRef] } elseif ($templateRef.StartsWith('@') -and $referencePaths.ContainsKey($templateRef.Substring(1))) { $referencePaths[$templateRef.Substring(1)] } else { $null }
            if ($templatePath) {
                try {
                    [xml]$templateDocument = Get-Content -LiteralPath $templatePath -Raw
                    $template = $templateDocument.SelectSingleNode("//*[@__ref='$templateRef' or @__ref='@$templateRef']")
                } catch { Write-Verbose "Unable to parse template '$templateRef' from '$templatePath': $($_.Exception.Message)" }
            }
        }
        $sourceNodes = @($contract)
        if ($template) { $sourceNodes += $template }
        $requirements = [Collections.Generic.List[object]]::new()
        foreach ($source in $sourceNodes) {
            foreach ($property in @($source.SelectNodes(".//*[local-name()='MissionProperty' and @missionVariableName='HaulingOverride']"))) {
                foreach ($entity in @($property.SelectNodes(".//*[local-name()='HaulingOrderContent_EntityClass']"))) {
                    $referenceId = Get-WikeloXmlReferenceValue $entity
                    $reference = Resolve-WikeloReferenceName $referenceId $referenceNames $localization
                    if ($referenceId) {
                        $amount = ConvertTo-WikeloNumber (Get-WikeloXmlValue $entity @('minAmount','maxAmount')) 1
                        $requirements.Add([ordered]@{ gameItemId = $referenceId; name = $reference; category = 'resource'; quantity = [math]::Max(1, [math]::Ceiling($amount)) })
                    }
                }
                foreach ($resource in @($property.SelectNodes(".//*[local-name()='HaulingOrderContent_Resource']"))) {
                    $referenceId = Get-WikeloXmlReferenceValue $resource
                    $reference = Resolve-WikeloReferenceName $referenceId $referenceNames $localization
                    if ($referenceId) {
                        $amount = ConvertTo-WikeloNumber (Get-WikeloXmlValue $resource @('minSCU','maxSCU')) 1
                        $requirements.Add([ordered]@{ gameItemId = $referenceId; name = $reference; category = 'resource'; quantity = [math]::Max(1, [math]::Ceiling($amount)) })
                    }
                }
            }
        }
        $rewardNodes = @()
        foreach ($source in $sourceNodes) {
            $results = $source.SelectNodes(".//*[local-name()='contractResults']")
            foreach ($result in $results) {
                $rewardNodes = @($result.SelectNodes(".//*[local-name()='ContractResult_Item' or local-name()='ContractResult_ItemsWeighting' or local-name()='BlueprintRewards']"))
                if ($rewardNodes.Count -gt 0) { break }
            }
            if ($rewardNodes.Count -gt 0) { break }
        }
        if ($rewardNodes.Count -eq 0 -or $requirements.Count -eq 0) { Write-Verbose "Skipping incomplete contract '$($contract.GetAttribute('id'))'."; continue }
        $outputById = [ordered]@{}
        foreach ($rewardNode in $rewardNodes) {
            foreach ($entry in @(Get-WikeloRewardEntries $rewardNode $referenceNames $referencePaths $localization)) {
                $entryId = [string]$entry.gameItemId
                $entryNameValue = if ($entry.Contains('name')) { $entry['name'] } else { $null }
                $entryName = if ($entryNameValue) { [string]$entryNameValue } else { Resolve-WikeloReferenceName $entryId $referenceNames $localization }
                if ([string]::IsNullOrWhiteSpace($entryId) -or [string]::IsNullOrWhiteSpace([string]$entryName)) { continue }
                $entryQuantity = [int]$entry.quantity
                if (-not $outputById.Contains($entryId) -or [int]$outputById[$entryId].quantity -lt $entryQuantity) {
                    $outputById[$entryId] = [ordered]@{ gameItemId = $entryId; name = $entryName; quantity = $entryQuantity; kind = [string]$entry.kind; grantTiming = [string]$entry.grantTiming; externalUrl = $entry.externalUrl }
                }
            }
        }
        $outputs = @($outputById.Values)
        if ($outputs.Count -eq 0) {
            Write-Verbose "Skipping contract '$($contract.GetAttribute('id'))' because its reward has no resolvable reference."
            continue
        }
        $outputId = $outputs[0].gameItemId
        $output = $outputs[0].name
        $titleNode = $contract.SelectSingleNode(".//*[local-name()='ContractStringParam' and @param='Title']")
        $titleKey = if ($titleNode) { $titleNode.GetAttribute('value') } else { $null }
        $name = Resolve-WikeloLocalizedName $titleKey $localization
        $usedFallbackTitle = [string]::IsNullOrWhiteSpace($name) -or $name -eq $titleKey
        $fallbackDebugName = $null
        if ($usedFallbackTitle) {
            $fallbackDebugName = [string](Get-WikeloXmlValue $contract @('debugName','id'))
            $name = $fallbackDebugName
        }
        if ($name -match '^[A-Za-z][A-Za-z0-9_]+$') { $name = (($name -replace '_', ' ') -creplace '([a-z])([A-Z])', '$1 $2').Trim() }
        if (-not $name) { $name = $output }
        $id = [string](Get-WikeloXmlValue $contract @('id','debugName'))
        if (-not $id) { $id = Get-WikeloStableId "$name|$output" 'recipe' }
        $reputationNeeded = 0
        $reputationNeededLabel = $null
        $reputationGranted = 0
        foreach ($source in $sourceNodes) {
            foreach ($prerequisite in @($source.SelectNodes(".//*[local-name()='ContractPrerequisite_Reputation']"))) {
                $standingRef = [string](Get-WikeloXmlValue $prerequisite @('minStanding'))
                $standing = Get-WikeloReferencedRoot $standingRef $referencePaths $referenceDocuments
                if ($standing) {
                    $reputationNeeded = [math]::Max($reputationNeeded, (Get-WikeloReferencedNumber $standingRef @('minReputation') $referencePaths $referenceDocuments))
                    $reputationNeededLabel = Resolve-WikeloLocalizedName ([string](Get-WikeloXmlValue $standing @('displayName','name'))) $localization
                }
            }
            foreach ($reward in @($source.SelectNodes(".//*[local-name()='contractResultReputationAmounts']"))) {
                $rewardRef = [string](Get-WikeloXmlValue $reward @('reward'))
                $reputationGranted += Get-WikeloReferencedNumber $rewardRef @('reputationAmount') $referencePaths $referenceDocuments
            }
        }
        $recipes.Add([ordered]@{
                gameRecipeId = $id; name = $name; category = 'thecollector'
                output = $outputs[0]
                outputs = $outputs
                reputationNeeded = $reputationNeeded; reputationNeededLabel = $reputationNeededLabel; reputationGranted = $reputationGranted; components = @($requirements)
        })
        if ($usedFallbackTitle) {
            $fallbackTitleRecipeIds[$id] = $true
            # These names identify internal contract plumbing rather than player-facing
            # missions.  Other debug fallbacks (for example RedFightShotgun) remain valid
            # canonical candidates for an equivalent internal test contract.
            if ($fallbackDebugName -match '(?i)(?:flowtest|blueprintflow|(?:^|_)test(?:_|$)|^thecollector_)') {
                $internalFallbackTitleRecipeIds[$id] = $true
            }
        }
    }
    if ($recipes.Count -eq 0) { throw 'No complete Wikelo contracts with HaulingOverride inputs and contractResults rewards were found.' }
    # Some Collector entries are internal flow tests with no localized title.  When the
    # primary reward occurs on exactly one normally titled Collector contract, that title
    # is the authoritative player-facing name for the otherwise unnamed variant.
    $canonicalNamesByPrimaryOutput = @{}
    foreach ($recipe in $recipes) {
        if ($internalFallbackTitleRecipeIds.ContainsKey([string]$recipe.gameRecipeId)) { continue }
        $primaryOutputId = [string]$recipe.output.gameItemId
        if ([string]::IsNullOrWhiteSpace($primaryOutputId) -or [string]::IsNullOrWhiteSpace([string]$recipe.name)) { continue }
        if (-not $canonicalNamesByPrimaryOutput.ContainsKey($primaryOutputId)) { $canonicalNamesByPrimaryOutput[$primaryOutputId] = @() }
        if ($canonicalNamesByPrimaryOutput[$primaryOutputId] -notcontains [string]$recipe.name) {
            $canonicalNamesByPrimaryOutput[$primaryOutputId] += [string]$recipe.name
        }
    }
    $canonicalizedFallbackTitleCount = 0
    foreach ($recipe in $recipes) {
        if (-not $fallbackTitleRecipeIds.ContainsKey([string]$recipe.gameRecipeId)) { continue }
        $primaryOutputId = [string]$recipe.output.gameItemId
        if (-not $canonicalNamesByPrimaryOutput.ContainsKey($primaryOutputId)) { continue }
        $candidateNames = @($canonicalNamesByPrimaryOutput[$primaryOutputId])
        if ($candidateNames.Count -eq 1) {
            $recipe['name'] = [string]$candidateNames[0]
            $canonicalizedFallbackTitleCount++
        }
    }
    Write-WikeloCollectorDiagnostic "TheCollector title resolution: canonicalized $canonicalizedFallbackTitleCount fallback title(s) from unique matching primary rewards."
    Write-WikeloCollectorDiagnostic "TheCollector scan complete: normalized $($recipes.Count) complete contracts."
    if (-not $PatchVersion) { $PatchVersion = 'unknown' }
    if (-not $PatchBuild) { $PatchBuild = 'unknown' }
    [ordered]@{
        schema = 'wikelo-normalized-v1'
        patch = [ordered]@{ version = $PatchVersion; build = $PatchBuild; channel = $PatchChannel; sourceHash = $SourceHash.ToLowerInvariant(); extractedAt = $ExtractedAt.ToUniversalTime().ToString('o') }
        recipes = @($recipes | Sort-Object { $_.gameRecipeId })
    }
}

function Convert-WikeloExtractionToNormalizedV1 {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$ExtractionPath,
        [Parameter(Mandatory)][string]$SourceHash,
        [string]$PatchVersion,
        [string]$PatchBuild,
        [string]$PatchChannel = 'live',
        [string]$LocalizationPath,
        [datetime]$ExtractedAt = [datetime]::UtcNow
    )

    if (-not (Test-Path -LiteralPath $ExtractionPath -PathType Container)) { throw "Extraction path not found: $ExtractionPath" }
    $collectorXml = Get-Item -LiteralPath (Join-Path $ExtractionPath 'libs\foundry\records\contracts\contractgenerator\thecollector.xml') -ErrorAction SilentlyContinue
    if (-not $collectorXml) { $collectorXml = Get-ChildItem -LiteralPath $ExtractionPath -Recurse -File -Filter 'thecollector.xml' -ErrorAction SilentlyContinue | Select-Object -First 1 }
    if ($collectorXml) {
        return Convert-WikeloCollectorXmlToNormalizedV1 @PSBoundParameters
    }
    $recipes = [Collections.Generic.List[object]]::new()
    $metadataRoots = [Collections.Generic.List[object]]::new()
    $files = Get-ChildItem -LiteralPath $ExtractionPath -Recurse -File | Where-Object Extension -In @('.json', '.xml', '.socpak')
    foreach ($file in $files) {
        $document = Read-WikeloExtractedDocument $file
        if ($null -eq $document) { continue }
        $metadataRoots.Add($document)
        foreach ($candidate in @(Find-WikeloRecipeCandidates $document)) {
            try { $recipes.Add((ConvertTo-WikeloRecipe $candidate)) }
            catch { Write-Verbose "Rejected recipe candidate in '$($file.FullName)': $($_.Exception.Message)" }
        }
    }
    if ($recipes.Count -eq 0) { throw 'No recipe records were discovered by inspecting extracted JSON/XML content.' }

    foreach ($root in $metadataRoots) {
        if (-not $PatchVersion) { $PatchVersion = [string](Find-WikeloFirstPropertyValue $root @('patchVersion', 'version', 'gameVersion')) }
        if (-not $PatchBuild) { $PatchBuild = [string](Find-WikeloFirstPropertyValue $root @('patchBuild', 'build', 'buildId')) }
        if (-not $PatchChannel) { $PatchChannel = [string](Find-WikeloFirstPropertyValue $root @('patchChannel', 'channel', 'environment')) }
    }
    if ([string]::IsNullOrWhiteSpace($PatchVersion)) { throw 'PatchVersion was not discovered; configure it explicitly.' }
    if ([string]::IsNullOrWhiteSpace($PatchBuild)) { throw 'PatchBuild was not discovered; configure it explicitly.' }

    $deduplicated = @($recipes | Group-Object { $_.gameRecipeId } | ForEach-Object { $_.Group[0] } | Sort-Object { $_.gameRecipeId })
    [ordered]@{
        schema = 'wikelo-normalized-v1'
        patch = [ordered]@{
            version = $PatchVersion; build = $PatchBuild; channel = $PatchChannel
            sourceHash = $SourceHash.ToLowerInvariant(); extractedAt = $ExtractedAt.ToUniversalTime().ToString('o')
        }
        recipes = $deduplicated
    }
}

function Assert-WikeloNormalizedV1 {
    [CmdletBinding()]
    param([Parameter(Mandatory)]$Envelope)
    $errors = [Collections.Generic.List[string]]::new()
    if ($Envelope.schema -ne 'wikelo-normalized-v1') { $errors.Add('schema must equal wikelo-normalized-v1') }
    foreach ($field in @('version', 'build', 'channel', 'sourceHash', 'extractedAt')) {
        if ([string]::IsNullOrWhiteSpace([string](Get-WikeloProperty $Envelope.patch @($field)))) { $errors.Add("patch.$field is required") }
    }
    if ([string]$Envelope.patch.sourceHash -notmatch '^[a-fA-F0-9]{64}$') { $errors.Add('patch.sourceHash must be a SHA-256 hex digest') }
    $parsedDate = [datetime]::MinValue
    if (-not [datetime]::TryParse([string]$Envelope.patch.extractedAt, [ref]$parsedDate)) { $errors.Add('patch.extractedAt must be ISO-8601') }
    if (@($Envelope.recipes).Count -eq 0) { $errors.Add('recipes must contain at least one complete record') }
    $ids = @{}
    foreach ($recipe in @($Envelope.recipes)) {
        foreach ($field in @('gameRecipeId', 'name', 'category')) {
            if ([string]::IsNullOrWhiteSpace([string](Get-WikeloProperty $recipe @($field)))) { $errors.Add("recipe.$field is required") }
        }
        if ($ids.ContainsKey([string]$recipe.gameRecipeId)) { $errors.Add("duplicate recipe id: $($recipe.gameRecipeId)") } else { $ids[[string]$recipe.gameRecipeId] = $true }
        if ($null -eq $recipe.output -or [string]::IsNullOrWhiteSpace([string]$recipe.output.name) -or [double]$recipe.output.quantity -le 0) { $errors.Add("recipe '$($recipe.gameRecipeId)' has an invalid output") }
        $outputs = if ($null -ne $recipe.outputs -and @($recipe.outputs).Count -gt 0) { @($recipe.outputs) } else { @($recipe.output) }
        foreach ($output in $outputs) {
            if ([string]::IsNullOrWhiteSpace([string]$output.name) -or [double]$output.quantity -le 0) { $errors.Add("recipe '$($recipe.gameRecipeId)' has an invalid output entry") }
            if ([string]$output.kind -notin @('item', 'blueprint')) { $errors.Add("recipe '$($recipe.gameRecipeId)' has an invalid output kind") }
            if ([string]$output.grantTiming -notin @('mission_start', 'mission_completion', 'other')) { $errors.Add("recipe '$($recipe.gameRecipeId)' has an invalid output grant timing") }
            if ($output.externalUrl -and [string]$output.externalUrl -notmatch '^https://scmdb\.net/\?page=fab&fab=[A-Za-z0-9_%.-]+$') { $errors.Add("recipe '$($recipe.gameRecipeId)' has an invalid output URL") }
        }
        if ([double]$recipe.reputationNeeded -lt 0 -or [double]$recipe.reputationGranted -lt 0) { $errors.Add("recipe '$($recipe.gameRecipeId)' has negative reputation") }
        if (@($recipe.components).Count -eq 0) { $errors.Add("recipe '$($recipe.gameRecipeId)' has no components") }
        foreach ($component in @($recipe.components)) {
            if ([string]::IsNullOrWhiteSpace([string]$component.gameItemId) -or [string]::IsNullOrWhiteSpace([string]$component.name) -or [string]::IsNullOrWhiteSpace([string]$component.category) -or [double]$component.quantity -le 0) {
                $errors.Add("recipe '$($recipe.gameRecipeId)' has an invalid component")
            }
        }
    }
    if ($errors.Count -gt 0) { throw "Normalized envelope validation failed:`n- $($errors -join "`n- ")" }
    $true
}

function Get-WikeloSha256Hex {
    param([Parameter(Mandatory)][byte[]]$Bytes)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { (($sha.ComputeHash($Bytes) | ForEach-Object ToString x2) -join '') } finally { $sha.Dispose() }
}

function New-WikeloSignedHeaders {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][byte[]]$BodyBytes,
        [Parameter(Mandatory)][string]$Secret,
        [string]$RequestId = [guid]::NewGuid().ToString(),
        [long]$Timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    )
    $bodyHash = Get-WikeloSha256Hex $BodyBytes
    $message = "$Timestamp.$RequestId.$bodyHash"
    $hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($Secret))
    try { $signature = (($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($message)) | ForEach-Object ToString x2) -join '') } finally { $hmac.Dispose() }
    [ordered]@{
        'X-Wikelo-Timestamp' = [string]$Timestamp
        'X-Wikelo-Request-Id' = $RequestId
        'X-Wikelo-Body-SHA256' = $bodyHash
        'X-Wikelo-Signature' = $signature
    }
}

function Test-WikeloArchiveUnchanged {
    [CmdletBinding()]
    param(
        $State,
        [Parameter(Mandatory)][string]$ArchiveHash,
        [Parameter(Mandatory)][long]$ArchiveLength,
        [Parameter(Mandatory)][datetime]$ArchiveLastWriteUtc
    )
    if ($null -eq $State) { return $false }
    $savedTime = [datetime]::MinValue
    $hasTime = [datetime]::TryParse([string]$State.archiveLastWriteUtc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind, [ref]$savedTime)
    $State.archiveHash -eq $ArchiveHash.ToLowerInvariant() -and
        [long]$State.archiveLength -eq $ArchiveLength -and $hasTime -and
        $savedTime.ToUniversalTime().Ticks -eq $ArchiveLastWriteUtc.ToUniversalTime().Ticks
}

function Test-WikeloArchiveMetadataUnchanged {
    param($State, [Parameter(Mandatory)][string]$ArchivePath, [Parameter(Mandatory)][long]$ArchiveLength, [Parameter(Mandatory)][datetime]$ArchiveLastWriteUtc)
    if ($null -eq $State) { return $false }
    $savedTime = [datetime]::MinValue
    $hasTime = [datetime]::TryParse([string]$State.archiveLastWriteUtc, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::RoundtripKind, [ref]$savedTime)
    ([string]$State.archivePath -eq [string](Resolve-Path -LiteralPath $ArchivePath).Path) -and
        [long]$State.archiveLength -eq $ArchiveLength -and $hasTime -and
        $savedTime.ToUniversalTime().Ticks -eq $ArchiveLastWriteUtc.ToUniversalTime().Ticks
}

function Invoke-WikeloSignedPost {
    [CmdletBinding()]
    param([Parameter(Mandatory)][uri]$Uri, [Parameter(Mandatory)][string]$Body, [Parameter(Mandatory)][string]$Secret, [switch]$DryRun)
    if ($Uri.Scheme -notin @('http', 'https')) { throw 'Upload URI must use HTTP or HTTPS.' }
    if ($Uri.Scheme -eq 'http' -and -not $Uri.IsLoopback) { throw 'Plain HTTP uploads are allowed only to loopback addresses.' }
    $bytes = [Text.Encoding]::UTF8.GetBytes($Body)
    $headers = New-WikeloSignedHeaders -BodyBytes $bytes -Secret $Secret
    if ($DryRun) { return [pscustomobject]@{ DryRun = $true; Uri = $Uri.AbsoluteUri; Headers = $headers; BodyLength = $bytes.Length } }
    Invoke-WebRequest -Uri $Uri -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bytes -UseBasicParsing
}

function Remove-WikeloExpiredLogs {
    param([string]$LogDirectory, [int]$RetentionDays = 14)
    if (-not (Test-Path -LiteralPath $LogDirectory)) { return }
    $cutoff = [datetime]::UtcNow.AddDays(-[math]::Max(1, $RetentionDays))
    Get-ChildItem -LiteralPath $LogDirectory -File -Filter '*.log' | Where-Object LastWriteTimeUtc -LT $cutoff | Remove-Item -Force
}

Export-ModuleMember -Function *-Wikelo*
