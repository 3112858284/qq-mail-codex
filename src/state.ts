import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { MailError } from './errors.js';
import type { MessageRef, Mail } from './types.js';

export const refKey = (ref: MessageRef) => JSON.stringify([ref.folder, ref.uidValidity, ref.uid]);
export const accountKey = (account: string) => createHash('sha256').update(account.toLowerCase()).digest('hex').slice(0, 24);
export const snapshot = (mail: Mail) => createHash('sha256').update(JSON.stringify({
  from: mail.from, to: mail.to, cc: mail.cc, bcc: mail.bcc, subject: mail.subject, text: mail.text,
  messageId: mail.messageId, inReplyTo: mail.inReplyTo, references: mail.references, rawHash: mail.rawHash,
})).digest('hex');
export type RecordEntry = { status: 'attempting' | 'sent' | 'uncertain' | 'rejected'; messageId: string; time: string; accepted?: string[]; rejected?: string[] };
export type State = {
  version: 1; drafts: Record<string, true>;
  previews: Record<string, { ref: MessageRef; hash: string; expires: number }>;
  sends: Record<string, RecordEntry>;
};
const empty = (): State => ({ version: 1, drafts: {}, previews: {}, sends: {} });
export class StateStore {
  constructor(public directory: string) {}
  async read(): Promise<State> {
    try {
      const state = JSON.parse(await readFile(join(this.directory, 'state.json'), 'utf8'));
      if (state.version !== 1 || !state.drafts || !state.previews || !state.sends) throw new Error('invalid');
      return state;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return empty();
      throw new MailError('STATE_UNAVAILABLE', '本机草稿状态不可读取；为避免重复发送已暂停操作。请保留状态文件后排查。');
    }
  }
  async write(state: State): Promise<void> {
    await mkdir(this.directory, { recursive: true });
    const temp = join(this.directory, `state-${randomUUID()}.tmp`);
    try {
      const handle = await open(temp, 'wx');
      try { await handle.writeFile(JSON.stringify(state), 'utf8'); await handle.sync(); } finally { await handle.close(); }
      await rename(temp, join(this.directory, 'state.json'));
    } finally { await unlink(temp).catch(() => undefined); }
  }
  async locked<T>(action: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true });
    const path = join(this.directory, 'operation.lock');
    let handle;
    try { handle = await open(path, 'wx'); }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'EEXIST') throw new MailError('OPERATION_BUSY', '另一个邮箱修改操作正在执行，或上次操作被中断。请稍后重试；中断时先检查发送结果，再按说明清理锁。');
      throw e;
    }
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
      return await action();
    } finally { await handle.close(); await unlink(path); }
  }
}
