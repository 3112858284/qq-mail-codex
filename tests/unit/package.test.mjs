import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { preparePackage } from '../../scripts/package.mjs';
import { metadata, assertChild } from '../../scripts/lib/paths.mjs';
import { fixture } from '../support/helpers.mjs';

test('package output guards refuse workspace roots and unrelated existing directories', async t => {
  const { dir } = await fixture(t);
  await assert.rejects(() => preparePackage(dir), /must be named/);
  assert.throws(() => assertChild(dir, dir), /inside/);
  const unrelated = join(dir, `qq-mail-${metadata.version}`); await mkdir(unrelated);
  await writeFile(join(unrelated, 'keep.txt'), 'keep');
  await assert.rejects(() => preparePackage(unrelated), /unrelated/);
  assert.equal(await readFile(join(unrelated, 'keep.txt'), 'utf8'), 'keep');
});
