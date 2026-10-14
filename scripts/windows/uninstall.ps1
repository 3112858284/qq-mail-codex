param([switch]$RemoveCredentials)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'common.ps1')
$qqCodex = Get-QqCodexExecutable
& $qqCodex plugin remove 'qq-mail@qq-mail-local' --json
if ($LASTEXITCODE -ne 0) { throw '卸载插件失败。' }
& $qqCodex plugin marketplace remove 'qq-mail-local' --json
if ($LASTEXITCODE -ne 0) { throw '移除插件目录失败。' }
$qqConfigPath = Join-Path (Get-QqCodexRoot) 'config.toml'
if (Test-Path -LiteralPath $qqConfigPath) {
    $qqText = [IO.File]::ReadAllText($qqConfigPath)
    $qqText = [regex]::Replace($qqText, '(?ms)^# BEGIN QQ-MAIL MANAGED POLICY\r?\n.*?^# END QQ-MAIL MANAGED POLICY\r?\n?', '')
    $qqText = [regex]::Replace($qqText, '(?m)^# (BEGIN|END) QQ-MAIL MANAGED POLICY\r?\n?', '')
    [IO.File]::WriteAllText($qqConfigPath, $qqText, (New-Object Text.UTF8Encoding($false)))
}
if ($RemoveCredentials) { Write-Host '请在 Windows 用户环境变量中自行移除 QQ_MAIL_ADDRESS 和 QQ_MAIL_AUTH_CODE，然后完全退出 Codex。' }
Write-Host 'QQ 邮箱插件已卸载。源码、运行时副本和发送防重复记录保留。'
