import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPage, searchQuery } from '../../dist/mail/search.js';

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
