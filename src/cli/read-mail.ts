import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { isMain, projectRoot, runtimePath } from '../config/paths.js';
import { MailError, safeError } from '../errors.js';

export type ReadRequest = { tool: string; arguments?: Record<string, unknown> };
const allowed = new Set(['check_connection', 'list_folders', 'search_messages', 'get_message']);
export async function executeReadRequest(client: Pick<Client, 'callTool'>, request: ReadRequest) {
  if (!request || !allowed.has(request.tool)) throw new MailError('READ_ONLY_TOOL_REQUIRED', '只读入口仅允许连接检查、文件夹列表、邮件搜索和读取。');
  return client.callTool({ name: request.tool, arguments: request.arguments ?? {} });
}
export async function main(requestPath?: string) {
  const client = new Client({ name: 'qq-mail-digest-reader', version: '1.0.0' });
  const env = Object.fromEntries(['QQ_MAIL_ADDRESS', 'QQ_MAIL_AUTH_CODE', 'LOCALAPPDATA', 'SystemRoot', 'PATH', 'USERPROFILE'].filter(k => process.env[k] !== undefined).map(k => [k, process.env[k]!])) as Record<string, string>;
  const transport = new StdioClientTransport({ command: process.execPath, args: [runtimePath('cli/serve.js')], cwd: projectRoot, env, stderr: 'pipe' });
  transport.stderr?.on('data', () => undefined);
  try {
    let request: ReadRequest = { tool: 'check_connection', arguments: {} };
    if (requestPath) {
      try { request = JSON.parse(await readFile(requestPath, 'utf8')); }
      catch { throw new MailError('INVALID_REQUEST', '无法读取 JSON 请求文件，请检查文件路径和格式。'); }
    }
    // Validate the allowlist before starting an MCP process.
    if (!request || !allowed.has(request.tool)) throw new MailError('READ_ONLY_TOOL_REQUIRED', '此入口不允许发送、起草或修改邮件。');
    await client.connect(transport);
    const result = await executeReadRequest(client, request);
    console.log(JSON.stringify({ ok: !result.isError, data: result.structuredContent ?? { message: result.content } }));
    if (result.isError) process.exitCode = 1;
  } catch (e) {
    console.log(JSON.stringify({ ok: false, data: safeError(e) }));
    process.exitCode = 1;
  } finally { await client.close(); }
}
if (isMain(import.meta.url)) await main(process.argv[2]);
