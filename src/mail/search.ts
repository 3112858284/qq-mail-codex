import { createHash } from 'node:crypto';
import { MailError } from '../errors.js';
import type { SearchInput } from './types.js';

export function searchQuery(input: SearchInput) {
  const q: Record<string, unknown> = { all: true };
  for (const key of ['from', 'to', 'subject'] as const) if (input[key]) q[key] = input[key];
  if (input.text) q.body = input.text;
  if (input.since) q.since = new Date(input.since + 'T00:00:00Z');
  if (input.before) q.before = new Date(input.before + 'T00:00:00Z');
  if (input.unread !== undefined) q.seen = !input.unread;
  return q;
}
const queryHash = (input: SearchInput) => createHash('sha256').update(JSON.stringify(searchQuery(input))).digest('hex');
export function selectPage(uids: number[], input: SearchInput, folder: string, uidValidity: string) {
  let upper = Infinity;
  if (input.cursor) {
    try {
      const c = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'));
      if (c.folder !== folder || c.uidValidity !== uidValidity || c.query !== queryHash(input) || !Number.isSafeInteger(c.lastUid) || c.lastUid < 1) throw new Error('invalid');
      upper = c.lastUid;
    } catch { throw new MailError('CURSOR_INVALID', '搜索游标已失效或搜索条件已改变，请从第一页重新搜索。'); }
  }
  const candidates = uids.filter(uid => uid < upper).sort((a, b) => b - a);
  const selected = candidates.slice(0, input.pageSize ?? 20);
  return {
    selected,
    nextCursor: candidates.length > selected.length ? Buffer.from(JSON.stringify({ folder, uidValidity, query: queryHash(input), lastUid: selected.at(-1) })).toString('base64url') : null,
  };
}
