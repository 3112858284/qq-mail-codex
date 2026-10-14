export class MailError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

// Do not expose provider errors: some contain AUTH payloads or mail content.
export function safeError(error: unknown): { code: string; message: string } {
  if (error instanceof MailError) return { code: error.code, message: error.message };
  const e = error as { code?: string; authenticationFailed?: boolean; responseCode?: number };
  if (e?.authenticationFailed || e?.code === 'EAUTH' || e?.responseCode === 535) {
    return { code: 'AUTH_FAILED', message: '邮箱认证失败：请检查完整邮箱地址、授权码，以及 QQ 邮箱是否已开启 IMAP/SMTP 服务。' };
  }
  if (['ETIMEDOUT', 'ETIMEOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ESOCKET'].includes(e?.code ?? '')) {
    return { code: 'NETWORK_ERROR', message: '邮箱连接失败或超时：请检查网络及 IMAP/SMTP 服务是否开启。' };
  }
  return { code: 'MAIL_OPERATION_FAILED', message: '邮箱操作失败；未输出服务器原始信息以保护凭据。请检查连接状态后再试。' };
}
