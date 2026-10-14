import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { root, assertChild } from './lib/paths.mjs';

const output = assertChild(root, resolve(root, 'dist'));
rmSync(output, { recursive: true, force: true });
const compiled = spawnSync(process.execPath, [resolve(root, 'node_modules/typescript/bin/tsc'), '-p', resolve(root, 'tsconfig.json')], { cwd: root, stdio: 'inherit' });
process.exitCode = compiled.status ?? 1;
