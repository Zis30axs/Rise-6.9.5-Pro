/** Offline maintenance renderer. Only the resulting WebP files enter the UI. */
import { build } from 'vite';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = join(root, 'assets', 'npc-portraits');
const workDir = join(root, 'outputs', 'npc-portrait-work');
const ids = ['deepseek', 'xiaoyang', 'claude'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
for (const directory of [outputDir, workDir]) {
  await mkdir(directory, { recursive: true });
  const actual = await realpath(directory), inside = relative(root, actual);
  if (inside.startsWith('..') || resolve(root, inside) !== actual) throw new Error('Output directory escaped workspace');
}
await writeFile(join(workDir, '.gitignore'), '*\n');
const inputManifest = JSON.parse(await readFile(join(root, 'assets/characters/manifest.json'), 'utf8'));
const models = ids.map(id => {
  const source = inputManifest.models.find(model => model.id === id);
  if (!source || source.output !== `${id}.glb`) throw new Error(`Missing inspected model: ${id}`);
  return source;
});
const input = {};
for (const source of models) {
  const bytes = await readFile(join(root, 'assets/characters', source.output));
  if (digest(bytes) !== source.sha256 || bytes.length !== source.bytes) throw new Error(`Model hash mismatch: ${source.id}`);
  input[source.id] = `data:model/gltf-binary;base64,${bytes.toString('base64')}`;
}
const result = await build({
  configFile: false, root, logLevel: 'warn',
  build: { write: false, sourcemap: false, lib: { entry: join(root, 'scripts/render_npc_portraits.ts'), formats: ['iife'], name: 'NpcPortraitRenderer' } },
});
const chunk = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk');
if (!chunk) throw new Error('Offline renderer did not compile');
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
const rows = [], errors = [], network = [];
try {
  const page = await browser.newPage({ viewport: { width: 768, height: 960 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/^https?:/, route => { network.push(route.request().url()); return route.abort(); });
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: chunk.code });
  for (const source of models) {
    const result = await page.evaluate(async ({ id, encoded }) => window.npcPortraitRenderer.render(id, encoded), { id: source.id, encoded: input[source.id] });
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(result.png);
    if (!match) throw new Error('Renderer did not return a PNG');
    await writeFile(join(workDir, `${source.id}.png`), Buffer.from(match[1], 'base64'));
    const { png, ...render } = result;
    rows.push({ id: source.id, sourceModel: `assets/characters/${source.output}`, sourceModelBytes: source.bytes, sourceModelSha256: source.sha256,
      sourceArchive: source.archive, sourceArchiveBytes: source.archiveBytes, sourceArchiveSha256: source.archiveSha256, render });
  }
  await page.evaluate(() => window.npcPortraitRenderer.dispose());
} finally { await browser.close(); }
if (errors.length || network.length) throw new Error(JSON.stringify({ errors, network }));

// Lossless format conversion preserves the rendered RGBA pixels and all transparent edges.
const encoder = String.raw`
from pathlib import Path
from PIL import Image
import json,sys
source=Path(sys.argv[1]); target=Path(sys.argv[2]); results=[]
for name in ['deepseek','xiaoyang','claude']:
 with Image.open(source/(name+'.png')) as image:
  image.load()
  if image.size!=(768,960) or image.mode!='RGBA': raise ValueError('Unexpected render format')
  alpha=image.getchannel('A')
  if alpha.getextrema()!=(0,255): raise ValueError('Portrait must contain transparent and opaque pixels')
  box=alpha.getbbox()
  if not box or box[0]<2 or box[2]>766 or box[1]<2: raise ValueError('Portrait clipped at side or top')
  path=target/(name+'.webp'); image.save(path,format='WEBP',lossless=True,method=6,exact=True)
  with Image.open(path) as decoded:
   decoded=decoded.convert('RGBA')
   if decoded.tobytes()!=image.tobytes(): raise ValueError('Lossless WebP pixel mismatch')
  results.append({'id':name,'width':image.width,'height':image.height,'alphaBounds':list(box),'transparentPixelCount':alpha.histogram()[0],'opaquePixelCount':alpha.histogram()[255]})
print(json.dumps(results))
`;
const encoded = spawnSync(process.env.PYTHON || 'python', ['-c', encoder, workDir, outputDir], { cwd: root, encoding: 'utf8' });
if (encoded.status !== 0) throw new Error(`WebP encoding failed: ${encoded.stderr || encoded.stdout}`);
const verification = JSON.parse(encoded.stdout);
for (const row of rows) {
  const file = `${row.id}.webp`, bytes = await readFile(join(outputDir, file));
  Object.assign(row, { file, bytes: bytes.length, sha256: digest(bytes), ...verification.find(item => item.id === row.id) });
}
const manifest = {
  format: 'Transparent static NPC portraits; one natural pose per model',
  tool: 'scripts/render_npc_portraits.mjs + scripts/render_npc_portraits.ts',
  encoding: { format: 'WebP', lossless: true, exact: true, method: 6 },
  renderer: { width: 768, height: 960, toneMapping: 'ACESFilmic', exposure: 1.1, hemisphere: { sky: '#ffffff', ground: '#8f9eaa', intensity: 2.2 }, directional: { color: '#ffffff', intensity: 2.8, position: [-3, 7, 6] }, background: 'transparent', camera: 'orthographic +Z front', animations: false, outputColorSpace: 'sRGB', browser: browser.version() },
  totalBytes: rows.reduce((sum, row) => sum + row.bytes, 0), portraits: rows,
  validation: { pageErrors: errors, networkRequests: network, decodedRgbaEqualsRenderedPng: true },
};
await writeFile(join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ totalBytes: manifest.totalBytes, portraits: rows.map(({ id, bytes, sha256, alphaBounds }) => ({ id, bytes, sha256, alphaBounds })), errors, network }, null, 2));
