param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$testRoot = Join-Path $repositoryRoot 'artifacts/node-shape-cache-tests'
$artifactPrefix = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot 'artifacts')) + [System.IO.Path]::DirectorySeparatorChar
if (-not [System.IO.Path]::GetFullPath($testRoot).StartsWith($artifactPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Cache-test output must stay inside artifacts/.'
}
if (Test-Path -LiteralPath $testRoot) {
    if ((Get-Item -LiteralPath $testRoot).Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        throw 'Cache-test output cannot be a filesystem link.'
    }
    Remove-Item -LiteralPath $testRoot -Recurse
}
[void][System.IO.Directory]::CreateDirectory($testRoot)

function Invoke-Oracle([string] $folder) {
    $start = [System.Diagnostics.ProcessStartInfo]::new('dotnet')
    $start.WorkingDirectory = $folder
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $start.ArgumentList.Add((Join-Path $repositoryRoot 'tools/TikzShapeReference/bin/Release/net10.0/TikzShapeReference.dll'))
    $start.ArgumentList.Add('check-cached')
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(30000)) {
            $process.Kill($true)
            throw 'Cached oracle check timed out.'
        }
        $message = ($stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()).Trim()
        if ($message.Length -gt 20000) { throw 'Unexpectedly large cached-check output.' }
        return [pscustomobject]@{ ExitCode = $process.ExitCode; Message = $message }
    }
    finally { $process.Dispose() }
}
function Read-Json([string] $file) { return Get-Content -LiteralPath $file -Raw | ConvertFrom-Json }
function Write-Json([string] $file, $value) {
    $text = ($value | ConvertTo-Json -Depth 30).Replace("`r`n", "`n") + "`n"
    [System.IO.File]::WriteAllText($file, $text, [System.Text.UTF8Encoding]::new($false))
}
function Native-File([string] $folder, [string] $name) { return Join-Path $folder ('tests/Reference/NodeShapes/native/' + $name) }
function Rehash-Artifact([string] $folder, [string] $name) {
    $file = Native-File $folder 'provenance.json'
    $provenance = Read-Json $file
    $provenance.artifacts.PSObject.Properties[$name].Value = (Get-FileHash -LiteralPath (Native-File $folder $name) -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Json $file $provenance
}
function Change-Artifact([string] $folder, [string] $name, [scriptblock] $change, [bool] $rehash = $true) {
    $file = Native-File $folder $name
    & $change $file
    if ($rehash) { Rehash-Artifact $folder $name }
}

$assembly = Join-Path $repositoryRoot 'tools/TikzShapeReference/bin/Release/net10.0/TikzShapeReference.dll'
if (-not (Test-Path -LiteralPath $assembly -PathType Leaf)) { throw 'Build TikzShapeReference with -c Release before running the cache checks.' }
$original = Read-Json (Join-Path $repositoryRoot 'tests/Reference/NodeShapes/native/provenance.json')
$trials = @(
    @{ Name = 'unchanged'; ExitCode = 0; Change = { param($folder) } },
    @{ Name = 'missing-svg'; ExitCode = 2; Change = { param($folder) Remove-Item -LiteralPath (Native-File $folder 'reference.svg') } },
    @{ Name = 'unhashed-numeric-change'; ExitCode = 2; Change = {
        param($folder)
        Change-Artifact $folder 'metrics.json' { param($file) $data = Read-Json $file; $data.nodes[0].values.width++; Write-Json $file $data } $false
    } },
    @{ Name = 'rehashed-numeric-change'; ExitCode = 2; Change = {
        param($folder)
        Change-Artifact $folder 'metrics.json' { param($file) $data = Read-Json $file; $data.nodes[0].values.width++; Write-Json $file $data }
    } },
    @{ Name = 'rehashed-missing-anchor'; ExitCode = 2; Change = {
        param($folder)
        Change-Artifact $folder 'metrics.json' { param($file) $data = Read-Json $file; $data.nodes[0].anchors.PSObject.Properties.Remove('north'); Write-Json $file $data }
    } },
    @{ Name = 'rehashed-wrong-shape'; ExitCode = 2; Change = {
        param($folder)
        Change-Artifact $folder 'oracle.log' { param($file) $text = [System.IO.File]::ReadAllText($file).Replace('LOKAD-SHAPE c-regular|circle|END', 'LOKAD-SHAPE c-regular|ellipse|END'); [System.IO.File]::WriteAllText($file, $text) }
    } },
    @{ Name = 'rehashed-wrong-pgf'; ExitCode = 2; Change = {
        param($folder)
        Change-Artifact $folder 'oracle.log' { param($file) $text = [System.IO.File]::ReadAllText($file).Replace('LOKAD-PGF-VERSION 3.1.11a', 'LOKAD-PGF-VERSION wrong'); [System.IO.File]::WriteAllText($file, $text) }
    } },
    @{ Name = 'rehashed-missing-background'; ExitCode = 2; Change = {
        param($folder)
        foreach ($name in @('reference.svg', 'plain-reference.svg')) {
            Change-Artifact $folder $name {
                param($file)
                $document = [System.Xml.Linq.XDocument]::Load($file)
                $paths = @($document.Descendants() | Where-Object { $_.Name.LocalName -eq 'path' -and -not @($_.Ancestors() | Where-Object { $_.Name.LocalName -eq 'defs' }).Count })
                $paths[0].Remove()
                $document.Save($file)
            }
        }
        $file = Native-File $folder 'provenance.json'; $data = Read-Json $file
        $data.probeVerification.svgByteIdentical = $data.artifacts.'reference.svg' -eq $data.artifacts.'plain-reference.svg'; Write-Json $file $data
    } },
    @{ Name = 'rehashed-wrong-probes'; ExitCode = 2; Change = {
        param($folder)
        Change-Artifact $folder 'probes.tex' { param($file) [System.IO.File]::AppendAllText($file, '% changed probes') }
    } },
    @{ Name = 'false-byte-invariance'; ExitCode = 2; Change = {
        param($folder) $file = Native-File $folder 'provenance.json'; $data = Read-Json $file
        $data.probeVerification.svgByteIdentical = -not $data.probeVerification.svgByteIdentical; Write-Json $file $data
    } },
    @{ Name = 'missing-engine-identity'; ExitCode = 2; Change = {
        param($folder) $file = Native-File $folder 'provenance.json'; $data = Read-Json $file
        $data.tools = @($data.tools | Where-Object name -NE 'latex'); Write-Json $file $data
    } },
    @{ Name = 'missing-pgf-input'; ExitCode = 2; Change = {
        param($folder) $file = Native-File $folder 'provenance.json'; $data = Read-Json $file
        $data.inputs = @($data.inputs | Where-Object path -NE 'tex/pgfcorepoints.code.tex'); Write-Json $file $data
    } },
    @{ Name = 'missing-font-input'; ExitCode = 2; Change = {
        param($folder) $file = Native-File $folder 'provenance.json'; $data = Read-Json $file
        $data.inputs = @($data.inputs | Where-Object path -NE 'font/ec-lmr10.tfm'); Write-Json $file $data
    } },
    @{ Name = 'rehashed-missing-label-origin'; ExitCode = 2; Change = {
        param($folder)
        Change-Artifact $folder 'native-positions.log' { param($file) $text = [System.IO.File]::ReadAllText($file).Replace('lokad-node-origin c-regular', 'removed-origin c-regular'); [System.IO.File]::WriteAllText($file, $text) }
    } },
    @{ Name = 'rehashed-unsupported-font'; ExitCode = 2; Change = {
        param($folder)
        Change-Artifact $folder 'native-positions.log' { param($file) $text = [System.IO.File]::ReadAllText($file).Replace('ec-lmr10', 'unsupported-font'); [System.IO.File]::WriteAllText($file, $text) }
    } },
    @{ Name = 'changed-source'; ExitCode = 2; Change = {
        param($folder) [System.IO.File]::AppendAllText((Join-Path $folder 'tests/Fixtures/Nodes/shapes.tikz'), '% changed fixture')
    } }
)
$results = [System.Collections.Generic.List[object]]::new()
foreach ($trial in $trials) {
    $folder = Join-Path $testRoot $trial.Name
    [void][System.IO.Directory]::CreateDirectory($folder)
    Copy-Item -LiteralPath (Join-Path $repositoryRoot 'Lokad.TikZ.slnx') -Destination $folder
    $files = @($original.sourceHashes.PSObject.Properties.Name) + @($original.artifacts.PSObject.Properties.Name | ForEach-Object { 'tests/Reference/NodeShapes/native/' + $_ }) + @('tests/Reference/NodeShapes/native/provenance.json')
    foreach ($relative in $files) {
        $destination = Join-Path $folder $relative
        [void][System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($destination))
        Copy-Item -LiteralPath (Join-Path $repositoryRoot $relative) -Destination $destination
    }
    & $trial.Change $folder
    $result = Invoke-Oracle $folder
    $passed = $result.ExitCode -eq $trial.ExitCode
    $results.Add([pscustomobject]@{ Name = $trial.Name; ExpectedExitCode = $trial.ExitCode; ExitCode = $result.ExitCode; Passed = $passed; Message = $result.Message })
}
$passed = @($results | Where-Object { -not $_.Passed }).Count -eq 0
Write-Json (Join-Path $testRoot 'report.json') ([pscustomobject]@{ SchemaVersion = 1; Passed = $passed; AssemblySha256 = (Get-FileHash -LiteralPath $assembly -Algorithm SHA256).Hash.ToLowerInvariant(); Checks = @($results.ToArray()); ConformanceClaim = $false })
foreach ($failure in $results | Where-Object { -not $_.Passed }) { Write-Output ($failure.Name + ': ' + $failure.Message) }
if (-not $passed) { throw 'Native shape cached-evidence controls failed; see artifacts/node-shape-cache-tests/report.json.' }
Write-Output ($results.Count.ToString() + ' native shape cached-evidence controls passed; no candidate/image conformance claim.')
