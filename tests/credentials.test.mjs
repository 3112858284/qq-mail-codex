import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadCredentials } from '../dist/credentials.js';
import { safeError } from '../dist/errors.js';
import { fixture } from './helpers.mjs';

test('credentials read exclusively from named environment variables, with surrounding whitespace trimmed', async () => {
  const env = { QQ_MAIL_ADDRESS: ' 123@QQ.COM ', QQ_MAIL_AUTH_CODE: ' synthetic-test-code ' };
  const credentials = await loadCredentials(env);
  assert.deepEqual(credentials, { account: '123@qq.com', authorizationCode: 'synthetic-test-code' });
  assert.equal(env.QQ_MAIL_AUTH_CODE, ' synthetic-test-code ');
  assert.equal((await loadCredentials({ QQ_MAIL_ADDRESS: 'alias@foxmail.com', QQ_MAIL_AUTH_CODE: 'synthetic' })).account, 'alias@foxmail.com');
});
test('both missing variables are named without printing credential values', async () => {
  await assert.rejects(() => loadCredentials({}), e => e.code === 'NOT_CONFIGURED' && e.message.includes('QQ_MAIL_ADDRESS') && e.message.includes('QQ_MAIL_AUTH_CODE'));
  await assert.rejects(() => loadCredentials({ QQ_MAIL_ADDRESS: '123@qq.com' }), e => e.code === 'NOT_CONFIGURED' && e.message.includes('QQ_MAIL_AUTH_CODE'));
  await assert.rejects(() => loadCredentials({ QQ_MAIL_AUTH_CODE: 'synthetic' }), e => e.code === 'NOT_CONFIGURED' && e.message.includes('QQ_MAIL_ADDRESS') && !e.message.includes('synthetic'));
  await assert.rejects(() => loadCredentials({ QQ_MAIL_ADDRESS: '   ', QQ_MAIL_AUTH_CODE: '  ' }), { code: 'NOT_CONFIGURED' });
});
test('invalid addresses and authorization codes produce safe errors', async () => {
  for (const account of ['123@gmail.com', '123', '123@qq.com\r\nX-injection: test']) {
    await assert.rejects(() => loadCredentials({ QQ_MAIL_ADDRESS: account, QQ_MAIL_AUTH_CODE: 'synthetic' }), { code: 'INVALID_ACCOUNT' });
  }
  for (const code of ['abc def', 'abc\r\ndef', 'abc\0def', 'x'.repeat(1025)]) {
    await assert.rejects(() => loadCredentials({ QQ_MAIL_ADDRESS: '123@qq.com', QQ_MAIL_AUTH_CODE: code }), e => e.code === 'INVALID_AUTH_CODE' && !JSON.stringify(safeError(e)).includes(code));
  }
});
test('legacy DPAPI credential file is ignored instead of falling back to stored credentials', async t => {
  const { dir } = await fixture(t);
  await mkdir(join(dir, 'QQMailCodex'));
  await writeFile(join(dir, 'QQMailCodex/mail.credential.xml'), 'legacy-synthetic-data');
  await assert.rejects(() => loadCredentials({ LOCALAPPDATA: dir }), { code: 'NOT_CONFIGURED' });
  const c = await loadCredentials({ LOCALAPPDATA: dir, QQ_MAIL_ADDRESS: '123@qq.com', QQ_MAIL_AUTH_CODE: 'environment-only' });
  assert.equal(c.authorizationCode, 'environment-only');
});
test('production loader reads current process environment without modifying or persisting it', async () => {
  const previous = { address: process.env.QQ_MAIL_ADDRESS, code: process.env.QQ_MAIL_AUTH_CODE };
  try {
    process.env.QQ_MAIL_ADDRESS = '123@qq.com'; process.env.QQ_MAIL_AUTH_CODE = 'synthetic-process-code';
    assert.equal((await loadCredentials()).authorizationCode, 'synthetic-process-code');
  } finally {
    if (previous.address === undefined) delete process.env.QQ_MAIL_ADDRESS; else process.env.QQ_MAIL_ADDRESS = previous.address;
    if (previous.code === undefined) delete process.env.QQ_MAIL_AUTH_CODE; else process.env.QQ_MAIL_AUTH_CODE = previous.code;
  }
});
