import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { parseMessage } from '../../dist/mail/parser.js';

test('Chinese MIME, HTML text and attachment metadata; Bcc retained in draft stream', async () => {
  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const result = await composer.sendMail({ from: '123@qq.com', to: '测试人 <reader@example.com>', bcc: 'hidden@example.com', subject: '中文主题', html: '<p>你好，世界。</p>', messageId: '<mime@example.com>', attachments: [{ filename: '报价.txt', content: '测试文件' }] });
  const parsed = await parseMessage(result.message, { folder: 'INBOX', uidValidity: '10', uid: 1 });
  assert.equal(parsed.subject, '中文主题'); assert.match(parsed.text, /你好，世界/);
  assert.equal(parsed.to[0].name, '测试人'); assert.equal(parsed.bcc[0].address, 'hidden@example.com');
  assert.equal(parsed.attachments[0].name, '报价.txt'); assert.equal(parsed.attachments[0].size, Buffer.byteLength('测试文件'));
  assert.equal(parsed.attachments[0].content, undefined);
});
