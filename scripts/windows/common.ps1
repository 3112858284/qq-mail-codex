function Get-QqProjectRoot { return Split-Path -Parent (Split-Path -Parent $PSScriptRoot) }
function Get-QqCodexRoot {
    if ($env:CODEX_HOME) { return $env:CODEX_HOME }
    return Join-Path $env:USERPROFILE '.codex'
}
function Get-QqCodexExecutable {
    $qqCommand = Get-Command codex -ErrorAction SilentlyContinue
    if ($qqCommand) { return $qqCommand.Source }
    $qqBinary = Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'OpenAI/Codex/bin') -Filter codex.exe -Recurse -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $qqBinary) { throw '未找到 Codex 命令，请先安装或启动 Codex 桌面端。' }
    return $qqBinary.FullName
}
function Set-QqSendPolicy {
    param([string]$ConfigPath)
    $qqConfig = if (Test-Path -LiteralPath $ConfigPath) { [IO.File]::ReadAllText($ConfigPath) } else { '' }
    $qqConfig = [regex]::Replace($qqConfig, '(?ms)^# BEGIN QQ-MAIL MANAGED POLICY\r?\n.*?^# END QQ-MAIL MANAGED POLICY\r?\n?', '')
    $qqConfig = [regex]::Replace($qqConfig, '(?m)^# (BEGIN|END) QQ-MAIL MANAGED POLICY\r?\n?', '')
    if ($qqConfig -match '(?m)^\[plugins\."qq-mail@qq-mail-local"\.mcp_servers\.qq_mail\.tools\.send_draft\]\s*$') { throw '发现自定义发送策略，请手动将该表的 approval_mode 设为 prompt。' }
    $qqPolicy = @'
# BEGIN QQ-MAIL MANAGED POLICY
[plugins."qq-mail@qq-mail-local".mcp_servers.qq_mail.tools.send_draft]
approval_mode = "prompt"
# END QQ-MAIL MANAGED POLICY
'@
    [IO.File]::WriteAllText($ConfigPath, ($qqConfig.TrimEnd() + "`n`n" + $qqPolicy + "`n"), (New-Object Text.UTF8Encoding($false)))
}
