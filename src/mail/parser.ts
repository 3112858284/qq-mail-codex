import { simpleParser, type ParsedMail, type AddressObject } from 'mailparser';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type { Mail, MessageRef, Address } from './types.js';

const MAX_BODY = 512 * 1024;
const htmlToText = createRequire(import.meta.url)('html-to-text').convert as (html: string, options?: Record<string, unknown>) => string;
const addresses = (input: AddressObject | AddressObject[] | undefined): Address[] =>
  (Array.isArray(input) ? input : input ? [input] : []).flatMap(a => a.value)
    .filter(a => a.address).map(a => ({ name: a.name ?? '', address: a.address! }));
export async function parseMessage(source: Buffer, ref: MessageRef, flags: string[] = []): Promise<Mail> {
  const parsed: ParsedMail = await simpleParser(source, { keepCidLinks: true, skipImageLinks: true, skipTextToHtml: true, skipHtmlToText: true });
  const html = typeof parsed.html === 'string' ? parsed.html : '';
  const text = parsed.text || (html ? htmlToText(html.slice(0, MAX_BODY), { wordwrap: false }) : '');
  return {
    ref, from: addresses(parsed.from), replyTo: addresses(parsed.replyTo), to: addresses(parsed.to), cc: addresses(parsed.cc), bcc: addresses(parsed.bcc),
    subject: parsed.subject ?? '', text: text.slice(0, MAX_BODY), date: parsed.date?.toISOString() ?? null,
    messageId: parsed.messageId ?? '', inReplyTo: parsed.inReplyTo,
    references: Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : [],
    attachments: parsed.attachments.map(a => ({ name: a.filename ?? '', size: a.size, contentType: a.contentType })),
    flags, rawHash: createHash('sha256').update(source).digest('hex'), bodyTruncated: text.length > MAX_BODY || (!parsed.text && html.length > MAX_BODY),
  };
}
