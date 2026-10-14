$ErrorActionPreference = 'Stop'
$qqPluginDirectory = Split-Path -Parent $PSScriptRoot
$qqMarketplaceRoot = Split-Path -Parent $qqPluginDirectory
$qqNode = Get-Command node -ErrorAction Stop
$qqNodeMajor = [int]((& $qqNode.Source --version) -replace '^v(\d+).*', '$1')
if ($qqNodeMajor -lt 22) { throw '需要 Node.js 22 或以上版本。' }
$qqCodex = Get-Command codex -ErrorAction SilentlyContinue
if (-not $qqCodex) {
    $qqCodex = Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'OpenAI/Codex/bin') -Filter codex.exe -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if (-not $qqCodex) { throw '未找到 Codex 命令。请先安装或启动 Codex 桌面端。' }
$qqCodexPath = if ($qqCodex.Source) { $qqCodex.Source } else { $qqCodex.FullName }
if (-not (Test-Path -LiteralPath (Join-Path $qqPluginDirectory 'dist/server.js'))) { throw '缺少编译后的服务器，请先 npm ci 和 npm run build。' }
if (-not (Test-Path -LiteralPath (Join-Path $qqPluginDirectory 'node_modules/@modelcontextprotocol/sdk'))) {
    Push-Location $qqPluginDirectory
    try { & npm.cmd ci --omit=dev --ignore-scripts --no-fund --no-audit; if ($LASTEXITCODE -ne 0) { throw '依赖安装失败。' } } finally { Pop-Location }
}
$qqMarketplaceFile = Join-Path $qqMarketplaceRoot '.agents/plugins/marketplace.json'
if (-not (Test-Path -LiteralPath $qqMarketplaceFile)) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $qqMarketplaceFile) -Force | Out-Null
    $qqPluginFolder = Split-Path -Leaf $qqPluginDirectory
    $qqCatalog = @{ name = 'qq-mail-local'; interface = @{ displayName = '个人 QQ 邮箱插件' }; plugins = @(@{ name = 'qq-mail'; source = @{ source = 'local'; path = ('./' + $qqPluginFolder) }; policy = @{ installation = 'AVAILABLE'; authentication = 'ON_USE' }; category = 'Productivity' }) }
    [IO.File]::WriteAllText($qqMarketplaceFile, ($qqCatalog | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
}
# The installed copy must use a runtime visible to the desktop host as well as this shell.
$qqMcp = Get-Content -LiteralPath (Join-Path $qqPluginDirectory 'mcp.json') -Raw | ConvertFrom-Json
$qqMcp.mcpServers.qq_mail.command = $qqNode.Source
[IO.File]::WriteAllText((Join-Path $qqPluginDirectory 'mcp.json'), ($qqMcp | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
$qqMarketplacesJson = & $qqCodexPath plugin marketplace list --json
if ($LASTEXITCODE -ne 0) { throw '读取插件目录配置失败。' }
$qqExistingMarketplace = ($qqMarketplacesJson | ConvertFrom-Json).marketplaces | Where-Object { $_.name -eq 'qq-mail-local' }
if ($qqExistingMarketplace -and ([IO.Path]::GetFullPath($qqExistingMarketplace.root).TrimEnd('\') -ne [IO.Path]::GetFullPath($qqMarketplaceRoot).TrimEnd('\'))) {
    & $qqCodexPath plugin marketplace remove 'qq-mail-local' --json
    if ($LASTEXITCODE -ne 0) { throw '更新 QQ 邮箱插件源码位置失败。' }
}
& $qqCodexPath plugin marketplace add $qqMarketplaceRoot --json
if ($LASTEXITCODE -ne 0) { throw '注册个人插件目录失败。' }
& $qqCodexPath plugin add 'qq-mail@qq-mail-local' --json
if ($LASTEXITCODE -ne 0) { throw '安装 QQ 邮箱插件失败。' }

$qqConfigRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
$qqConfigPath = Join-Path $qqConfigRoot 'config.toml'
$qqConfig = if (Test-Path -LiteralPath $qqConfigPath) { [IO.File]::ReadAllText($qqConfigPath) } else { '' }
$qqMarker = '(?ms)^# BEGIN QQ-MAIL MANAGED POLICY\r?\n.*?^# END QQ-MAIL MANAGED POLICY\r?\n?'
$qqConfig = [regex]::Replace($qqConfig, $qqMarker, '')
$qqConfig = [regex]::Replace($qqConfig, '(?m)^# (BEGIN|END) QQ-MAIL MANAGED POLICY\r?\n?', '')
if ($qqConfig -match '(?m)^\[plugins\."qq-mail@qq-mail-local"\.mcp_servers\.qq_mail\.tools\.send_draft\]\s*$') {
    throw '发现已有自定义发送策略。插件已安装，但请手动将该表的 approval_mode 设为 prompt，再使用发送。'
}
$qqPolicy = @'
# BEGIN QQ-MAIL MANAGED POLICY
[plugins."qq-mail@qq-mail-local".mcp_servers.qq_mail.tools.send_draft]
approval_mode = "prompt"
# END QQ-MAIL MANAGED POLICY
'@
if (Test-Path -LiteralPath $qqConfigPath) {
    $qqBackupPath = Join-Path $qqConfigRoot ('config.qq-mail-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.toml')
    Copy-Item -LiteralPath $qqConfigPath -Destination $qqBackupPath
}
New-Item -ItemType Directory -Path $qqConfigRoot -Force | Out-Null
[IO.File]::WriteAllText($qqConfigPath, ($qqConfig.TrimEnd() + "`n`n" + $qqPolicy + "`n"), (New-Object Text.UTF8Encoding($false)))
$qqInstalledJson = & $qqCodexPath plugin list --json
if ($LASTEXITCODE -ne 0) { throw '安装完成，但配置验证失败；请检查 Codex 配置。' }
$qqInstalled = ($qqInstalledJson | ConvertFrom-Json).installed | Where-Object { $_.pluginId -eq 'qq-mail@qq-mail-local' }
if (-not $qqInstalled -or -not $qqInstalled.enabled) { throw 'QQ 邮箱插件未启用，请检查 Codex 插件设置。' }
$qqInstalled | Select-Object pluginId, version, installed, enabled | ConvertTo-Json
Write-Host 'QQ 邮箱插件已安装，发送工具配置为逐次询问。'
Write-Host '下一步：设置用户环境变量 QQ_MAIL_ADDRESS 和 QQ_MAIL_AUTH_CODE；完全退出并重新打开 Codex。'
