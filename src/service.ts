import { randomUUID } from 'node:crypto';
import { MailError, safeError } from './errors.js';
import { StateStore, refKey, snapshot } from './state.js';
import type { MessageRef, DraftInput, MailBackend, Mail, Outgoing } from './types.js';

const MAX_TEXT = 512 * 1024;
const validAddress = (address: string) => /^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/.test(address) && address.length <= 254;
export function validateOutgoing(mail: Outgoing) {
  if (!mail.to.length || mail.to.length + mail.cc.length + mail.bcc.length > 50 ||
      ![mail.from, ...mail.to, ...mail.cc, ...mail.bcc].every(validAddress)) throw new MailError('INVALID_RECIPIENT', '请提供有效邮箱地址；收件人总数最多为 50。');
  if (/[\r\n]/.test(mail.subject) || mail.subject.length > 998 || mail.text.length > MAX_TEXT) throw new MailError('INVALID_CONTENT', '主题不得包含换行且最多 998 字符，正文最多 512 KB 字符。');
  for (const id of [mail.messageId, mail.inReplyTo, ...mail.references].filter(Boolean)) {
    if (!/^<[^\s<>]+>$/.test(id!) || id!.length > 998) throw new MailError('INVALID_REPLY_HEADERS', '邮件关联头格式异常，无法安全起草或发送回复。');
  }
}

