param([switch]$Disconnect)
$ErrorActionPreference = 'Stop'
if ($Disconnect) {
    Write-Host '请在 Windows 用户环境变量中移除 QQ_MAIL_ADDRESS 和 QQ_MAIL_AUTH_CODE，然后完全退出 Codex。'
    Write-Host '此脚本不会修改环境变量；发送防重复记录保留。'
    exit 0
}
Write-Host '本插件从环境变量读取邮箱凭据：'
Write-Host 'QQ_MAIL_ADDRESS = 完整个人 QQ 邮箱地址'
Write-Host 'QQ_MAIL_AUTH_CODE = QQ 邮箱授权码'
Write-Host '请在 Windows 用户环境变量中配置，完全退出并重新打开 Codex；不要把授权码发到聊天。'
Write-Host '正在检查 IMAP/SMTP 登录，不发送邮件，也不保存凭据。'
$qqPluginDirectory = Split-Path -Parent $PSScriptRoot
& node (Join-Path $qqPluginDirectory 'dist/check.js')
if ($LASTEXITCODE -ne 0) { Write-Host '连接检查未通过。请确认环境变量已生效，以及 QQ 邮箱已开启 IMAP/SMTP 服务。'; exit 1 }
Write-Host '真实邮箱连接检查通过。'
