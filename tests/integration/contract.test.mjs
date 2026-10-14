import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from '../../dist/mcp/server.js';

test('v0.3 tools retain the exact v0.2 names, argument schemas and approval hints', async t => {
  const baseline = JSON.parse(await readFile(new URL('../support/tool-contract.json', import.meta.url), 'utf8'));
  const server = buildServer(async () => { throw Error('Discovery must not create a mailbox connection'); });
  const client = new Client({ name: 'contract-regression', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(a); await client.connect(b);
  t.after(async () => { await client.close(); await server.close(); });
  const result = await client.listTools();
  assert.deepEqual(result.tools.map(({ name, inputSchema, annotations }) => ({ name, inputSchema, annotations })), baseline);
});