export class MailService {
  constructor(public backend: MailBackend, public store: StateStore) {}
  private async outgoing(input: DraftInput): Promise<Outgoing> {
    const original = input.replyToMessage ? await this.backend.get(input.replyToMessage) : undefined;
    const recipients = input.to.length ? input.to : (original?.replyTo.length ? original.replyTo : original?.from ?? []).map(a => a.address).slice(0, 1);
    const outgoing: Outgoing = {
      from: this.backend.account, to: recipients, cc: input.cc ?? [], bcc: input.bcc ?? [],
      subject: input.subject || (original ? /^re:/i.test(original.subject) ? original.subject : `Re: ${original.subject}` : ''),
      text: input.text, messageId: `<${randomUUID()}@qq-mail-codex.local>`,
      inReplyTo: original?.messageId || undefined,
      references: original?.messageId ? [...original.references, original.messageId] : [],
    };
    validateOutgoing(outgoing);
    return outgoing;
  }
  private checkDraft(mail: Mail) {
    if (mail.from.length !== 1 || mail.from[0]!.address.toLowerCase() !== this.backend.account.toLowerCase()) throw new MailError('DRAFT_SENDER_MISMATCH', '草稿发件人不是当前邮箱，请重新起草。');
    if (mail.attachments.length) throw new MailError('ATTACHMENTS_UNSUPPORTED', '第一版不发送带附件的草稿，请在 QQ 邮箱发送。');
    if (mail.bodyTruncated) throw new MailError('DRAFT_TOO_LARGE', '草稿正文超出读取上限，不能完整预览和发送。');
    validateOutgoing(this.fromMail(mail));
  }
  private fromMail(mail: Mail): Outgoing {
    return { from: this.backend.account, to: mail.to.map(a => a.address), cc: mail.cc.map(a => a.address), bcc: mail.bcc.map(a => a.address),
      subject: mail.subject, text: mail.text, messageId: mail.messageId, inReplyTo: mail.inReplyTo, references: mail.references };
  }
  async createDraft(input: DraftInput) {
    return this.store.locked(async () => {
      const state = await this.store.read();
      const mail = await this.outgoing(input);
      const ref = await this.backend.appendDraft(mail);
      state.drafts[refKey(ref)] = true;
      try { await this.store.write(state); }
      catch { throw new MailError('DRAFT_SYNC_UNCERTAIN', '草稿已保存到 QQ 邮箱，但本机跟踪记录写入失败。请在 QQ 草稿箱检查，不要重复创建。'); }
      return { draft: ref, syncedToQQ: true, message: '草稿已同步到 QQ 邮箱。请先预览，再确认发送。' };
    });
  }
  async updateDraft(ref: MessageRef, input: DraftInput) {
    return this.store.locked(async () => {
      const state = await this.store.read();
      const key = refKey(ref);
      if (!state.drafts[key]) throw new MailError('UNMANAGED_DRAFT', '仅能更新本插件创建的草稿。');
      if (state.sends[key] && state.sends[key]!.status !== 'rejected') throw new MailError('SEND_ALREADY_ATTEMPTED', '此草稿已发送或发送结果不明，不能更新后重发。');
      const old = await this.backend.get(ref);
      this.checkDraft(old);
      const mail = await this.outgoing(input);
      if (!input.replyToMessage) { mail.inReplyTo = old.inReplyTo; mail.references = old.references; validateOutgoing(mail); }
      const replacement = await this.backend.appendDraft(mail);
      state.drafts[refKey(replacement)] = true;
      delete state.drafts[key];
      for (const [token, preview] of Object.entries(state.previews)) if (refKey(preview.ref) === key) delete state.previews[token];
      try { await this.store.write(state); }
      catch { throw new MailError('DRAFT_SYNC_UNCERTAIN', '新草稿已保存到 QQ 邮箱，但本机跟踪记录写入失败。旧草稿保留，请在 QQ 草稿箱检查，不要重复更新。'); }
      let cleanupWarning;
      try { await this.backend.deleteDraft(ref); } catch (e) { cleanupWarning = safeError(e).message; }
      return { draft: replacement, syncedToQQ: true, cleanupWarning, message: '新草稿已保存；请重新预览。旧草稿清理失败时会保留在 QQ 邮箱。' };
    });
  }
  async previewDraft(ref: MessageRef) {
    return this.store.locked(async () => {
      const state = await this.store.read();
      const key = refKey(ref);
      if (!state.drafts[key]) throw new MailError('UNMANAGED_DRAFT', '仅能发送本插件创建并跟踪的草稿。');
      if (state.sends[key] && state.sends[key]!.status !== 'rejected') throw new MailError('SEND_ALREADY_ATTEMPTED', '此草稿已发送或发送结果不明。请检查 QQ 已发送邮件，勿重复发送。');
      const mail = await this.backend.get(ref);
      this.checkDraft(mail);
      const token = randomUUID();
      const now = Date.now();
      for (const [id, p] of Object.entries(state.previews)) if (p.expires < now || refKey(p.ref) === key) delete state.previews[id];
      state.previews[token] = { ref, hash: snapshot(mail), expires: now + 30 * 60 * 1000 };
      await this.store.write(state);
      return { draft: ref, previewToken: token, expiresInMinutes: 30, from: mail.from, to: mail.to, cc: mail.cc, bcc: mail.bcc,
        subject: mail.subject, text: mail.text, contentTrust: 'external_email', requiresExplicitUserConfirmation: true,
        message: '请向用户完整展示所有收件人、主题和正文。收到针对这次预览的明确确认后，才能发送。' };
    });
  }
  async sendDraft(ref: MessageRef, previewToken: string, userConfirmed: boolean) {
    if (!userConfirmed) throw new MailError('CONFIRMATION_REQUIRED', '请先展示草稿并取得用户明确确认。');
    return this.store.locked(async () => {
      const state = await this.store.read();
      const key = refKey(ref);
      if (!state.drafts[key]) throw new MailError('UNMANAGED_DRAFT', '草稿不属于本插件。');
      const previous = state.sends[key];
      if (previous && previous.status !== 'rejected') throw new MailError('SEND_ALREADY_ATTEMPTED', '此草稿已发送或发送结果不明，已阻止重复发送。请检查 QQ 已发送邮件。');
      const preview = state.previews[previewToken];
      if (!preview || refKey(preview.ref) !== key || preview.expires < Date.now()) throw new MailError('PREVIEW_REQUIRED', '草稿预览不存在或已过期，请重新预览并确认。');
      const mail = await this.backend.get(ref);
      this.checkDraft(mail);
      if (snapshot(mail) !== preview.hash) throw new MailError('DRAFT_CHANGED', '草稿内容已修改，请重新预览并确认后发送。');
      const outgoing = this.fromMail(mail);
      delete state.previews[previewToken];
      state.sends[key] = { status: 'attempting', messageId: outgoing.messageId, time: new Date().toISOString() };
      // Durable marker BEFORE SMTP; a process crash must not allow automatic retry.
      await this.store.write(state);
      let result;
      try { result = await this.backend.send(outgoing); }
      catch (e) {
        const provider = e as { code?: string; responseCode?: number };
        const definite = provider.code === 'EAUTH' || (provider.responseCode !== undefined && provider.responseCode >= 400 && provider.responseCode < 600);
        state.sends[key]!.status = definite ? 'rejected' : 'uncertain';
        try { await this.store.write(state); }
        catch { throw new MailError('SEND_RECORD_FAILED', '发送尝试已发生，但本机状态更新失败。已保留发送尝试标记；请勿重发，先检查 QQ 邮箱发送结果。'); }
        if (definite) throw new MailError('SEND_REJECTED', 'SMTP 服务器明确拒绝了发送。请检查认证或收件人，重新预览并确认后再试。');
        throw new MailError('SEND_UNCERTAIN', '发送连接中断，结果不明。已禁止自动重试；请先在 QQ 邮箱检查已发送邮件及收件情况。');
      }
      if (!result.accepted.length) {
        state.sends[key]!.status = 'rejected'; await this.store.write(state);
        throw new MailError('SEND_REJECTED', '服务器未接受任何收件人，请检查收件人后重新预览。');
      }
      state.sends[key] = { status: 'sent', messageId: result.messageId, time: new Date().toISOString(), accepted: result.accepted, rejected: result.rejected };
      try { await this.store.write(state); }
      catch { throw new MailError('SEND_RECORD_FAILED', 'SMTP 已接受邮件，但本机发送记录更新失败。已保留发送尝试标记；请勿重发，先检查 QQ 已发送邮件。'); }
      let cleanupWarning;
      try { await this.backend.deleteDraft(ref); } catch (e) { cleanupWarning = safeError(e).message; }
      return { smtpAccepted: true, deliveredToInbox: 'not_verified', ...result, cleanupWarning,
        message: result.rejected.length ? '部分收件人被拒绝；其他收件人已由 SMTP 接受。不要整封重发。' : 'SMTP 已接受邮件；实际到达收件箱尚未验证。' };
    });
  }
}
