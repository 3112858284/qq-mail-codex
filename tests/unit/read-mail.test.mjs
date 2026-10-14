import test from 'node:test';
import assert from 'node:assert/strict';
import { executeReadRequest } from '../../dist/cli/read-mail.js';
import { createService } from '../../dist/app.js';
import { fixture } from '../support/helpers.mjs';

test('read-only automation entry blocks every write tool before dispatch', async () => {
  const client = { callTool: () => assert.fail('Write requests must not reach MCP') };
  for (const tool of ['create_draft', 'update_draft', 'preview_draft', 'send_draft', 'unknown']) {
    await assert.rejects(() => executeReadRequest(client, { tool }), { code: 'READ_ONLY_TOOL_REQUIRED' });
  }
});
test('read-only entry forwards only the requested read arguments', async () => {
  let dispatched;
  const client = { callTool: async request => { dispatched = request; return { structuredContent: { messages: [] } }; } };
  const args = { folder: 'INBOX', unread: true };
  await executeReadRequest(client, { tool: 'search_messages', arguments: args });
  assert.deepEqual(dispatched, { name: 'search_messages', arguments: args });
});
test('composition root accepts injected dependencies without reading mailbox credentials', async t => {
  const { backend, store } = await fixture(t);
  const service = await createService({ backend, store });
  assert.equal(service.backend, backend); assert.equal(service.store, store);
});
