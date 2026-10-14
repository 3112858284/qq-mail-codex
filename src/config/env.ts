import { MailError } from '../errors.js';

export async function loadCredentials(environment: NodeJS.ProcessEnv = process.env): Promise<{ account: string; authorizationCode: string }> {
  const account = environment.QQ_MAIL_ADDRESS?.trim().toLowerCase();
  const authorizationCode = environment.QQ_MAIL_AUTH_CODE?.trim();
  const missing = [!account && 'QQ_MAIL_ADDRESS', !authorizationCode && 'QQ_MAIL_AUTH_CODE'].filter(Boolean);
  if (missing.length) {
    throw new MailError('NOT_CONFIGURED', `缺少环境变量：${missing.join('、')}。请在 Windows 用户环境变量中设置，并完全退出后重新打开 Codex。不要将授权码发送到聊天。`);
  }
  if (!/^[^\s@]+@(qq\.com|foxmail\.com)$/i.test(account!)) {
    throw new MailError('INVALID_ACCOUNT', 'QQ_MAIL_ADDRESS 必须是完整的个人 QQ 邮箱地址（@qq.com 或 @foxmail.com）。');
  }
  if (/\s|\p{Cc}/u.test(authorizationCode!) || authorizationCode!.length > 1024) {
    throw new MailError('INVALID_AUTH_CODE', 'QQ_MAIL_AUTH_CODE 格式无效，请检查授权码是否包含内部空格或控制字符。');
  }
  return { account: account!, authorizationCode: authorizationCode! };
}
