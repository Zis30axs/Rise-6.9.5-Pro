/**
 * Build the real embedded phone when this checkout does not already have one.
 * Source of truth is the pinned ST-iPhonie commit plus the patch in this repo.
 * The generated module stays out of git; it is only a local runtime input.
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const generated = resolve(root, 'src/frontend/generated/embedded-phone.ts');
const source = process.env.UNREAD_CITY_PHONE_SOURCE || '/tmp/ST-iPhonie';
const commit = '24295193aa1adff606edcd4e63c8b07923533f2b';
const patch = resolve(root, 'integration/embedded-phone-source/local-changes.patch');

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed`);
}

if (existsSync(generated)) {
  const text = readFileSync(generated, 'utf8');
  if (!text.includes('stub: true')) {
    console.log(JSON.stringify({ phone: 'existing' }));
    process.exit(0);
  }
}

if (!existsSync(resolve(source, 'portable/entry.js'))) {
  run('git', ['clone', '--filter=blob:none', '--no-checkout', 'https://github.com/Zis30axs/ST-iPhonie.git', source]);
  run('git', ['fetch', '--depth', '1', 'origin', commit], source);
  run('git', ['checkout', '--detach', 'FETCH_HEAD'], source);
  run('git', ['apply', patch], source);
} else {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' });
  if (head.stdout.trim() !== commit) throw new Error(`手机源码 ${source} 不是记录中的提交 ${commit}`);
}

run('node', ['scripts/build_embedded_phone.mjs', '--source', source]);
console.log(JSON.stringify({ phone: 'built', source, commit }));
