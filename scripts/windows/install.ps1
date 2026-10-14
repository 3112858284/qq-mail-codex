$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$qqProjectRoot = Get-QqProjectRoot
$qqNode = Get-Command node -ErrorAction Stop
$qqMajor = [int]((& $qqNode.Source --version) -replace '^v(\d+).*', '$1')
if ($qqMajor -lt 22) { throw '需要 Node.js 22 或以上版本。' }
$qqCodex = Get-QqCodexExecutable
$qqConfigRoot = Get-QqCodexRoot
New-Item -ItemType Directory -Path $qqConfigRoot -Force | Out-Null
$qqConfigPath = Join-Path $qqConfigRoot 'config.toml'
if (Test-Path -LiteralPath $qqConfigPath) { Copy-Item -LiteralPath $qqConfigPath -Destination (Join-Path $qqConfigRoot ('config.qq-mail-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.toml')) }
if (-not (Test-Path -LiteralPath (Join-Path $qqProjectRoot 'dist/cli/serve.js'))) {
    Push-Location $qqProjectRoot
    try {
        & npm.cmd ci --ignore-scripts --no-fund --no-audit
        if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。' }
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw '编译失败。' }
    } finally { Pop-Location }
}
$qqVersion = (Get-Content -LiteralPath (Join-Path $qqProjectRoot 'package.json') -Raw | ConvertFrom-Json).version
$qqMarketplaceRoot = Join-Path $qqConfigRoot 'qq-mail-marketplace'
$qqDeployment = Join-Path $qqMarketplaceRoot ('plugins/qq-mail-' + $qqVersion)
& $qqNode.Source (Join-Path $qqProjectRoot 'scripts/package.mjs') --directory $qqDeployment --node-command $qqNode.Source
if ($LASTEXITCODE -ne 0) { throw '运行时打包失败。' }
$qqMarketplaceFile = Join-Path $qqMarketplaceRoot '.agents/plugins/marketplace.json'
New-Item -ItemType Directory -Path (Split-Path -Parent $qqMarketplaceFile) -Force | Out-Null
$qqCatalog = @{ name = 'qq-mail-local'; interface = @{ displayName = '个人 QQ 邮箱插件' }; plugins = @(@{ name = 'qq-mail'; source = @{ source = 'local'; path = ('./plugins/qq-mail-' + $qqVersion) }; policy = @{ installation = 'AVAILABLE'; authentication = 'ON_USE' }; category = 'Productivity' }) }
[IO.File]::WriteAllText($qqMarketplaceFile, ($qqCatalog | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
$qqSourcesJson = & $qqCodex plugin marketplace list --json
if ($LASTEXITCODE -ne 0) { throw '读取插件目录配置失败。' }
$qqExisting = ($qqSourcesJson | ConvertFrom-Json).marketplaces | Where-Object { $_.name -eq 'qq-mail-local' }
if ($qqExisting -and ([IO.Path]::GetFullPath($qqExisting.root).TrimEnd('\') -ne [IO.Path]::GetFullPath($qqMarketplaceRoot).TrimEnd('\'))) {
    & $qqCodex plugin marketplace remove 'qq-mail-local' --json
    if ($LASTEXITCODE -ne 0) { throw '更新插件目录失败。' }
}
& $qqCodex plugin marketplace add $qqMarketplaceRoot --json
if ($LASTEXITCODE -ne 0) { throw '注册插件目录失败。' }
& $qqCodex plugin add 'qq-mail@qq-mail-local' --json
if ($LASTEXITCODE -ne 0) { throw '安装插件失败。' }
Set-QqSendPolicy -ConfigPath $qqConfigPath
$qqInstalledJson = & $qqCodex plugin list --json
if ($LASTEXITCODE -ne 0) { throw '插件验证失败。' }
$qqInstalled = ($qqInstalledJson | ConvertFrom-Json).installed | Where-Object { $_.pluginId -eq 'qq-mail@qq-mail-local' }
if (-not $qqInstalled -or -not $qqInstalled.enabled -or $qqInstalled.version -ne $qqVersion) { throw '插件未启用或版本不正确。' }
$qqInstalled | Select-Object pluginId, version, installed, enabled | ConvertTo-Json
Write-Host 'QQ 邮箱插件已安装。源码保持不变，发送工具逐次询问。'
Write-Host '设置 QQ_MAIL_ADDRESS 和 QQ_MAIL_AUTH_CODE 后，完全退出并重新打开 Codex。'
