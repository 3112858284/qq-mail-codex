# QQ 邮箱 Codex 插件

在 Windows Codex 中读取、搜索和总结个人 QQ 邮箱邮件，保存回复草稿，并在确认后发送。TypeScript + Node.js 实现，通过本机 MCP 服务连接 QQ 邮箱。

## 快速开始

需要 Windows、Codex 桌面端、Node.js 22+（含 npm）和已开启 IMAP/SMTP 的个人 QQ 邮箱。

```powershell
git clone https://github.com/3112858284/qq-mail-codex.git
cd qq-mail-codex
npm ci --ignore-scripts
npm run build
.\install.cmd
```

安装器创建独立运行时副本，注册个人插件目录，并配置发送工具逐次询问。安装不会修改 Git 跟踪的源码或 `mcp.json`。从包含运行时依赖的 ZIP 安装包安装时，解压后打开 `install.cmd`；安装器会准备独立副本。

在 [QQ 邮箱](https://mail.qq.com) 开启 IMAP/SMTP 并生成授权码，然后在 Windows **用户环境变量**中新建：

| 变量名 | 内容 |
| --- | --- |
| `QQ_MAIL_ADDRESS` | 完整个人邮箱地址，例如 `123456789@qq.com`，也支持 `@foxmail.com` |
| `QQ_MAIL_AUTH_CODE` | QQ 邮箱授权码，不是 QQ 登录密码 |

变量分别创建，不追加到 `Path`。完全退出并重新打开 Codex、终端或 PyCharm，让进程继承新变量；项目不加载 `.env` 文件。

```powershell
npm run check
```

检查只验证 IMAP/SMTP 登录，不发送邮件。成功后，在 Codex 新聊天中启用“QQ 邮箱”插件，尝试：

- “查看 QQ 邮箱最近的未读邮件。”
- “搜索客户发来的报价邮件。”
- “帮我起草回复，先让我确认内容。”

## 邮件操作

| 工具 | 用途 |
| --- | --- |
| `check_connection` | 验证邮箱连接，不发送测试邮件 |
| `list_folders` | 查看文件夹及特殊用途标记 |
| `search_messages` | 按发件人、收件人、主题、正文、日期和未读状态搜索 |
| `get_message` | 读取正文和附件元数据，保持未读状态 |
| `create_draft` / `update_draft` | 创建或更新同步到 QQ 草稿箱的纯文本草稿 |
| `preview_draft` | 展示实际收件人、主题及正文，生成 30 分钟有效的预览令牌 |
| `send_draft` | 经用户确认后，校验版本并发送草稿 |

发送流程为“保存草稿 → 预览 → 用户确认 → 校验内容 → 发送”。修改草稿后需要重新预览确认。插件保存发送尝试记录；结果不明时阻止自动重发。SMTP 接受只代表服务器接受邮件，不保证到达收件箱。

目前支持单个个人 QQ 邮箱。附件仅显示名称、大小及类型，不上传、下载或发送；不提供批量删除、转发、后台邮件推送和自动发信。原始邮件读取上限 10 MB，正文超过 512 Ki 字符会注明截断。草稿同步需要唯一的 `\Drafts` 标记；清理草稿需要 UIDPLUS，缺少支持时返回提示并保留草稿。

## 每日待办摘要

在 Codex 中创建本机定时任务，指定时间及“读取未读邮件、筛选、生成摘要”。插件提供读取能力，定时任务负责调度，Codex 负责判断和总结。

项目提供可复用的只读入口：

```powershell
# 未指定请求文件时，只检查连接
npm run read-mail

# 传入 JSON 请求文件
npm run read-mail -- .\work\request.json
```

请求文件示例：

```json
{"tool":"search_messages","arguments":{"folder":"INBOX","unread":true,"pageSize":20}}
```

此入口只允许四个读取工具；不允许起草、发送或修改邮箱。任务提示模板、分页、去重和状态存放建议见 [自动化说明](docs/automation.md)。本机任务运行时需保持电脑开机及 Codex 运行。个人时间表、去重记录和邮箱数据不上传 GitHub。

## 项目结构

```text
src/
  app.ts              组装邮箱后端、状态存储和业务服务
  cli/                MCP 启动、连接检查、自动化只读入口
  mcp/                工具注册、参数校验
  mail/               草稿与发送规则、IMAP/SMTP、解析和分页
  storage/            原子写入与操作锁
  config/             环境变量、项目路径和数据路径
scripts/
  windows/            安装、卸载、ZIP 打包辅助
  build.mjs           清理旧构建产物并编译
  package.mjs         准备包含生产依赖的安装包
skills/qq-mail/       Codex 使用说明
tests/              unit、integration 和共享测试辅助
docs/               架构、自动化与验证说明
```

`plugin.json`、`mcp.json`、`package.json` 保留在根目录供宿主识别。`dist/`、`node_modules/`、`work/`、凭据和运行时状态均被 Git 忽略；建议在 IDE 中排除这三个生成目录。

## 开发与打包

| 命令 | 作用 |
| --- | --- |
| `npm run build` | 清理 `dist/` 后编译 TypeScript |
| `npm test` | 构建并运行全部单元、集成测试 |
| `npm start` | 启动 MCP stdio 服务，stdout 仅承载协议消息 |
| `npm run check` | 验证 IMAP 和 SMTP |
| `npm run read-mail -- <请求文件>` | 调用只读 MCP 工具 |
| `npm run package` | 构建安装目录和 ZIP，写入 `work/packages/` |

依赖及传递依赖由 `package-lock.json` 固定。打包会安装生产依赖，因此首次打包需要 npm 网络访问。安装包不包含 `.git`、开发缓存、运行数据或环境变量值。

更详细的模块边界见 [架构说明](docs/architecture.md)，验证范围见 [验证说明](docs/validation.md)。

## 本机数据与卸载

授权码仅从环境变量读取，不写入凭据文件、日志或聊天。账户状态继续保存在 `%LOCALAPPDATA%\QQMailCodex\<账户哈希>\state.json`；0.3.0 保持旧版目录、哈希及状态版本，已有发送防重复记录继续生效。

安装副本保存在 `$CODEX_HOME\qq-mail-marketplace\plugins\qq-mail-<版本>`；未设置 `CODEX_HOME` 时使用 `%USERPROFILE%\.codex`。Codex 另会创建自己的插件缓存。更改源码后需重新构建和安装，重启 Codex 后生效。

打开 `uninstall.cmd` 移除插件及目录注册。它保留源码、运行时副本和发送记录；用户环境变量由你自行管理。旧 `configure.cmd`、`check-connection.cmd`、`disconnect.cmd` 在 0.3.x 作为兼容入口保留，日常操作优先使用 npm 命令。

如进程中断留下 `operation.lock`，先关闭相关插件进程并核实邮件发送结果，再只移除对应账户目录中的锁文件。不要删除 `state.json` 来绕过重复发送保护。
