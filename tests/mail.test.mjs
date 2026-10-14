import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { parseMessage, selectPage, searchQuery, QQBackend } from '../dist/backend.js';
import { safeError } from '../dist/errors.js';
import { refKey } from '../dist/state.js';
import { fixture, input, draftPreview } from './helpers.mjs';

test('Chinese MIME, HTML text and attachment metadata; Bcc retained in draft stream', async () => {
  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const result = await composer.sendMail({ from: '123@qq.com', to: '测试人 <reader@example.com>', bcc: 'hidden@example.com', subject: '中文主题', html: '<p>你好，世界。</p>', messageId: '<mime@example.com>', attachments: [{ filename: '报价.txt', content: '测试文件' }] });
  const parsed = await parseMessage(result.message, { folder: 'INBOX', uidValidity: '10', uid: 1 });
  assert.equal(parsed.subject, '中文主题'); assert.match(parsed.text, /你好，世界/);
  assert.equal(parsed.to[0].name, '测试人'); assert.equal(parsed.bcc[0].address, 'hidden@example.com');
  assert.equal(parsed.attachments[0].name, '报价.txt'); assert.equal(parsed.attachments[0].size, Buffer.byteLength('测试文件'));
  assert.equal(parsed.attachments[0].content, undefined);
});
test('search paging remains stable with new arrivals, empty results, and invalidated cursors', () => {
  const query = { subject: '报价', pageSize: 2 };
  const first = selectPage([1, 4, 2, 3], query, 'INBOX', '10'); assert.deepEqual(first.selected, [4, 3]);
  const second = selectPage([1, 2, 3, 4, 5], { ...query, cursor: first.nextCursor }, 'INBOX', '10'); assert.deepEqual(second.selected, [2, 1]); assert.equal(second.nextCursor, null);
  assert.equal(selectPage([], query, 'INBOX', '10').nextCursor, null);
  assert.throws(() => selectPage([1], { ...query, cursor: first.nextCursor }, 'INBOX', '11'), { code: 'CURSOR_INVALID' });
  assert.throws(() => selectPage([1], { ...query, subject: 'changed', cursor: first.nextCursor }, 'INBOX', '10'), { code: 'CURSOR_INVALID' });
});
test('search maps filters and dates without Gmail query syntax', () => {
  const q = searchQuery({ from: 'a@example.com', to: 'b@example.com', subject: '中文', text: '正文', unread: true, since: '2026-10-14', before: '2026-10-15' });
  assert.equal(q.body, '正文'); assert.equal(q.seen, false); assert.equal(q.since.toISOString(), '2026-10-14T00:00:00.000Z');
});
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
test('provider auth/network/service-off errors never expose authorization payloads', () => {
  for (const e of [Object.assign(new Error('secret AUTH payload'), { code: 'EAUTH' }), Object.assign(new Error('secret'), { authenticationFailed: true })]) assert.equal(safeError(e).code, 'AUTH_FAILED');
  for (const code of ['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET']) assert.equal(safeError({ code, message: 'secret' }).code, 'NETWORK_ERROR');
  assert.equal(JSON.stringify(safeError(new Error('secret'))).includes('secret'), false);
});
test('create and preview sync draft; only explicit confirmation sends all visible recipients', async t => {
  const { service, backend } = await fixture(t); const { created, preview } = await draftPreview(service);
  assert.equal(created.syncedToQQ, true); assert.equal(backend.sends.length, 0); assert.equal(preview.bcc[0].address, input.bcc[0]);
  await assert.rejects(() => service.sendDraft(created.draft, preview.previewToken, false), { code: 'CONFIRMATION_REQUIRED' });
  const result = await service.sendDraft(created.draft, preview.previewToken, true);
  assert.equal(result.smtpAccepted, true); assert.equal(result.deliveredToInbox, 'not_verified'); assert.equal(backend.sends.length, 1); assert.equal(backend.deleted.length, 1);
  assert.deepEqual(backend.sends[0].bcc, input.bcc);
  await assert.rejects(() => service.sendDraft(created.draft, preview.previewToken, true), { code: 'SEND_ALREADY_ATTEMPTED' });
});
test('external draft edit requires fresh preview and confirmation', async t => {
  const { service, backend } = await fixture(t); const { created, preview } = await draftPreview(service);
  backend.mails.get(refKey(created.draft)).text = 'externally edited';
  await assert.rejects(() => service.sendDraft(created.draft, preview.previewToken, true), { code: 'DRAFT_CHANGED' }); assert.equal(backend.sends.length, 0);
  const refreshed = await service.previewDraft(created.draft);
  await assert.rejects(() => service.sendDraft(created.draft, preview.previewToken, true), { code: 'PREVIEW_REQUIRED' });
  await service.sendDraft(created.draft, refreshed.previewToken, true); assert.equal(backend.sends[0].text, 'externally edited');
});
test('expired preview, replaced draft, sender mismatch, attachments and truncated body cannot send', async t => {
  const { service, backend, store } = await fixture(t); const { created, preview } = await draftPreview(service);
  const state = await store.read(); state.previews[preview.previewToken].expires = 0; await store.write(state);
  await assert.rejects(() => service.sendDraft(created.draft, preview.previewToken, true), { code: 'PREVIEW_REQUIRED' });
  const updated = await service.updateDraft(created.draft, { ...input, text: 'new body' });
  await assert.rejects(() => service.previewDraft(created.draft), { code: 'UNMANAGED_DRAFT' });
  const mail = backend.mails.get(refKey(updated.draft)); mail.from[0].address = 'other@qq.com';
  await assert.rejects(() => service.previewDraft(updated.draft), { code: 'DRAFT_SENDER_MISMATCH' }); mail.from[0].address = backend.account;
  mail.attachments.push({ name: 'x.txt', size: 1, contentType: 'text/plain' });
  await assert.rejects(() => service.previewDraft(updated.draft), { code: 'ATTACHMENTS_UNSUPPORTED' }); mail.attachments = []; mail.bodyTruncated = true;
  await assert.rejects(() => service.previewDraft(updated.draft), { code: 'DRAFT_TOO_LARGE' }); assert.equal(backend.sends.length, 0);
});
test('reply chooses Reply-To once and preserves linkage when updating', async t => {
  const { service, backend } = await fixture(t);
  const base = await service.createDraft(input); const mail = backend.mails.get(refKey(base.draft));
  mail.replyTo = [{ name: '', address: 'reply@example.com' }]; mail.from = [{ name: '', address: 'sender@example.com' }]; mail.references = ['<earlier@example.com>'];
  const reply = await service.createDraft({ to: [], subject: '', text: '回复', replyToMessage: base.draft });
  assert.deepEqual(backend.lastOutgoing.to, ['reply@example.com']); assert.equal(backend.lastOutgoing.subject, 'Re: 中文主题');
  assert.equal(backend.lastOutgoing.inReplyTo, mail.messageId); assert.deepEqual(backend.lastOutgoing.references, ['<earlier@example.com>', mail.messageId]);
  await service.updateDraft(reply.draft, { to: ['reply@example.com'], subject: 'Re: 中文主题', text: '新回复' }); assert.equal(backend.lastOutgoing.inReplyTo, mail.messageId);
});
test('uncertain SMTP result is durably blocked even in a new service instance', async t => {
  const { service, backend, store } = await fixture(t); const { created, preview } = await draftPreview(service);
  backend.failSend = Object.assign(new Error('secret AUTH'), { code: 'ECONNRESET' });
  await assert.rejects(() => service.sendDraft(created.draft, preview.previewToken, true), { code: 'SEND_UNCERTAIN' });
  assert.equal((await store.read()).sends[refKey(created.draft)].status, 'uncertain');
  const { MailService } = await import('../dist/service.js'); const restarted = new MailService(backend, store);
  await assert.rejects(() => restarted.previewDraft(created.draft), { code: 'SEND_ALREADY_ATTEMPTED' });
  await assert.rejects(() => restarted.updateDraft(created.draft, input), { code: 'SEND_ALREADY_ATTEMPTED' }); assert.equal(backend.sends.length, 1);
});
test('process-crash attempting marker blocks resending and corrupt state fails closed', async t => {
  const { service, store, dir } = await fixture(t); const { created, preview } = await draftPreview(service);
  const state = await store.read(); state.sends[refKey(created.draft)] = { status: 'attempting', time: '', messageId: '' }; await store.write(state);
  await assert.rejects(() => service.sendDraft(created.draft, preview.previewToken, true), { code: 'SEND_ALREADY_ATTEMPTED' });
  const { writeFile } = await import('node:fs/promises'); await writeFile(dir + '/state.json', 'corrupt');
  await assert.rejects(() => store.read(), { code: 'STATE_UNAVAILABLE' });
});
test('definite SMTP rejection allows retry only with a fresh preview', async t => {
  const { service, backend } = await fixture(t); const { created, preview } = await draftPreview(service);
  backend.failSend = Object.assign(new Error('secret'), { responseCode: 550 });
  await assert.rejects(() => service.sendDraft(created.draft, preview.previewToken, true), { code: 'SEND_REJECTED' }); backend.failSend = undefined;
  await assert.rejects(() => service.sendDraft(created.draft, preview.previewToken, true), { code: 'PREVIEW_REQUIRED' });
  const refreshed = await service.previewDraft(created.draft); await service.sendDraft(created.draft, refreshed.previewToken, true);
});
test('cleanup failure reports SMTP success and leaves durable duplicate protection', async t => {
  const { service, backend } = await fixture(t); const { created, preview } = await draftPreview(service); backend.failDelete = true;
  const sent = await service.sendDraft(created.draft, preview.previewToken, true); assert.equal(sent.smtpAccepted, true); assert.ok(sent.cleanupWarning);
  await assert.rejects(() => service.previewDraft(created.draft), { code: 'SEND_ALREADY_ATTEMPTED' });
});
test('partial acceptance is reported without allowing whole-message retry', async t => {
  const { service, backend } = await fixture(t); const { created, preview } = await draftPreview(service);
  backend.send = async mail => ({ messageId: mail.messageId, accepted: mail.to, rejected: mail.bcc });
  const result = await service.sendDraft(created.draft, preview.previewToken, true); assert.deepEqual(result.rejected, input.bcc);
  await assert.rejects(() => service.previewDraft(created.draft), { code: 'SEND_ALREADY_ATTEMPTED' });
});
test('malformed recipients, header injection and concurrent mutations are stopped', async t => {
  const { service, store } = await fixture(t);
  await assert.rejects(() => service.createDraft({ ...input, to: ['bad\r\nBcc: stolen@example.com'] }), { code: 'INVALID_RECIPIENT' });
  await assert.rejects(() => service.createDraft({ ...input, subject: 'bad\r\nBcc: stolen@example.com' }), { code: 'INVALID_CONTENT' });
  await store.locked(async () => { await assert.rejects(() => service.createDraft(input), { code: 'OPERATION_BUSY' }); });
});

test('record failure after SMTP acceptance still preserves attempting marker and prohibits retries', async t => {
  const { service, store, backend } = await fixture(t); const { created, preview } = await draftPreview(service);
  const write = store.write.bind(store); let writes = 0;
  store.write = async state => { if (++writes === 2) throw new Error('disk error'); return write(state); };
  await assert.rejects(() => service.sendDraft(created.draft, preview.previewToken, true), { code: 'SEND_RECORD_FAILED' });
  assert.equal(backend.sends.length, 1); assert.equal((await store.read()).sends[refKey(created.draft)].status, 'attempting');
  await assert.rejects(() => service.previewDraft(created.draft), { code: 'SEND_ALREADY_ATTEMPTED' });
});
