param(
    [Parameter(Mandatory=$true)][string]$PackageDirectory,
    [Parameter(Mandatory=$true)][string]$SourceRoot,
    [Parameter(Mandatory=$true)][string]$OutputDirectory
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$packageFiles = @(Get-ChildItem -LiteralPath $PackageDirectory -Filter '*.nupkg' -File)
$symbolFiles = @(Get-ChildItem -LiteralPath $PackageDirectory -Filter '*.snupkg' -File)
if ($packageFiles.Count -ne 1 -or $symbolFiles.Count -ne 1) { throw 'Expected the checked package pair.' }
$controls = @()
foreach ($fault in @('missing-xml', 'dependency', 'changed-dll', 'development-asset', 'missing-font-source')) {
    $directory = Join-Path $OutputDirectory $fault
    $null = New-Item -ItemType Directory -Path $directory -Force
    $packagePath = Join-Path $directory $packageFiles[0].Name
    Copy-Item -LiteralPath $packageFiles[0].FullName -Destination $packagePath
    Copy-Item -LiteralPath $symbolFiles[0].FullName -Destination $directory
    $archive = [System.IO.Compression.ZipFile]::Open($packagePath, [System.IO.Compression.ZipArchiveMode]::Update)
    try {
        $bytes = $null; $entryName = $null
        switch ($fault) {
            'missing-xml' { $archive.GetEntry('lib/net10.0/Lokad.TikZ.xml').Delete(); $expected = 'Missing packed API XML' }
            'missing-font-source' { $archive.GetEntry('font-data/LokadTikzText-regular-10.json').Delete(); $expected = 'Missing packaged source asset: src/Lokad.TikZ/Resources/Fonts/LokadTikzText-regular-10.json' }
            'changed-dll' {
                $entryName = 'lib/net10.0/Lokad.TikZ.dll'
                $archive.GetEntry($entryName).Delete(); $bytes = [byte[]]@(0, 1, 2, 3)
                $expected = 'Packaged bytes differ from current source: src/Lokad.TikZ/bin/Release/net10.0/Lokad.TikZ.dll'
            }
            'development-asset' {
                $entryName = 'unpackaged-tool-data.json'; $bytes = [System.Text.Encoding]::UTF8.GetBytes('development asset')
                $expected = 'Unexpected package payload'
            }
            'dependency' {
                $entry = @($archive.Entries | Where-Object { $_.FullName -like '*.nuspec' })[0]
                $stream = $entry.Open()
                try { $xml = [System.Xml.XmlDocument]::new(); $xml.Load($stream) }
                finally { $stream.Dispose() }
                $metadata = $xml.SelectSingleNode('//*[local-name()="metadata"]')
                $dependencies = $metadata.SelectSingleNode('*[local-name()="dependencies"]')
                if ($null -eq $dependencies) {
                    $dependencies = $xml.CreateElement('dependencies', $metadata.NamespaceURI)
                    $null = $metadata.AppendChild($dependencies)
                }
                $dependency = $xml.CreateElement('dependency', $metadata.NamespaceURI)
                $dependency.SetAttribute('id', 'Unwanted.Dependency'); $dependency.SetAttribute('version', '1.0.0')
                $null = $dependencies.AppendChild($dependency)
                $entryName = $entry.FullName; $entry.Delete()
                $bytes = [System.Text.Encoding]::UTF8.GetBytes($xml.OuterXml)
                $expected = 'Production package dependency'
            }
        }
        if ($null -ne $entryName) {
            $entry = $archive.CreateEntry($entryName); $stream = $entry.Open()
            try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
        }
    } finally { $archive.Dispose() }
    $rejection = $null
    try { $null = & (Join-Path $PSScriptRoot 'audit.ps1') -PackageDirectory $directory -SourceRoot $SourceRoot }
    catch { $rejection = $_.Exception.Message }
    if ($null -eq $rejection -or -not $rejection.Contains($expected)) { throw "Wrong rejection for ${fault}: $rejection" }
    $controls += [ordered]@{
        name = $fault; passed = $true; rejection = $rejection
        mutatedPackageSha256 = (Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash.ToLowerInvariant()
    }
}
[ordered]@{
    completed = $true
    checkedPackageSha256 = (Get-FileHash -LiteralPath $packageFiles[0].FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    controls = $controls
} | ConvertTo-Json -Depth 4 -Compress
