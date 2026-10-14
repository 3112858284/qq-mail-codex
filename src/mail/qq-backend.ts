import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import { MailError } from '../errors.js';
import { pluginVersion } from '../config/paths.js';
import { parseMessage } from './parser.js';
import { searchQuery, selectPage } from './search.js';
import type { MailBackend, MessageRef, Mail, Outgoing, SearchInput } from './types.js';

const MAX_SOURCE = 10 * 1024 * 1024;
export class QQBackend implements MailBackend {
  constructor(public account: string, private authorizationCode: string) {}
  private client() {
    const client = new ImapFlow({
      host: 'imap.qq.com', port: 993, secure: true,
      auth: { user: this.account, pass: this.authorizationCode },
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      logger: false, emitLogs: false,
      connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 45000,
      clientInfo: { name: 'QQ Mail Codex', version: pluginVersion },
    });
    // No raw protocol errors reach stdout/stderr or MCP results.
    client.on('error', () => undefined);
    return client;
  }
  private transport() {
    return nodemailer.createTransport({
      host: 'smtp.qq.com', port: 465, secure: true,
      auth: { user: this.account, pass: this.authorizationCode },
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
      connectionTimeout: 20000, greetingTimeout: 20000, socketTimeout: 45000,
      logger: false, debug: false, disableFileAccess: true, disableUrlAccess: true,
    });
  }
  private async connected<T>(action: (client: ImapFlow) => Promise<T>): Promise<T> {
    const client = this.client();
    try { await client.connect(); return await action(client); }
    finally { await client.logout().catch(() => { client.close(); }); }
  }
  private async inFolder<T>(folder: string, readOnly: boolean, action: (client: ImapFlow, validity: string) => Promise<T>): Promise<T> {
    return this.connected(async client => {
      const lock = await client.getMailboxLock(folder, { readOnly });
      try {
        if (!client.mailbox) throw new MailError('FOLDER_UNAVAILABLE', '无法打开邮箱文件夹。');
        return await action(client, client.mailbox.uidValidity.toString());
      } finally { lock.release(); }
    });
  }
  async check() {
    await this.connected(async () => undefined);
    const smtp = this.transport();
    try { await smtp.verify(); } finally { smtp.close(); }
    return { connected: true, account: this.account, imap: true, smtp: true, testEmailSent: false };
  }
  async folders() {
    return this.connected(async client => (await client.list()).map(f => ({ path: f.path, specialUse: f.specialUse, selectable: !f.flags.has('\\Noselect') })));
  }
  async search(input: SearchInput) {
    const folder = input.folder ?? 'INBOX';
    return this.inFolder(folder, true, async (client, validity) => {
      const uids = await client.search(searchQuery(input), { uid: true });
      const page = selectPage(uids || [], input, folder, validity);
      const messages = [];
      if (page.selected.length) {
        for await (const msg of client.fetch(page.selected, { uid: true, envelope: true, flags: true, size: true }, { uid: true })) {
          const e = msg.envelope;
          messages.push({ ref: { folder, uidValidity: validity, uid: msg.uid }, subject: e?.subject ?? '',
            from: e?.from ?? [], to: e?.to ?? [], date: e?.date ? new Date(e.date).toISOString() : null,
            unread: !msg.flags?.has('\\Seen'), size: msg.size ?? 0 });
        }
      }
      messages.sort((a, b) => b.ref.uid - a.ref.uid);
      return { messages, nextCursor: page.nextCursor, matchedCount: (uids || []).length, contentTrust: 'external_email' };
    });
  }
  async get(ref: MessageRef): Promise<Mail> {
    return this.inFolder(ref.folder, true, async (client, validity) => {
      if (validity !== ref.uidValidity) throw new MailError('MESSAGE_REF_EXPIRED', '邮箱标识已变化，请重新搜索获取邮件位置。');
      const metadata = await client.fetchOne(ref.uid, { size: true }, { uid: true });
      if (!metadata) throw new MailError('MESSAGE_NOT_FOUND', '邮件已移动或删除，请重新搜索。');
      if ((metadata.size ?? 0) > MAX_SOURCE) throw new MailError('MESSAGE_TOO_LARGE', '邮件超过 10 MB，请在 QQ 邮箱打开。第一版仅支持较小邮件的正文读取。');
      const fetched = await client.fetchOne(ref.uid, { source: true, flags: true }, { uid: true });
      if (!fetched || !fetched.source) throw new MailError('MESSAGE_NOT_FOUND', '邮件已移动或删除，请重新搜索。');
      if (fetched.source.length > MAX_SOURCE) throw new MailError('MESSAGE_TOO_LARGE', '邮件超过读取上限，请在 QQ 邮箱打开。');
      return parseMessage(fetched.source, ref, [...(fetched.flags ?? [])]);
    });
  }
  private async draftsFolder(): Promise<string> {
    const folders = await this.folders();
    const drafts = folders.filter(f => f.selectable && f.specialUse === '\\Drafts');
    if (drafts.length !== 1) throw new MailError('DRAFTS_FOLDER_UNAVAILABLE', 'QQ 邮箱未提供唯一的草稿箱特殊用途标记，无法可靠同步。请检查 IMAP 设置；插件不会猜测或创建草稿文件夹。');
    return drafts[0]!.path;
  }
  async appendDraft(mail: Outgoing): Promise<MessageRef> {
    const folder = await this.draftsFolder();
    const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'windows', disableFileAccess: true, disableUrlAccess: true });
    // Nodemailer's stream transport retains Bcc in the stored draft MIME.
    const composed = await composer.sendMail(mail);
    return this.inFolder(folder, false, async (client, validity) => {
      const result = await client.append(folder, composed.message as Buffer, ['\\Draft']);
      let uid = result && result.uid;
      if (!uid) {
        const matches = await client.search({ header: { 'Message-ID': mail.messageId } }, { uid: true });
        if (matches && matches.length === 1) uid = matches[0];
      }
      if (!uid) throw new MailError('DRAFT_SYNC_UNCERTAIN', '草稿可能已保存，但未能取得邮件标识。请在 QQ 草稿箱检查，不要直接重复创建。');
      return { folder, uidValidity: validity, uid };
    });
  }
  async deleteDraft(ref: MessageRef) {
    const folder = await this.draftsFolder();
    if (folder !== ref.folder) throw new MailError('NOT_A_DRAFT', '此邮件不在当前草稿箱，已停止清理。');
    await this.inFolder(folder, false, async (client, validity) => {
      if (validity !== ref.uidValidity) throw new MailError('MESSAGE_REF_EXPIRED', '草稿标识已变化，未执行删除。');
      if (!client.capabilities.has('UIDPLUS')) throw new MailError('DRAFT_CLEANUP_UNSUPPORTED', '服务器未提供 UIDPLUS；为避免清理其他邮件，草稿保留在 QQ 草稿箱，请手动删除。');
      if (!await client.messageDelete(ref.uid, { uid: true })) throw new MailError('DRAFT_CLEANUP_FAILED', '邮件发送或新草稿保存已完成，但旧草稿未能清理，请在 QQ 邮箱检查。');
    });
  }
  async send(mail: Outgoing) {
    const transport = this.transport();
    try {
      const result = await transport.sendMail(mail);
      return { accepted: result.accepted.map(String), rejected: result.rejected.map(String), messageId: result.messageId };
    } finally { transport.close(); }
  }
}
