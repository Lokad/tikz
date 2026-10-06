param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$artifactOwner = Join-Path $repositoryRoot 'artifacts'
$runDirectory = Join-Path $artifactOwner ('node-shape-pdf-cache-tests/run-' + [guid]::NewGuid().ToString('N'))
$baseline = Join-Path $repositoryRoot 'tests/Reference/NodeShapes/pdf'
$tool = Join-Path $PSScriptRoot 'bin/Release/net10.0/TikzShapePdfReference.dll'
function Guard-Output([string] $target) {
    $absolute = [System.IO.Path]::GetFullPath($target)
    $prefix = [System.IO.Path]::GetFullPath($artifactOwner) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $absolute.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Control output escapes artifacts/.' }
    for ($current = $absolute; $current -ne $repositoryRoot; $current = [System.IO.Path]::GetDirectoryName($current)) {
        if ((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current).Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
            throw 'Control output cannot cross a symlink or junction.'
        }
    }
}
Guard-Output $runDirectory
[void][System.IO.Directory]::CreateDirectory($runDirectory)
function Read-Json([string] $file) { Get-Content -LiteralPath $file -Raw | ConvertFrom-Json }
function Write-Json([string] $file, $value) {
    [System.IO.File]::WriteAllText($file, ($value | ConvertTo-Json -Depth 40).Replace([Environment]::NewLine, [string][char]10) + [char]10)
}
function Change-Provenance([string] $folder, [scriptblock] $change) {
    $file = Join-Path $folder 'provenance.json'
    $value = Read-Json $file
    & $change $value
    Write-Json $file $value
}
function Change-Artifact([string] $folder, [string] $name, [scriptblock] $change, [bool] $rehash = $false) {
    $file = Join-Path $folder $name
    & $change $file
    if ($rehash) {
        $sha = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
        Change-Provenance $folder { param($value) $value.artifacts.PSObject.Properties[$name].Value = $sha }
    }
}
function Invoke-Check([string] $folder) {
    $start = [System.Diagnostics.ProcessStartInfo]::new('dotnet')
    $start.WorkingDirectory = $repositoryRoot
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    foreach ($argument in @($tool, 'check-cached', '--baseline', $folder)) { $start.ArgumentList.Add($argument) }
    $process = [System.Diagnostics.Process]::new()
    $process.StartInfo = $start
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync()
        $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(30000)) { $process.Kill($true); throw 'Cached PDF control timed out.' }
        $message = ($stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()).Trim()
        if ($message.Length -gt 20000) { throw 'Excessive cached PDF control output.' }
        [pscustomobject]@{ ExitCode = $process.ExitCode; Message = $message }
    } finally { $process.Dispose() }
}

