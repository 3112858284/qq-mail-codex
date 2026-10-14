param([Parameter(Mandatory=$true)][string]$SourcePath, [Parameter(Mandatory=$true)][string]$ArchivePath)
$ErrorActionPreference = 'Stop'
$qqSource = [IO.Path]::GetFullPath($SourcePath)
$qqArchive = [IO.Path]::GetFullPath($ArchivePath)
if (-not $qqArchive.EndsWith('.zip', [StringComparison]::OrdinalIgnoreCase)) { throw 'Archive path must name a .zip file.' }
if (-not (Test-Path -LiteralPath (Join-Path $qqSource 'plugin.json'))) { throw 'Source is not a plugin package.' }
if (Test-Path -LiteralPath $qqArchive) {
    if (-not (Test-Path -LiteralPath $qqArchive -PathType Leaf)) { throw 'Archive target must be a file.' }
    Remove-Item -LiteralPath $qqArchive
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($qqSource, $qqArchive, [IO.Compression.CompressionLevel]::Optimal, $true)
