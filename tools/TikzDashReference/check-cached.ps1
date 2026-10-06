param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$artifactOwner = Join-Path $repositoryRoot 'artifacts'
$runDirectory = Join-Path $artifactOwner ('dash-cache-controls/run-' + [guid]::NewGuid().ToString('D'))
$tool = Join-Path $PSScriptRoot 'bin/Release/net10.0/TikzDashReference.dll'
$hostPath = (Get-Command dotnet).Source
function Guard-Output([string] $target) {
    $absolute = [IO.Path]::GetFullPath($target)
    $prefix = [IO.Path]::GetFullPath($artifactOwner) + [IO.Path]::DirectorySeparatorChar
    if (-not $absolute.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Control output escapes artifacts/.' }
    for ($current = $absolute; $current -ne $repositoryRoot; $current = [IO.Path]::GetDirectoryName($current)) {
        if ((Test-Path -LiteralPath $current) -and ((Get-Item -LiteralPath $current).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Control output cannot cross a symlink or junction.'
        }
    }
}
function Hash([string] $file) { (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() }
function Read-Json([string] $file) { Get-Content -LiteralPath $file -Raw | ConvertFrom-Json }
function Write-Json([string] $file, $value) {
    Guard-Output $file
    [IO.File]::WriteAllText($file, ($value | ConvertTo-Json -Depth 50).Replace([Environment]::NewLine, [string][char]10) + [char]10)
}
function Change-Json([string] $folder, [string] $relative, [scriptblock] $change) {
    $file = Join-Path $folder $relative; Guard-Output $file
    $value = Read-Json $file; & $change $value; Write-Json $file $value
}
function Provenance([string] $folder, [scriptblock] $change) { Change-Json $folder 'tests/Reference/Dashes/native/provenance.json' $change }
function Changed-Bytes([string] $folder, [string] $relative, [bool] $rehash = $false) {
    $file = Join-Path $folder $relative; Guard-Output $file
    $bytes = [IO.File]::ReadAllBytes($file); [IO.File]::WriteAllBytes($file, [byte[]]($bytes + [byte]10))
    if ($rehash) {
        $name = [IO.Path]::GetFileName($file); $sha = Hash $file
        Provenance $folder { param($p) $p.artifacts.PSObject.Properties[$name].Value = $sha }
    }
}
function Missing-File([string] $folder, [string] $relative) {
    $file = Join-Path $folder $relative; Guard-Output $file
    Remove-Item -LiteralPath $file
}
function Invoke-Check([string] $folder) {
    $start = [Diagnostics.ProcessStartInfo]::new($hostPath)
    $start.WorkingDirectory = $folder; $start.UseShellExecute = $false; $start.CreateNoWindow = $true
    $start.RedirectStandardOutput = $true; $start.RedirectStandardError = $true
    $start.Environment['PATH'] = ''
    foreach ($argument in @($tool, 'check-cached')) { $start.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::new(); $process.StartInfo = $start
    try {
        [void]$process.Start()
        $stdout = $process.StandardOutput.ReadToEndAsync(); $stderr = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit(30000)) { $process.Kill($true); throw 'Cached dash control timed out.' }
        $message = ($stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()).Trim()
        if ($message.Length -gt 20000) { throw 'Excessive cached dash control output.' }
        [pscustomobject]@{ ExitCode = $process.ExitCode; Message = $message }
    } finally { $process.Dispose() }
}

Guard-Output $runDirectory
[void][IO.Directory]::CreateDirectory($runDirectory)
Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $runDirectory 'control-source.ps1')
$snapshotPath = Join-Path $repositoryRoot 'tests/Reference/Dashes/snapshot.json'
$snapshot = Read-Json $snapshotPath
$files = @('Lokad.TikZ.slnx', 'tests/Reference/Dashes/snapshot.json', 'tests/Reference/Dashes/native/provenance.json') +
    @($snapshot.sourceHashes.PSObject.Properties.Name) +
    @($snapshot.artifacts.PSObject.Properties.Name | ForEach-Object { 'tests/Reference/Dashes/native/' + $_ })
$files = @($files | Select-Object -Unique)
$originalHashes = @{}; foreach ($file in $files) { $originalHashes[$file] = Hash (Join-Path $repositoryRoot $file) }
$trials = @(
    @{ Name = 'unchanged'; Exit = 0; Change = { param($f) } },
    @{ Name = 'reformatted-provenance'; Exit = 0; Change = { param($f) Provenance $f { param($p) } } },
    @{ Name = 'wrong-schema'; Exit = 2; Change = { param($f) Provenance $f { param($p) $p.schemaVersion = 0 } } },
    @{ Name = 'candidate-oracle'; Exit = 2; Change = { param($f) Provenance $f { param($p) $p.converterInvoked = $true } } },
    @{ Name = 'false-admission'; Exit = 2; Change = { param($f) Provenance $f { param($p) $p.approvedImagePolicy = $true } } },
    @{ Name = 'wrong-source-hash'; Exit = 2; Change = { param($f) Provenance $f { param($p) $p.sourceHashes.'tests/Fixtures/Dashes/dashes.tikz' = '0' * 64 } } },
    @{ Name = 'missing-source-hash'; Exit = 2; Change = { param($f) Provenance $f { param($p) $p.sourceHashes.PSObject.Properties.Remove('tools/TikzDashReference/dashes.tex') } } },
    @{ Name = 'missing-tool'; Exit = 2; Change = { param($f) Provenance $f { param($p) $p.tools = @($p.tools | Where-Object name -NE 'pdflatex') } } },
    @{ Name = 'wrong-tool-version'; Exit = 2; Change = { param($f) Provenance $f { param($p) $p.tools[0].version = 'wrong' } } },
    @{ Name = 'wrong-tool-hash'; Exit = 2; Change = { param($f) Provenance $f { param($p) $p.tools[0].sha256 = '0' * 64 } } },
    @{ Name = 'missing-pgf-input'; Exit = 2; Change = { param($f) Provenance $f { param($p) $p.inputs.PSObject.Properties.Remove('tikz.code.tex') } } },
    @{ Name = 'changed-pgf-input'; Exit = 2; Change = { param($f) Provenance $f { param($p) $p.inputs.'tikz.code.tex' = '0' * 64 } } },
    @{ Name = 'missing-artifact-hash'; Exit = 2; Change = { param($f) Provenance $f { param($p) $p.artifacts.PSObject.Properties.Remove('reference.svg') } } },
    @{ Name = 'wrong-artifact-hash'; Exit = 2; Change = { param($f) Provenance $f { param($p) $p.artifacts.'reference.svg' = '0' * 64 } } },
    @{ Name = 'missing-pdf'; Exit = 2; Change = { param($f) Missing-File $f 'tests/Reference/Dashes/native/reference.pdf' } },
    @{ Name = 'missing-metrics'; Exit = 2; Change = { param($f) Missing-File $f 'tests/Reference/Dashes/native/metrics.json' } },
    @{ Name = 'changed-svg'; Exit = 2; Change = { param($f) Changed-Bytes $f 'tests/Reference/Dashes/native/reference.svg' } },
    @{ Name = 'changed-plain-svg'; Exit = 2; Change = { param($f) Changed-Bytes $f 'tests/Reference/Dashes/native/plain-reference.svg' } },
    @{ Name = 'changed-fixture'; Exit = 2; Change = { param($f) Changed-Bytes $f 'tests/Fixtures/Dashes/dashes.tikz' } },
    @{ Name = 'changed-wrapper'; Exit = 2; Change = { param($f) Changed-Bytes $f 'tools/TikzDashReference/dashes.tex' } },
    @{ Name = 'changed-generator'; Exit = 2; Change = { param($f) Changed-Bytes $f 'tools/TikzDashReference/Program.cs' } },
    @{ Name = 'changed-helper'; Exit = 2; Change = { param($f) Changed-Bytes $f 'tools/TikzDashReference/DashEvidence.cs' } },
    @{ Name = 'rehashed-svg'; Exit = 2; Change = { param($f) Changed-Bytes $f 'tests/Reference/Dashes/native/reference.svg' $true } },
    @{ Name = 'rehashed-pdf'; Exit = 2; Change = { param($f) Changed-Bytes $f 'tests/Reference/Dashes/native/reference.pdf' $true } },
    @{ Name = 'rehashed-raster'; Exit = 2; Change = { param($f) Changed-Bytes $f 'tests/Reference/Dashes/native/pdf-page-4x.png' $true } },
    @{ Name = 'rehashed-native-log'; Exit = 2; Change = { param($f) Changed-Bytes $f 'tests/Reference/Dashes/native/pdf.log' $true } },
    @{ Name = 'rehashed-page-origin'; Exit = 2; Change = { param($f)
        Change-Json $f 'tests/Reference/Dashes/native/metrics.json' { param($m) $m.pdfOriginCss.x += 1 }
        $sha = Hash (Join-Path $f 'tests/Reference/Dashes/native/metrics.json')
        Provenance $f { param($p) $p.artifacts.'metrics.json' = $sha }
    } },
    @{ Name = 'rehashed-false-probes'; Exit = 2; Change = { param($f)
        Change-Json $f 'tests/Reference/Dashes/native/metrics.json' { param($m) $m.plainProbedSvgIdentical = $false }
        $sha = Hash (Join-Path $f 'tests/Reference/Dashes/native/metrics.json')
        Provenance $f { param($p) $p.artifacts.'metrics.json' = $sha }
    } },
    @{ Name = 'wrong-snapshot-profile'; Exit = 2; Change = { param($f) Change-Json $f 'tests/Reference/Dashes/snapshot.json' { param($s) $s.id = 'wrong' } } },
    @{ Name = 'wrong-framework-identity'; Exit = 2; Change = { param($f) Change-Json $f 'tests/Reference/Dashes/snapshot.json' { param($s) $s.frameworkReferences = @('System.Wrong') } } }
)
$results = [Collections.Generic.List[object]]::new()
foreach ($trial in $trials) {
    $folder = Join-Path $runDirectory $trial.Name; Guard-Output $folder
    foreach ($file in $files) {
        $target = Join-Path $folder $file; Guard-Output $target
        [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
        Copy-Item -LiteralPath (Join-Path $repositoryRoot $file) -Destination $target
    }
    & $trial.Change $folder
    $actual = Invoke-Check $folder
    $passed = $actual.ExitCode -eq $trial.Exit -and $actual.Message.Length -gt 0
    if ($trial.Exit -eq 0) { $passed = $passed -and $actual.Message.Contains('40 native states') }
    $results.Add([pscustomobject]@{ Name = $trial.Name; ExpectedExit = $trial.Exit; ActualExit = $actual.ExitCode; Passed = $passed; Diagnostic = $actual.Message })
    Write-Output "$($trial.Name): expected $($trial.Exit), actual $($actual.ExitCode)"
}
foreach ($file in $files) { if ((Hash (Join-Path $repositoryRoot $file)) -ne $originalHashes[$file]) { throw 'Controls changed original evidence/source.' } }
$report = [pscustomobject]@{
    SchemaVersion = 1; Kind = 'cached-dash-evidence-controls'; Completed = $true
    Passed = @($results | Where-Object { -not $_.Passed }).Count -eq 0
    ConverterInvoked = $false; LiveOracleInvoked = $false; EmptyPath = $true
    Scope = 'Cached integrity only; external snapshot stays immutable for artifact/provenance mutations. No image admission.'
    SnapshotSha256 = Hash $snapshotPath; ValidatorAssemblySha256 = Hash $tool; ControlSourceSha256 = Hash $PSCommandPath
    OriginalHashes = $originalHashes; Results = $results
}
$artifacts = @{}
foreach ($file in Get-ChildItem -LiteralPath $runDirectory -File -Recurse) {
    $relative = [IO.Path]::GetRelativePath($runDirectory, $file.FullName).Replace('\', '/')
    $artifacts[$relative] = Hash $file.FullName
}
$report | Add-Member -NotePropertyName Artifacts -NotePropertyValue $artifacts
Write-Json (Join-Path $runDirectory 'report.json') $report
Write-Json (Join-Path $artifactOwner 'dash-cache-controls/latest.json') ([pscustomobject]@{
    Completed = $true; Passed = $report.Passed
    Report = [IO.Path]::GetRelativePath((Join-Path $artifactOwner 'dash-cache-controls'), (Join-Path $runDirectory 'report.json')).Replace('\', '/')
    Sha256 = Hash (Join-Path $runDirectory 'report.json')
})
if (-not $report.Passed) { throw 'Cached dash evidence controls failed; see report.json.' }
Write-Output "$($results.Count) cached dash controls pass; original baseline/source unchanged; PATH empty."
