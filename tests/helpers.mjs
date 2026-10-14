import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { StateStore, refKey } from '../dist/state.js';
import { MailService } from '../dist/service.js';
import { MailError } from '../dist/errors.js';

export const scratch = resolve(process.env.QQ_MAIL_TEST_ROOT ?? 'work/tests');
export class FakeBackend {
  account = '123456789@qq.com';
  mails = new Map(); uid = 1; sends = []; deleted = []; failSend; failDelete = false; lastOutgoing;
  async check() { return { connected: true, testEmailSent: false }; }
  async folders() { return [{ path: 'INBOX', selectable: true }, { path: 'Drafts', specialUse: '\\Drafts', selectable: true }]; }
  async search() { return { messages: [...this.mails.values()].map(m => ({ ref: m.ref, subject: m.subject })), nextCursor: null }; }
  async get(ref) {
    if (ref.uidValidity !== '10') throw new MailError('MESSAGE_REF_EXPIRED', '标识已失效。');
    const mail = this.mails.get(refKey(ref));
    if (!mail) throw new MailError('MESSAGE_NOT_FOUND', '邮件不存在。');
    return structuredClone(mail);
  }
  async appendDraft(outgoing) {
    this.lastOutgoing = structuredClone(outgoing);
    const ref = { folder: 'Drafts', uidValidity: '10', uid: this.uid++ };
    const address = a => ({ name: '', address: a });
    const mail = { ref, from: [address(outgoing.from)], replyTo: [], to: outgoing.to.map(address), cc: outgoing.cc.map(address), bcc: outgoing.bcc.map(address),
      subject: outgoing.subject, text: outgoing.text, date: null, messageId: outgoing.messageId, inReplyTo: outgoing.inReplyTo, references: outgoing.references,
      attachments: [], flags: ['\\Draft'], rawHash: createHash('sha256').update(JSON.stringify(outgoing)).digest('hex'), bodyTruncated: false };
    this.mails.set(refKey(ref), mail);
    return ref;
  }
  async deleteDraft(ref) { if (this.failDelete) throw new Error('hidden provider error'); this.deleted.push(ref); this.mails.delete(refKey(ref)); }
  async send(mail) {
    this.sends.push(structuredClone(mail));
    if (this.failSend) throw this.failSend;
    return { accepted: [...mail.to, ...mail.cc, ...mail.bcc], rejected: [], messageId: mail.messageId };
  }
}
export async function fixture(t) {
  const { mkdir } = await import('node:fs/promises'); await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(resolve(scratch, 'case-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const backend = new FakeBackend(); const store = new StateStore(dir); const service = new MailService(backend, store);
  return { backend, store, service, dir };
}
export const input = { to: ['receiver@example.com'], cc: ['copy@example.com'], bcc: ['hidden@example.com'], subject: '中文主题', text: '你好，测试正文。' };
export const draftPreview = async service => { const created = await service.createDraft(input); return { created, preview: await service.previewDraft(created.draft) }; };
