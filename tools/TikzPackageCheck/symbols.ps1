param(
    [Parameter(Mandatory=$true)][byte[]]$PdbBytes,
    [Parameter(Mandatory=$true)][string]$SourceRoot,
    [Parameter(Mandatory=$true)][string]$RepositoryUrl,
    [Parameter(Mandatory=$true)][string]$SourceRevision
)
$ErrorActionPreference = 'Stop'
if ($SourceRevision -notmatch '^[a-f0-9]{40}$') { throw 'Expected immutable source revision.' }
$repository = [Uri]::new($RepositoryUrl)
if ($repository.Scheme -ne 'https' -or $repository.Host -ne 'github.com' -or
    $repository.AbsolutePath -notmatch '^/[^/]+/[^/]+$' -or $repository.Query -or $repository.Fragment) {
    throw 'Unsupported source repository URL.'
}
$expectedUrl = 'https://raw.githubusercontent.com' + $repository.AbsolutePath + '/' + $SourceRevision + '/*'
$stream = [System.IO.MemoryStream]::new($PdbBytes, $false)
$provider = [System.Reflection.Metadata.MetadataReaderProvider]::FromPortablePdbStream(
    $stream, [System.Reflection.Metadata.MetadataStreamOptions]::LeaveOpen, 0)
try {
    $reader = $provider.GetMetadataReader([System.Reflection.Metadata.MetadataReaderOptions]::Default, $null)
    $sourceLinks = @()
    $embedded = @{}
    foreach ($handle in $reader.CustomDebugInformation) {
        $info = $reader.GetCustomDebugInformation($handle)
        $kind = $reader.GetGuid($info.Kind)
        if ($kind -eq [Guid]'CC110556-A091-4D38-9FEC-25AB9A351A6A') {
            $sourceLinks += [System.Text.Encoding]::UTF8.GetString($reader.GetBlobBytes($info.Value))
        }
        if ($kind -eq [Guid]'0E8A571B-6926-466E-B4AD-8AB04611F5FE') {
            if ($info.Parent.Kind -ne [System.Reflection.Metadata.HandleKind]::Document -or $embedded.ContainsKey($info.Parent)) {
                throw 'Invalid embedded source identity.'
            }
            $embedded[$info.Parent] = $reader.GetBlobBytes($info.Value)
        }
    }
    if ($sourceLinks.Count -ne 1) { throw 'Expected one SourceLink map.' }
    $sourceLink = $sourceLinks[0] | ConvertFrom-Json -AsHashtable
    if ($sourceLink.Count -ne 1 -or $sourceLink.documents -isnot [System.Collections.IDictionary] -or
        $sourceLink.documents.Count -ne 1 -or -not $sourceLink.documents.Contains('/_/*')) {
        throw 'Invalid SourceLink document mapping.'
    }
    if ($sourceLink.documents['/_/*'] -cne $expectedUrl) { throw 'SourceLink repository or revision differs.' }
    $generated = @(
        'src/Lokad.TikZ/obj/Release/net10.0/Lokad.TikZ.GlobalUsings.g.cs',
        'src/Lokad.TikZ/obj/Release/net10.0/.NETCoreApp,Version=v10.0.AssemblyAttributes.cs',
        'src/Lokad.TikZ/obj/Release/net10.0/Lokad.TikZ.AssemblyInfo.cs'
    )
    $repositoryDocuments = @()
    $generatedDocuments = @()
    foreach ($handle in $reader.Documents) {
        $document = $reader.GetDocument($handle)
        $name = $reader.GetString($document.Name)
        if (-not $name.StartsWith('/_/src/Lokad.TikZ/', [StringComparison]::Ordinal) -or
            $name.Contains('\') -or $name -match '(^|/)\.{1,2}(/|$)' -or -not $name.EndsWith('.cs')) {
            throw 'Unmapped or private source document path.'
        }
        if ($reader.GetGuid($document.HashAlgorithm) -ne [Guid]'8829D00F-11B8-4213-878B-770E8597AC16') {
            throw 'Expected SHA-256 document checksum.'
        }
        $relative = $name.Substring(3)
        $file = Join-Path $SourceRoot $relative
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing symbol source: $relative" }
        $checksum = [Convert]::ToHexString($reader.GetBlobBytes($document.Hash)).ToLowerInvariant()
        if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -ne $checksum) {
            throw "Symbol source checksum differs: $relative"
        }
        $entity = [System.Reflection.Metadata.EntityHandle]$handle
        if ($relative -in $generated) {
            if (-not $embedded.ContainsKey($entity)) { throw 'Missing embedded generated source.' }
            [byte[]]$blob = $embedded[$entity]
            if ($blob.Length -lt 4) { throw 'Invalid embedded source.' }
            $length = [BitConverter]::ToInt32($blob, 0)
            if ($length -lt 0 -or $length -gt 1048576) { throw 'Embedded source length exceeds bound.' }
            $compressedSource = [System.IO.MemoryStream]::new($blob, 4, $blob.Length - 4, $false)
            $output = [System.IO.MemoryStream]::new()
            try {
                if ($length -eq 0) { $compressedSource.CopyTo($output) }
                else {
                    $decoder = [System.IO.Compression.DeflateStream]::new($compressedSource, [System.IO.Compression.CompressionMode]::Decompress)
                    try {
                        $buffer = [byte[]]::new(4096)
                        while (($count = $decoder.Read($buffer, 0, $buffer.Length)) -gt 0) {
                            if ($output.Length + $count -gt $length) { throw 'Embedded source exceeds declared length.' }
                            $output.Write($buffer, 0, $count)
                        }
                    } finally { $decoder.Dispose() }
                    if ($output.Length -ne $length) { throw 'Embedded source length differs.' }
                }
                $actual = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData($output.ToArray())).ToLowerInvariant()
                if ($actual -ne $checksum) { throw 'Embedded source checksum differs.' }
            } finally { $compressedSource.Dispose(); $output.Dispose() }
            $generatedDocuments += $relative
        } else {
            if ($relative.Contains('/obj/') -or $embedded.ContainsKey($entity)) { throw 'Unexpected generated or embedded repository source.' }
            $repositoryDocuments += $relative
        }
    }
    if ($repositoryDocuments.Count -eq 0 -or $generatedDocuments.Count -ne $generated.Count) { throw 'Incomplete symbol documents.' }
    [ordered]@{
        completed = $true; sourceRevision = $SourceRevision; sourceLinkPattern = $expectedUrl
        repositoryDocuments = $repositoryDocuments.Count; embeddedGeneratedDocuments = $generatedDocuments.Count
        sourceChecksumsVerified = $true; privatePathsAbsent = $true
    }
} finally { $provider.Dispose(); $stream.Dispose() }
