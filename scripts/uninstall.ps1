param([switch]$RemoveCredentials)
$ErrorActionPreference = 'Stop'
$qqCodex = Get-Command codex -ErrorAction SilentlyContinue
if (-not $qqCodex) {
    $qqCodex = Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'OpenAI/Codex/bin') -Filter codex.exe -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if (-not $qqCodex) { throw '未找到 Codex 命令。' }
$qqCodexPath = if ($qqCodex.Source) { $qqCodex.Source } else { $qqCodex.FullName }
& $qqCodexPath plugin remove 'qq-mail@qq-mail-local' --json
if ($LASTEXITCODE -ne 0) { throw '卸载插件失败。' }
& $qqCodexPath plugin marketplace remove 'qq-mail-local' --json
if ($LASTEXITCODE -ne 0) { throw '移除插件目录失败。' }
$qqConfigRoot = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $env:USERPROFILE '.codex' }
$qqConfigPath = Join-Path $qqConfigRoot 'config.toml'
if (Test-Path -LiteralPath $qqConfigPath) {
    $qqText = [IO.File]::ReadAllText($qqConfigPath)
    $qqText = [regex]::Replace($qqText, '(?ms)^# BEGIN QQ-MAIL MANAGED POLICY\r?\n.*?^# END QQ-MAIL MANAGED POLICY\r?\n?', '')
    $qqText = [regex]::Replace($qqText, '(?m)^# (BEGIN|END) QQ-MAIL MANAGED POLICY\r?\n?', '')
    [IO.File]::WriteAllText($qqConfigPath, $qqText, (New-Object Text.UTF8Encoding($false)))
}
if ($RemoveCredentials) { Write-Host '当前版本从环境变量读取凭据。请在 Windows 环境变量设置中自行移除 QQ_MAIL_ADDRESS 和 QQ_MAIL_AUTH_CODE，然后完全退出 Codex。' }
Write-Host 'QQ 邮箱插件已卸载。源码和发送防重复记录保留。'
