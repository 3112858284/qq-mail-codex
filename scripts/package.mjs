import { cp, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { root, metadata, assertChild } from './lib/paths.mjs';

export async function preparePackage(output, { nodeCommand = 'node' } = {}) {
  const destination = resolve(output), parent = dirname(destination);
  if (basename(destination) !== `qq-mail-${metadata.version}`) throw new Error(`Package directory must be named qq-mail-${metadata.version}.`);
  assertChild(parent, destination);
  let existing = true;
  try { await stat(destination); } catch (e) { if (e.code === 'ENOENT') existing = false; else throw e; }
  if (existing) {
    let previous;
    try { previous = JSON.parse(await readFile(resolve(destination, 'plugin.json'), 'utf8')); }
    catch { throw new Error('Refusing to replace an unrelated directory.'); }
    if (previous.name !== 'qq-mail') throw new Error('Refusing to replace an unrelated directory.');
  }
  const stage = assertChild(parent, resolve(parent, `.qq-mail-${metadata.version}-${randomUUID()}`));
  await mkdir(stage, { recursive: true });
  try {
    for (const dir of ['dist', 'src', 'scripts', 'skills', 'tests', 'docs']) await cp(resolve(root, dir), resolve(stage, dir), { recursive: true });
    for (const name of ['README.md', 'plugin.json', 'mcp.json', 'package.json', 'package-lock.json', 'tsconfig.json', '.gitignore', '.gitattributes', 'install.cmd', 'uninstall.cmd', 'configure.cmd', 'check-connection.cmd', 'disconnect.cmd']) await cp(resolve(root, name), resolve(stage, name));
    const mcp = JSON.parse(await readFile(resolve(stage, 'mcp.json'), 'utf8'));
    mcp.mcpServers.qq_mail.command = nodeCommand;
    const { writeFile } = await import('node:fs/promises');
    await writeFile(resolve(stage, 'mcp.json'), JSON.stringify(mcp, null, 2) + '\n', 'utf8');
    const command = 'npm ci --omit=dev --ignore-scripts --no-fund --no-audit';
    const installed = spawnSync(command, { cwd: stage, shell: true, stdio: 'inherit', windowsHide: true });
    if (installed.status !== 0) throw new Error('Runtime dependency installation failed.');
    // Both recursive targets have been resolved and checked; an existing package must be ours.
    await rm(destination, { recursive: true, force: true });
    // Windows scanners can briefly retain handles after npm exits.
    for (let attempt = 0; ; attempt++) {
      try { await rename(stage, destination); break; }
      catch (e) {
        if (process.platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code) || attempt >= 5) throw e;
        await delay(250 * (attempt + 1));
      }
    }
    return destination;
  } finally { await rm(stage, { recursive: true, force: true }); }
}

async function main() {
  const args = process.argv.slice(2), option = name => { const at = args.indexOf(name); return at < 0 ? undefined : args[at + 1]; };
  for (let i = 0; i < args.length; i += 2) if (!['--directory', '--archive', '--node-command'].includes(args[i]) || !args[i + 1]) throw new Error('Use --directory, --archive or --node-command followed by a value.');
  const output = resolve(option('--directory') ?? resolve(root, 'work/packages', `qq-mail-${metadata.version}`));
  const directory = await preparePackage(output, { nodeCommand: option('--node-command') ?? 'node' });
  let archive;
  if (!option('--directory') || option('--archive')) {
    archive = resolve(option('--archive') ?? directory + '.zip');
    if (!archive.toLowerCase().endsWith('.zip') || archive === directory) throw new Error('Archive path must name a .zip file.');
    await mkdir(dirname(archive), { recursive: true });
    const compressed = spawnSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', resolve(root, 'scripts/windows/archive.ps1'), '-SourcePath', directory, '-ArchivePath', archive], { stdio: 'inherit', windowsHide: true });
    if (compressed.status !== 0) throw new Error('Archive creation failed.');
  }
  console.log(JSON.stringify({ version: metadata.version, directory, archive }));
}
const normalize = value => process.platform === 'win32' ? value.toLowerCase() : value;
if (process.argv[1] && normalize(resolve(process.argv[1])) === normalize(fileURLToPath(import.meta.url))) await main();
