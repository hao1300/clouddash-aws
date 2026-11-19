$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$tauri = Join-Path $repo 'src-tauri'
$version = (Get-Content -Raw -LiteralPath (Join-Path $tauri 'tauri.conf.json') | ConvertFrom-Json).version
if ($version -notmatch '^[1-9][0-9]*\.[0-9]+\.[0-9]+$' -or
    ($version -split '\.' | Where-Object { [long]$_ -gt 65535 })) {
    throw "Microsoft Store requires a three-component numeric release version with each component at most 65535. Found '$version'."
}

$sdk = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
$makeAppx = Get-ChildItem -LiteralPath $sdk -Directory |
    Where-Object { $_.Name -match '^10\.\d+\.\d+\.\d+$' } |
    Sort-Object { [version]$_.Name } -Descending |
    ForEach-Object { Join-Path $_.FullName 'x64\makeappx.exe' } |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
    Select-Object -First 1
if (-not $makeAppx) {
    throw 'MakeAppx.exe was not found. Install the Windows SDK.'
}

$outputDir = Join-Path $repo 'release-dist\microsoft-store'
$null = New-Item -ItemType Directory -Path $outputDir -Force
$workDir = Join-Path $outputDir 'package-inputs'
$null = New-Item -ItemType Directory -Path $workDir -Force
$manifest = Join-Path $workDir 'AppxManifest.xml'
$manifestTemplate = Get-Content -Raw -LiteralPath (Join-Path $tauri 'windows\AppxManifest.xml')
$manifestTemplate.Replace('__PACKAGE_VERSION__', "$version.0") | Set-Content -LiteralPath $manifest -Encoding utf8

$targetDir = if ($env:CARGO_TARGET_DIR) { $env:CARGO_TARGET_DIR } else { Join-Path $tauri 'target' }
$exe = Join-Path $targetDir 'x86_64-pc-windows-msvc\release\clouddash-aws.exe'
$files = [ordered]@{
    'AppxManifest.xml' = $manifest
    'clouddash-aws.exe' = $exe
    'LICENSE.md' = Join-Path $repo 'LICENSE.md'
    'NOTICE.md' = Join-Path $repo 'NOTICE.md'
    'Assets\StoreLogo.png' = Join-Path $tauri 'icons\StoreLogo.png'
    'Assets\Square150x150Logo.png' = Join-Path $tauri 'icons\Square150x150Logo.png'
    'Assets\Square44x44Logo.png' = Join-Path $tauri 'icons\Square44x44Logo.png'
}
$mappingFile = Join-Path $workDir 'mapping.txt'
$mapping = foreach ($entry in $files.GetEnumerator()) {
    $source = (Get-Item -LiteralPath $entry.Value).FullName
    '"{0}" "{1}"' -f $source, $entry.Key
}
@('[Files]') + $mapping | Set-Content -LiteralPath $mappingFile -Encoding utf8

$package = Join-Path $outputDir 'clouddash-windows-x64.msix'
& $makeAppx pack /f $mappingFile /p $package /o
if ($LASTEXITCODE -ne 0) {
    throw "MakeAppx.exe failed with exit code $LASTEXITCODE."
}
