import { readFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const metadata = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
export function assertChild(parent, target) {
  const base = resolve(parent), path = resolve(target);
  const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
  if (!normalize(path).startsWith(normalize(base + sep))) throw new Error('Target must stay inside the specified output directory.');
  return path;
}
