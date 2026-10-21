param(
    [Parameter(Mandatory=$true)][string]$PackageDirectory,
    [Parameter(Mandatory=$true)][string]$SourceRoot,
    [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
$symbolFile = @(Get-ChildItem -LiteralPath $PackageDirectory -Filter '*.snupkg' -File)
if ($symbolFile.Count -ne 1) { throw 'Expected one symbol package.' }
$archive = [System.IO.Compression.ZipFile]::OpenRead($symbolFile[0].FullName)
$buffer = [System.IO.MemoryStream]::new()
try {
    $pdbInput = $archive.GetEntry('lib/net10.0/Lokad.TikZ.pdb').Open()
    try { $pdbInput.CopyTo($buffer) } finally { $pdbInput.Dispose() }
    $original = $buffer.ToArray()
} finally { $archive.Dispose(); $buffer.Dispose() }
$project = [xml](Get-Content -LiteralPath (Join-Path $SourceRoot 'src/Lokad.TikZ/Lokad.TikZ.csproj') -Raw)
$revision = & git -C $SourceRoot rev-parse HEAD
if ($LASTEXITCODE -ne 0) { throw 'Missing source revision.' }
$parameters = @{ SourceRoot = $SourceRoot; RepositoryUrl = $project.Project.PropertyGroup.RepositoryUrl; SourceRevision = $revision }
$positive = & (Join-Path $PSScriptRoot 'symbols.ps1') -PdbBytes $original @parameters
if (-not $positive.completed) { throw 'Positive symbol validation failed.' }
function Replace-Bytes([byte[]]$bytes, [byte[]]$pattern, [byte[]]$replacement) {
    if ($pattern.Length -ne $replacement.Length) { throw 'Control must preserve metadata offsets.' }
    $copy = [byte[]]$bytes.Clone()
    $replacements = 0
    for ($index = 0; $index -le $copy.Length - $pattern.Length; $index++) {
        $same = $true
        for ($offset = 0; $offset -lt $pattern.Length; $offset++) {
            if ($copy[$index + $offset] -ne $pattern[$offset]) { $same = $false; break }
        }
        if ($same) { [Array]::Copy($replacement, 0, $copy, $index, $replacement.Length); $replacements++; $index += $pattern.Length - 1 }
    }
    if ($replacements -eq 0) { throw 'Control pattern not found.' }
    return ,$copy
}
$utf8 = [System.Text.Encoding]::UTF8
$cases = @(
    @{ name = 'missing-source-link'; pattern = ([Guid]'CC110556-A091-4D38-9FEC-25AB9A351A6A').ToByteArray(); replacement = [byte[]]::new(16); expected = 'Expected one SourceLink map.' },
    @{ name = 'unmapped-documents'; pattern = $utf8.GetBytes('"/_/*"'); replacement = $utf8.GetBytes('"/x/*"'); expected = 'Invalid SourceLink document mapping.' },
    @{ name = 'stale-source-revision'; pattern = $utf8.GetBytes($revision); replacement = $utf8.GetBytes('0' * 40); expected = 'SourceLink repository or revision differs.' },
    @{ name = 'missing-generated-source'; pattern = ([Guid]'0E8A571B-6926-466E-B4AD-8AB04611F5FE').ToByteArray(); replacement = [byte[]]::new(16); expected = 'Missing embedded generated source.' }
)
$null = New-Item -ItemType Directory -Path $OutputDirectory -Force
$controls = @()
foreach ($case in $cases) {
    $bytes = Replace-Bytes $original $case.pattern $case.replacement
    $file = Join-Path $OutputDirectory ($case.name + '.pdb')
    [System.IO.File]::WriteAllBytes($file, $bytes)
    $rejection = $null
    try { $null = & (Join-Path $PSScriptRoot 'symbols.ps1') -PdbBytes $bytes @parameters }
    catch { $rejection = $_.Exception.Message }
    if ($rejection -ne $case.expected) { throw "Wrong symbol rejection for $($case.name): $rejection" }
    $controls += [ordered]@{ name = $case.name; passed = $true; rejection = $rejection
        mutatedPdbSha256 = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() }
}
[ordered]@{ completed = $true; checkedSymbolPackageSha256 = (Get-FileHash -LiteralPath $symbolFile[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant(); controls = $controls } | ConvertTo-Json -Depth 4 -Compress
