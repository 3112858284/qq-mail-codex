import { z } from 'zod';

export const messageRefSchema = z.object({ folder: z.string().min(1).max(512), uidValidity: z.string().regex(/^[1-9]\d{0,30}$/), uid: z.number().int().positive().max(4294967295) });
const address = z.string().email().max(254).refine(s => !/[\r\n<>;,]/.test(s));
export const draftSchema = {
  to: z.array(address).max(50).default([]), cc: z.array(address).max(50).default([]), bcc: z.array(address).max(50).default([]),
  subject: z.string().max(998).refine(s => !/[\r\n]/.test(s)).default(''), text: z.string().max(512 * 1024), replyToMessage: messageRefSchema.optional(),
};
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(s); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; });
