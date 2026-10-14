import { createHash } from 'node:crypto';
import type { MessageRef, Mail } from './types.js';

export const refKey = (ref: MessageRef) => JSON.stringify([ref.folder, ref.uidValidity, ref.uid]);
export const snapshot = (mail: Mail) => createHash('sha256').update(JSON.stringify({
  from: mail.from, to: mail.to, cc: mail.cc, bcc: mail.bcc, subject: mail.subject, text: mail.text,
  messageId: mail.messageId, inReplyTo: mail.inReplyTo, references: mail.references, rawHash: mail.rawHash,
})).digest('hex');
