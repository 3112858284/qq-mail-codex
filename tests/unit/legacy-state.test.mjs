import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { refKey, snapshot } from '../../dist/mail/identity.js';
import { accountKey } from '../../dist/config/paths.js';
import { fixture } from '../support/helpers.mjs';

test('v0.2 persisted state, account path and preview hashes retain duplicate-send protection', async t => {
  const legacy = JSON.parse(await readFile(new URL('../support/legacy-state.json', import.meta.url), 'utf8'));
  const { service, store, dir } = await fixture(t);
  assert.equal(accountKey(legacy.account), legacy.accountKey);
  assert.equal(refKey(legacy.mail.ref), legacy.key);
  assert.equal(snapshot(legacy.mail), legacy.hash);
  await writeFile(join(dir, 'state.json'), JSON.stringify(legacy.state));
  assert.deepEqual(await store.read(), legacy.state);
  await assert.rejects(() => service.previewDraft(legacy.mail.ref), { code: 'SEND_ALREADY_ATTEMPTED' });
});
