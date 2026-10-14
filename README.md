# QQ 邮箱个人插件

在 Windows Codex 桌面端，通过聊天读取、搜索和总结 QQ 邮件，保存草稿到 QQ 邮箱，并在确认后发送和回复。第一版连接一个个人 `@qq.com` 或 `@foxmail.com` 邮箱。

## 开始使用

1. 需要 Windows、Codex 桌面端和 Node.js 22+。从 GitHub 源码安装时，先按下方“从源码安装”完成依赖安装与编译，再打开 **install.cmd**。
2. 在 [QQ 邮箱](https://mail.qq.com) 的账户设置中开启 IMAP/SMTP 服务，生成授权码。界面位置以 QQ 邮箱当前版本为准。[官方授权码帮助](https://help.mail.qq.com/detail/106/985)
3. 打开 Windows“环境变量”，在当前用户的变量中**新建两个独立变量**，不要把它们追加到 Path：

   | 变量名 | 值 |
   | --- | --- |
   | `QQ_MAIL_ADDRESS` | 完整个人 QQ 邮箱地址，例如 `123456789@qq.com` |
   | `QQ_MAIL_AUTH_CODE` | QQ 邮箱生成的授权码；不要填 QQ 登录密码 |

4. 完全退出并重新打开 Codex，让它继承新的环境变量。已打开的终端或 PyCharm 也需要重新打开。当前版本只读取进程环境变量，不加载 `.env` 文件，也不读取旧 DPAPI 凭据。
5. 在新打开的终端运行 **check-connection.cmd** 或 **configure.cmd**，它们只检查 IMAP/SMTP 登录，**不会发送测试邮件**，也不会保存凭据。检查失败时按提示检查网络、服务开关和授权码。
6. 开启新聊天，选择“QQ 邮箱”插件或输入“查看 QQ 邮箱最近的未读邮件”。如果该聊天不自动加载插件，请在插件目录中确认插件已启用。

连接后可以说：“总结今天收到的 QQ 邮件”“搜索小王发来的报价邮件”“帮我起草回复，先让我确认”。首次真实发信应先确认测试收件人和内容。

## 草稿与发送

草稿使用纯文本，支持 To、Cc、Bcc；回复默认只回复 Reply-To 或原发件人，保留邮件关联头。起草后可在 QQ 草稿箱查看和编辑。更新草稿会返回新的标识，旧草稿清理失败时会提示，可能需手动删除。

发送时必须先展示完整收件人、主题和正文，等你明确确认后才调用发送工具。预览有效 30 分钟；修改内容后必须重新预览确认。插件仅发送自身创建并跟踪的草稿；外部编辑后的附件草稿不能发送。

SMTP 接受不等于收件人收件箱已收到。连接中断且结果不明时，插件阻止重试；先检查 QQ 已发送邮件及收件情况，不要复制草稿绕过保护。插件不另外追加“已发送”副本，以避免 QQ SMTP 自动保存时出现重复；服务端是否保存请在 QQ 邮箱核实。

## 能力边界

- 搜索支持发件人、收件人、主题、正文关键词、日期、未读状态和文件夹；最新 UID 优先，每页默认 20 封，最多 100 封。IMAP 服务端负责字符匹配和日期匹配，不支持 Gmail 搜索语法。
- 日期格式为 YYYY-MM-DD，开始日期含当天、结束日期不含当天。聊天中的相对日期按 Asia/Shanghai 理解。
- 读取保持已读状态；邮件定位包含文件夹、UIDVALIDITY、UID。标识失效需要重新搜索。
- 邮件原始大小最多 10 MB，返回正文最多 512 Ki 字符并注明截断；较大邮件请在 QQ 邮箱查看。附件仅返回名称、大小和类型，不提供上传、下载或发送。
- 草稿箱须具有唯一的 IMAP `\\Drafts` 特殊用途标记；无法识别时返回错误，不猜测或创建文件夹。
- 草稿清理须支持 UIDPLUS，避免误删其他已标记删除的邮件；不支持时保留草稿并提示手动清理。
- 无转发、批量管理、定时发送、邮件推送、后台监控或多账户并行连接。

## 凭据与本机状态

凭据从 `process.env.QQ_MAIL_ADDRESS` 和 `process.env.QQ_MAIL_AUTH_CODE` 读取，不写入任何凭据文件。插件的 MCP 配置使用 `env_vars` 显式转发这两个字段及 `LOCALAPPDATA`；源码和配置只保存变量名，不保存变量值。MCP 连接 `imap.qq.com:993`、`smtp.qq.com:465`，校验 TLS 证书。

邮件内容会通过工具返回到当前 Codex 聊天供总结；授权码不返回到聊天，不写入源码、日志或安装包。旧版 `mail.credential.xml` 即使存在也不会被读取。不存在环境变量时明确报错，不回退到旧凭据。

更换授权码或邮箱时修改对应的 Windows 用户环境变量，再完全退出并重新打开 Codex。断开连接时移除这两个环境变量并完全退出 Codex；**disconnect.cmd** 会显示这项操作的说明，不替你修改系统变量。发送防重复状态保留，换回同一账户仍可阻止重复发信。

账户状态放在 %LOCALAPPDATA%\QQMailCodex 的账户哈希子目录，包含草稿标识、预览内容哈希及发送记录，不保存授权码或邮件正文。进程中断时可能留下 `operation.lock`：先关闭所有使用本插件的 Codex 聊天和进程，检查 QQ 已发送邮件，再仅移除对应账户目录中的这个锁文件。不要删除 `state.json` 以绕过发送防重复保护。`attempting`/`uncertain` 记录不会自动放行。

## 安装、卸载和源码

### 从源码安装

在 PowerShell 中执行：

```powershell
git clone https://github.com/3112858284/qq-mail-codex.git
cd qq-mail-codex
npm ci --ignore-scripts
npm run build
.\install.cmd
```

随后按“开始使用”设置两个 Windows 用户环境变量，并完全退出、重新打开 Codex。Git 仓库包含源码和依赖锁文件；`node_modules/`、`dist/`、`.env` 及运行时状态不纳入版本管理。

安装脚本注册 `qq-mail-local` 个人插件目录，通过 `codex plugin add qq-mail@qq-mail-local` 安装；仅添加插件自己的发送审批表，保留已有 Codex 配置并创建配置备份。发送工具设置为 `approval_mode = "prompt"`。配置可受管理员策略或用户会话设置约束；即使客户端不展示审批，技能仍要求先预览并明确确认。

打开 **uninstall.cmd** 卸载插件及目录注册，移除插件自己添加的策略；Windows 用户环境变量由你自行管理。`uninstall.cmd -RemoveCredentials` 只显示移除变量的说明，不修改系统变量。卸载不会删除交付源码或发送记录。

源码位于 `src/`，自动测试位于 `tests/`，编译服务器在 `dist/`。开发命令：

```powershell
npm ci --ignore-scripts
npm test
```

依赖版本和传递依赖固定在 package-lock.json。安装包包含运行时依赖，不需要 OpenAI API 密钥，也不启动公网服务器。

架构依据：[OpenAI 本地插件](https://developers.openai.com/plugins/deploy/desktop-only)、[插件打包](https://developers.openai.com/plugins/build/plugins)、[ImapFlow](https://imapflow.com/docs/api/imapflow-client/)、[Nodemailer](https://nodemailer.com/smtp)。
