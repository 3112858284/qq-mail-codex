export type MessageRef = { folder: string; uidValidity: string; uid: number };
export type Address = { name: string; address: string };
export type Mail = {
  ref: MessageRef; from: Address[]; replyTo: Address[]; to: Address[]; cc: Address[]; bcc: Address[];
  subject: string; text: string; date: string | null; messageId: string;
  inReplyTo?: string; references: string[]; attachments: { name: string; size: number; contentType: string }[];
  flags: string[]; rawHash: string; bodyTruncated: boolean;
};
export type DraftInput = { to: string[]; cc?: string[]; bcc?: string[]; subject: string; text: string; replyToMessage?: MessageRef };
export type SearchInput = {
  folder?: string; from?: string; to?: string; subject?: string; text?: string;
  since?: string; before?: string; unread?: boolean; pageSize?: number; cursor?: string;
};
export type Outgoing = {
  from: string; to: string[]; cc: string[]; bcc: string[]; subject: string; text: string;
  messageId: string; inReplyTo?: string; references: string[];
};
export interface MailBackend {
  account: string;
  check(): Promise<unknown>;
  folders(): Promise<{ path: string; specialUse?: string; selectable: boolean }[]>;
  search(input: SearchInput): Promise<unknown>;
  get(ref: MessageRef): Promise<Mail>;
  appendDraft(mail: Outgoing): Promise<MessageRef>;
  deleteDraft(ref: MessageRef): Promise<void>;
  send(mail: Outgoing): Promise<{ accepted: string[]; rejected: string[]; messageId: string }>;
}
