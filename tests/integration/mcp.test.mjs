import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { buildServer } from '../../dist/mcp/server.js';
import { fixture } from '../support/helpers.mjs';

test('official MCP client lists and invokes real tool schemas over transport', async t => {
  const { service } = await fixture(t); const server = buildServer(async () => service);
  const client = new Client({ name: 'test-client', version: '1' }); const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a); await client.connect(b); t.after(async () => { await client.close(); await server.close(); });
  const { tools } = await client.listTools(); assert.equal(tools.length, 8);
  assert.equal(tools.find(t => t.name === 'send_draft').annotations.destructiveHint, true);
  const checked = await client.callTool({ name: 'check_connection', arguments: {} }); assert.equal(checked.structuredContent.testEmailSent, false);
  const created = await client.callTool({ name: 'create_draft', arguments: { to: ['receiver@example.com'], subject: '中文', text: '正文' } }); assert.equal(created.isError, undefined);
  const ref = created.structuredContent.draft;
  const preview = await client.callTool({ name: 'preview_draft', arguments: { draft: ref } }); assert.equal(preview.structuredContent.subject, '中文');
  const denied = await client.callTool({ name: 'send_draft', arguments: { draft: ref, previewToken: preview.structuredContent.previewToken, userConfirmed: false } }); assert.equal(denied.isError, true);
  const badDate = await client.callTool({ name: 'search_messages', arguments: { since: '2026-02-30' } }); assert.equal(badDate.isError, true);
  const missing = await client.callTool({ name: 'get_message', arguments: { message: { folder: 'INBOX', uidValidity: '11', uid: 2 } } }); assert.equal(missing.structuredContent.code, 'MESSAGE_REF_EXPIRED');
});
test('production stdio server starts cleanly and returns NOT_CONFIGURED without credentials', async t => {
  const { dir } = await fixture(t);
  const client = new Client({ name: 'stdio-test', version: '1' });
  const env = { ...process.env, LOCALAPPDATA: dir };
  delete env.QQ_MAIL_ADDRESS; delete env.QQ_MAIL_AUTH_CODE;
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(process.cwd(), 'dist/cli/serve.js')], env, stderr: 'pipe' });
  let stderr = ''; transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  await client.connect(transport); t.after(() => client.close());
  const result = await client.callTool({ name: 'check_connection', arguments: {} });
  assert.equal(result.isError, true); assert.equal(result.structuredContent.code, 'NOT_CONFIGURED'); assert.equal(stderr, '');
});

test('production stdio server reads forwarded variables and redacts them on validation failure', async t => {
  const { dir } = await fixture(t);
  const client = new Client({ name: 'env-stdio-test', version: '1' });
  const transport = new StdioClientTransport({ command: process.execPath, args: [join(process.cwd(), 'dist/cli/serve.js')], env: {
    ...process.env, LOCALAPPDATA: dir, QQ_MAIL_ADDRESS: 'invalid-synthetic-account', QQ_MAIL_AUTH_CODE: 'synthetic-env-secret',
  }, stderr: 'pipe' });
  let stderr = ''; transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });
  await client.connect(transport); t.after(() => client.close());
  // Invalid address is rejected before creating a network connection.
  const result = await client.callTool({ name: 'check_connection', arguments: {} });
  assert.equal(result.structuredContent.code, 'INVALID_ACCOUNT');
  assert.equal(JSON.stringify(result).includes('synthetic-env-secret'), false);
  assert.equal(JSON.stringify(result).includes('invalid-synthetic-account'), false);
  assert.equal(stderr, '');
});
