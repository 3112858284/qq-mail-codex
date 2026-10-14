import test from 'node:test';
import assert from 'node:assert/strict';
import { QQBackend } from '../../dist/mail/qq-backend.js';

test('live adapter opens mailbox read-only, uses UID/PEEK and rejects expired IDs', async () => {
  const client = { mailbox: { uidValidity: 10n }, connect: async () => {}, logout: async () => {}, close() {},
    getMailboxLock: async (folder, options) => { assert.equal(folder, 'INBOX'); assert.equal(options.readOnly, true); return { release() {} }; },
    fetchOne: async (uid, options, range) => { assert.equal(uid, 1); assert.equal(range.uid, true); assert.equal(options.markSeen, undefined);
      return options.source ? { source: Buffer.from('From: a@example.com\r\nTo: b@example.com\r\nSubject: Hello\r\n\r\nbody'), flags: new Set() } : { size: 100 }; },
  };
  const backend = new QQBackend('123@qq.com', 'synthetic-test'); backend.client = () => client;
  const mail = await backend.get({ folder: 'INBOX', uidValidity: '10', uid: 1 }); assert.equal(mail.text, 'body');
  await assert.rejects(() => backend.get({ folder: 'INBOX', uidValidity: '11', uid: 1 }), { code: 'MESSAGE_REF_EXPIRED' });
});
test('missing draft special-use marker prevents guessed append; cleanup requires UIDPLUS', async () => {
  const backend = new QQBackend('123@qq.com', 'synthetic-test'); backend.folders = async () => [{ path: 'Drafts', selectable: true }];
  await assert.rejects(() => backend.appendDraft({}), { code: 'DRAFTS_FOLDER_UNAVAILABLE' });
  backend.folders = async () => [{ path: 'Drafts', specialUse: '\\Drafts', selectable: true }];
  backend.inFolder = async (_, __, action) => action({ capabilities: new Map(), messageDelete: () => assert.fail('must not expunge') }, '10');
  await assert.rejects(() => backend.deleteDraft({ folder: 'Drafts', uidValidity: '10', uid: 1 }), { code: 'DRAFT_CLEANUP_UNSUPPORTED' });
});
test('connection check verifies login without sending a message', async () => {
  const backend = new QQBackend('123@qq.com', 'synthetic-test'); let checks = 0;
  backend.connected = async action => action({}); backend.transport = () => ({ verify: async () => { checks++; }, close() {}, sendMail: () => assert.fail('must not send') });
  const result = await backend.check(); assert.equal(checks, 1); assert.equal(result.testEmailSent, false);
});
