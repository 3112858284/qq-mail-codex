import test from 'node:test';
import assert from 'node:assert/strict';
import { refKey } from '../../dist/mail/identity.js';
import { fixture, input, draftPreview } from '../support/helpers.mjs';

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
  const { MailService } = await import('../../dist/mail/service.js'); const restarted = new MailService(backend, store);
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
