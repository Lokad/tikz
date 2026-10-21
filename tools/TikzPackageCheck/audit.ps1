param(
    [Parameter(Mandatory=$true)][string]$PackageDirectory,
    [Parameter(Mandatory=$true)][string]$SourceRoot
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$sourceDirectory = (Resolve-Path -LiteralPath $SourceRoot).Path
$packageFiles = @(Get-ChildItem -LiteralPath $PackageDirectory -Filter 'Lokad.TikZ.*.nupkg' -File)
$symbolFiles = @(Get-ChildItem -LiteralPath $PackageDirectory -Filter 'Lokad.TikZ.*.snupkg' -File)
if ($packageFiles.Count -ne 1 -or $symbolFiles.Count -ne 1) { throw 'Expected one package and one symbol package.' }
function Read-ZipBytes($entry) {
    $stream = $entry.Open(); $buffer = [System.IO.MemoryStream]::new()
    try { $stream.CopyTo($buffer); return ,$buffer.ToArray() }
    finally { $stream.Dispose(); $buffer.Dispose() }
}
function Get-ByteHash([byte[]]$bytes) {
    [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($bytes)).ToLowerInvariant()
}
function Assert-SourceBytes($entry, [string]$file) {
    if ($null -eq $entry) { throw "Missing packaged source asset: $file" }
    if ((Get-ByteHash (Read-ZipBytes $entry)) -ne
        (Get-ByteHash ([System.IO.File]::ReadAllBytes((Join-Path $sourceDirectory $file))))) {
        throw "Packaged bytes differ from current source: $file"
    }
}
function Assert-Payloads($entries, $payloads, [string]$nuspecName) {
    $names = @($entries.FullName)
    if (@($names | Sort-Object -Unique).Count -ne $names.Count) { throw 'Duplicate package entries.' }
    foreach ($name in $names) {
        if (-not $payloads.Contains($name) -and $name -ne $nuspecName -and
            $name -notin @('_rels/.rels', '[Content_Types].xml') -and
            $name -notmatch '^package/services/metadata/core-properties/(nuget|[a-f0-9]+)\.psmdcp$') {
            throw "Unexpected package payload: $name"
        }
    }
}
$archive = [System.IO.Compression.ZipFile]::OpenRead($packageFiles[0].FullName)
try {
    $entries = @($archive.Entries); $names = @($entries.FullName)
    $payloads = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    foreach ($name in @('lib/net10.0/Lokad.TikZ.dll', 'lib/net10.0/Lokad.TikZ.xml', 'README.md', 'LICENSE.txt', 'THIRD-PARTY-NOTICES.md')) { $null = $payloads.Add($name) }
    $nuspec = @($entries | Where-Object { $_.FullName -like '*.nuspec' })
    if ($nuspec.Count -ne 1) { throw 'Expected one nuspec.' }
    $stream = $nuspec[0].Open()
    try { $metadata = [System.Xml.XmlDocument]::new(); $metadata.Load($stream) }
    finally { $stream.Dispose() }
    if (@($metadata.SelectNodes('//*[local-name()="dependency"]')).Count) { throw 'Production package dependency.' }
    $version = $metadata.SelectSingleNode('//*[local-name()="metadata"]/*[local-name()="version"]').InnerText
    if ($metadata.SelectSingleNode('//*[local-name()="metadata"]/*[local-name()="id"]').InnerText -ne 'Lokad.TikZ') { throw 'Wrong package ID.' }
    $project = [xml](Get-Content -LiteralPath (Join-Path $sourceDirectory 'src/Lokad.TikZ/Lokad.TikZ.csproj') -Raw)
    if ($version -ne $project.Project.PropertyGroup.Version) { throw 'Package version differs from current source.' }
    $repository = $metadata.SelectSingleNode('//*[local-name()="metadata"]/*[local-name()="repository"]')
    $projectUrl = $metadata.SelectSingleNode('//*[local-name()="metadata"]/*[local-name()="projectUrl"]')
    if ($null -eq $repository -or $repository.GetAttribute('type') -ne 'git' -or
        $repository.GetAttribute('url') -ne $project.Project.PropertyGroup.RepositoryUrl -or
        $null -eq $projectUrl -or $projectUrl.InnerText -ne $project.Project.PropertyGroup.PackageProjectUrl) {
        throw 'Missing or incorrect public package provenance.'
    }
    $sourceRevision = $repository.GetAttribute('commit')
    $currentRevision = & git -C $sourceDirectory rev-parse HEAD
    if ($LASTEXITCODE -ne 0 -or $sourceRevision -cne $currentRevision) { throw 'Package source revision differs from checkout.' }
    if (@($entries | Where-Object { $_.FullName -like '*.dll' }).Count -ne 1) { throw 'Unexpected package assemblies.' }
    $dll = $archive.GetEntry('lib/net10.0/Lokad.TikZ.dll')
    Assert-SourceBytes $dll 'src/Lokad.TikZ/bin/Release/net10.0/Lokad.TikZ.dll'
    Assert-SourceBytes ($archive.GetEntry('README.md')) 'README.md'
    foreach ($file in @('LICENSE.txt', 'THIRD-PARTY-NOTICES.md')) {
        Assert-SourceBytes ($archive.GetEntry($file)) $file
    }
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $sourceDirectory 'licenses/Fonts') -Filter '*.txt' -File) {
        $relative = 'licenses/Fonts/' + $file.Name
        $null = $payloads.Add($relative)
        Assert-SourceBytes ($archive.GetEntry($relative)) $relative
    }
    foreach ($file in Get-ChildItem -LiteralPath (Join-Path $sourceDirectory 'src/Lokad.TikZ/Resources/Fonts') -Filter '*.json' -File) {
        $null = $payloads.Add('font-data/' + $file.Name)
        Assert-SourceBytes ($archive.GetEntry('font-data/' + $file.Name)) ('src/Lokad.TikZ/Resources/Fonts/' + $file.Name)
    }
    foreach ($file in @('font-profile.json', 'math-font-profile.json')) {
        $null = $payloads.Add('font-data/' + $file)
        Assert-SourceBytes ($archive.GetEntry('font-data/' + $file)) ('tools/TikzFontData/' + $file)
    }
    $documentationEntry = $archive.GetEntry('lib/net10.0/Lokad.TikZ.xml')
    if ($null -eq $documentationEntry) { throw 'Missing packed API XML.' }
    Assert-SourceBytes $documentationEntry 'src/Lokad.TikZ/bin/Release/net10.0/Lokad.TikZ.xml'
    $stream = $documentationEntry.Open()
    try { $documentation = [System.Xml.XmlDocument]::new(); $documentation.Load($stream) }
    finally { $stream.Dispose() }
    $members = @($documentation.doc.members.member)
    if (-not $members.Count -or @($members | Where-Object { [string]::IsNullOrWhiteSpace($_.SelectSingleNode('summary').InnerText) }).Count) { throw 'Incomplete XML summaries.' }
    if (@($members | Where-Object { $_.name -eq 'M:Lokad.TikZ.TikzConverter.Convert(System.String,Lokad.TikZ.TikzOptions,System.Threading.CancellationToken)' }).Count -ne 1) {
        throw 'Missing converter documentation.'
    }
    Assert-Payloads $entries $payloads $nuspec[0].FullName
    $result = [ordered]@{
        completed = $true; version = $version; packageDependencies = 0; entries = $entries.Count
        packageFile = $packageFiles[0].Name; symbolFile = $symbolFiles[0].Name
        packageSha256 = (Get-FileHash -LiteralPath $packageFiles[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        symbolSha256 = (Get-FileHash -LiteralPath $symbolFiles[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        productionAssemblySha256 = (Get-ByteHash (Read-ZipBytes $dll))
        documentedMembers = $members.Count
        documentedTypes = @($members | Where-Object { $_.name -like 'T:Lokad.TikZ.*' }).Count
        documentationSha256 = (Get-ByteHash (Read-ZipBytes $documentationEntry))
        sourceAssetsChecked = $true; localAndNativeAssetsAbsent = $true
    }
} finally { $archive.Dispose() }
$symbols = [System.IO.Compression.ZipFile]::OpenRead($symbolFiles[0].FullName)
try {
    $symbolNuspec = @($symbols.Entries | Where-Object { $_.FullName -like '*.nuspec' })
    if ($symbolNuspec.Count -ne 1) { throw 'Expected one symbol nuspec.' }
    $symbolPayloads = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
    $null = $symbolPayloads.Add('lib/net10.0/Lokad.TikZ.pdb')
    Assert-Payloads $symbols.Entries $symbolPayloads $symbolNuspec[0].FullName
    $pdb = $symbols.GetEntry('lib/net10.0/Lokad.TikZ.pdb')
    Assert-SourceBytes $pdb 'src/Lokad.TikZ/bin/Release/net10.0/Lokad.TikZ.pdb'
    $pdbBytes = Read-ZipBytes $pdb
    if ([System.Text.Encoding]::ASCII.GetString($pdbBytes, 0, 4) -ne 'BSJB') { throw 'Expected portable PDB.' }
    $result.symbols = & (Join-Path $PSScriptRoot 'symbols.ps1') -PdbBytes $pdbBytes -SourceRoot $sourceDirectory `
        -RepositoryUrl $project.Project.PropertyGroup.RepositoryUrl -SourceRevision $sourceRevision
    $result.symbolPackageChecked = $true
} finally { $symbols.Dispose() }
$result | ConvertTo-Json -Compress
