import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MailError } from '../errors.js';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const pluginVersion: string = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')).version;
export const runtimePath = (...parts: string[]) => join(projectRoot, 'dist', ...parts);
export const accountKey = (account: string) => createHash('sha256').update(account.toLowerCase()).digest('hex').slice(0, 24);
export function dataDirectory(environment: NodeJS.ProcessEnv = process.env) {
  if (!environment.LOCALAPPDATA) throw new MailError('WINDOWS_REQUIRED', '本插件需要 Windows 本地用户环境。');
  return join(environment.LOCALAPPDATA, 'QQMailCodex');
}
export function isMain(url: string) {
  if (!process.argv[1]) return false;
  const own = fileURLToPath(url), entry = resolve(process.argv[1]);
  return process.platform === 'win32' ? own.toLowerCase() === entry.toLowerCase() : own === entry;
}