$trials = @(
    @{ Name = 'unchanged'; ExitCode = 0; Change = { param($folder) } },
    @{ Name = 'reformatted-provenance'; ExitCode = 0; Change = { param($folder) Change-Provenance $folder { param($p) } } },
    @{ Name = 'wrong-schema'; ExitCode = 2; Change = { param($folder) Change-Provenance $folder { param($p) $p.schemaVersion = 0 } } },
    @{ Name = 'wrong-profile'; ExitCode = 2; Change = { param($folder) Change-Provenance $folder { param($p) $p.profile = 'wrong' } } },
    @{ Name = 'candidate-oracle'; ExitCode = 2; Change = { param($folder) Change-Provenance $folder { param($p) $p.converterInvoked = $true } } },
    @{ Name = 'false-conformance'; ExitCode = 2; Change = { param($folder) Change-Provenance $folder { param($p) $p.conformanceClaim = $true } } },
    @{ Name = 'false-image-admission'; ExitCode = 2; Change = { param($folder) Change-Provenance $folder { param($p) $p.approvedImagePolicy = $true } } },
    @{ Name = 'false-probe-invariance'; ExitCode = 2; Change = { param($folder) Change-Provenance $folder { param($p) $p.probeInvariance.savedPagePositionIdentical = $false } } },
    @{ Name = 'incomplete-native-agreement'; ExitCode = 2; Change = { param($folder) Change-Provenance $folder { param($p) $p.nativeAgreement.recordCount = 1809 } } },
    @{ Name = 'changed-native-log'; ExitCode = 2; Change = { param($folder) Change-Provenance $folder { param($p) $p.nativeAgreement.nativeLogSha256 = '0' * 64 } } },
    @{ Name = 'changed-source'; ExitCode = 2; Change = { param($folder) Change-Provenance $folder { param($p) $p.sourceHashes.'tools/TikzShapePdfReference/Program.cs' = '0' * 64 } } },
    @{ Name = 'missing-tool'; ExitCode = 2; Change = { param($folder) Change-Provenance $folder { param($p) $p.tools = @($p.tools | Where-Object name -NE 'pdflatex') } } },
    @{ Name = 'changed-tool'; ExitCode = 2; Change = { param($folder) Change-Provenance $folder { param($p) $p.tools[0].sha256 = '0' * 64 } } },
    @{ Name = 'missing-pdf-driver'; ExitCode = 2; Change = { param($folder) Change-Provenance $folder { param($p) $p.inputs = @($p.inputs | Where-Object path -NE 'tex/pgfsys-pdftex.def') } } },
    @{ Name = 'missing-font-input'; ExitCode = 2; Change = { param($folder) Change-Provenance $folder { param($p) $p.inputs = @($p.inputs | Where-Object { -not $_.path.EndsWith('.pfb') }) } } },
    @{ Name = 'missing-framework-identities'; ExitCode = 2; Change = { param($folder) Change-Provenance $folder { param($p) $p.frameworkReferences = @() } } },
    @{ Name = 'unexpected-assembly'; ExitCode = 2; Change = { param($folder) Change-Provenance $folder { param($p) $p.frameworkReferences += 'Lokad.TikZ' } } },
    @{ Name = 'changed-generator-binary'; ExitCode = 2; Change = { param($folder) Change-Provenance $folder { param($p) $p.assemblySha256 = '0' * 64 } } },
    @{ Name = 'missing-raster'; ExitCode = 2; Change = { param($folder) Remove-Item -LiteralPath (Join-Path $folder 'pdf-page-1x.png') } },
    @{ Name = 'missing-metrics'; ExitCode = 2; Change = { param($folder) Remove-Item -LiteralPath (Join-Path $folder 'metrics.json') } },
    @{ Name = 'damaged-raster'; ExitCode = 2; Change = { param($folder) Change-Artifact $folder 'pdf-page-1x.png' { param($file) [System.IO.File]::AppendAllText($file, 'damage') } } },
    @{ Name = 'rehashed-damaged-raster'; ExitCode = 2; Change = { param($folder) Change-Artifact $folder 'pdf-page-1x.png' { param($file) [System.IO.File]::AppendAllText($file, 'damage') } $true } },
    @{ Name = 'rehashed-page-origin'; ExitCode = 2; Change = { param($folder) Change-Artifact $folder 'metrics.json' { param($file) $m = Read-Json $file; $m.measurement.pdfOriginPixels.x++; Write-Json $file $m } $true } },
    @{ Name = 'rehashed-native-driver'; ExitCode = 2; Change = { param($folder) Change-Artifact $folder 'pdf.log' { param($file) [System.IO.File]::WriteAllText($file, [System.IO.File]::ReadAllText($file).Replace('pgfsys-pdftex.def|END', 'wrong|END')) } $true } },
    @{ Name = 'rehashed-wrapper'; ExitCode = 2; Change = { param($folder) Change-Artifact $folder 'wrapper.tex' { param($file) [System.IO.File]::AppendAllText($file, '% changed wrapper') } $true } },
    @{ Name = 'rehashed-pdf'; ExitCode = 2; Change = { param($folder) Change-Artifact $folder 'reference.pdf' { param($file) [System.IO.File]::AppendAllText($file, 'damage') } $true } }
)
$originalHashes = @{}
Get-ChildItem -LiteralPath $baseline -File | ForEach-Object { $originalHashes[$_.Name] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
$results = [System.Collections.Generic.List[object]]::new()
foreach ($trial in $trials) {
    $folder = Join-Path $runDirectory $trial.Name
    Guard-Output $folder
    [void][System.IO.Directory]::CreateDirectory($folder)
    Get-ChildItem -LiteralPath $baseline -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $folder }
    & $trial.Change $folder
    $actual = Invoke-Check $folder
    $passed = $actual.ExitCode -eq $trial.ExitCode
    $results.Add([pscustomobject]@{ Name = $trial.Name; ExpectedExit = $trial.ExitCode; ActualExit = $actual.ExitCode; Passed = $passed; Diagnostic = $actual.Message })
    Write-Output "$($trial.Name): expected $($trial.ExitCode), actual $($actual.ExitCode)"
}
foreach ($name in $originalHashes.Keys) {
    if ((Get-FileHash -LiteralPath (Join-Path $baseline $name) -Algorithm SHA256).Hash -ne $originalHashes[$name]) { throw 'Controls changed the original PDF baseline.' }
}
$report = [pscustomobject]@{ SchemaVersion = 1; Kind = 'ordinary-shape-pdf-cache-controls'; ConverterInvoked = $false; LiveOracleInvoked = $false
    Completed = $true; Passed = @($results | Where-Object { -not $_.Passed }).Count -eq 0
    Scope = 'Cached evidence integrity only; no raster comparison or image/PDF admission'; Results = $results
    SnapshotSha256 = (Get-FileHash -LiteralPath (Join-Path $repositoryRoot 'tests/Reference/NodeShapes/pdf-snapshot.json') -Algorithm SHA256).Hash.ToLowerInvariant()
    ControlSourceSha256 = (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant() }
Write-Json (Join-Path $runDirectory 'report.json') $report
$reportPath = Join-Path $artifactOwner 'node-shape-pdf-cache-tests/report.json'
Guard-Output $reportPath
Write-Json $reportPath $report
if (-not $report.Passed) { throw 'One or more cached PDF evidence controls failed; see report.json.' }
Write-Output "$($results.Count) cached PDF controls passed; original baseline unchanged."
