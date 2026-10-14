import test from 'node:test';
import assert from 'node:assert/strict';
import { safeError } from '../../dist/errors.js';

test('provider auth/network/service-off errors never expose authorization payloads', () => {
  for (const e of [Object.assign(new Error('secret AUTH payload'), { code: 'EAUTH' }), Object.assign(new Error('secret'), { authenticationFailed: true })]) assert.equal(safeError(e).code, 'AUTH_FAILED');
  for (const code of ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET']) assert.equal(safeError({ code, message: 'secret' }).code, 'NETWORK_ERROR');
  assert.equal(JSON.stringify(safeError(new Error('secret'))).includes('secret'), false);
});
