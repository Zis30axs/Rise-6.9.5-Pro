// Stages the user-provided 超かぐや姫！かぐや「水色の描」 VRM byte-exact for the
// 3D livestream demo and (later) the in-card Twiitch live view. The source
// stays in the user's 素材/ drop zone and is never modified; no mesh/texture
// recompression is applied — v1 keeps the model faithful to the original.
// Usage: node scripts/prepare_kaguya_live_model.mjs [--check]
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourcePath = path.join(root, '素材/超かぐや姫_かぐや_水色の描/超かぐや姫！かぐや「水色の描」/超かぐや姫！かぐや「水色の描」vrm/超かぐや姫！かぐや「水色の描」.vrm');
const outDir = path.join(root, 'assets/kaguya-live');
const outPath = path.join(outDir, 'kaguya.vrm');
const manifestPath = path.join(outDir, 'manifest.json');

const sha256 = p => createHash('sha256').update(readFileSync(p)).digest('hex');

if (process.argv.includes('--check')) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!existsSync(outPath)) { console.error(`missing ${outPath}`); process.exit(1); }
  if (sha256(outPath) !== manifest.modelSha256) { console.error('kaguya.vrm does not match manifest.json; rerun prepare_kaguya_live_model.mjs'); process.exit(1); }
  console.log(JSON.stringify({ check: 'ok', modelBytes: statSync(outPath).size }));
  process.exit(0);
}

if (!existsSync(sourcePath)) { console.error(`source VRM not found: ${sourcePath}`); process.exit(1); }
mkdirSync(outDir, { recursive: true });
copyFileSync(sourcePath, outPath);

const manifest = {
  schema: 'unread-city-kaguya-live-model-v1',
  purpose: '超かぐや姫！ Twiitch channel 3D livestream view (standalone demo first; later the embedded phone). Byte-exact copy of the user-provided VRM; presentation only.',
  credit: '【水色の描】(https://mizuirononeko.wixsite.com/mizuirononeko/mmd-vroid)',
  license: 'MMD・VRoidモデル利用規約: avatar/streaming use allowed, no profit use, no corporate use, modification free, redistribution prohibited — personal-use embedding only; the card and repository stay private.',
  licensePath: '素材/超かぐや姫_かぐや_水色の描/超かぐや姫！かぐや「水色の描」/超かぐや姫！かぐや「水色の描」vrm/MMD・VRoidモデル利用規約.txt',
  source: '素材/超かぐや姫_かぐや_水色の描/超かぐや姫！かぐや「水色の描」/超かぐや姫！かぐや「水色の描」vrm/超かぐや姫！かぐや「水色の描」.vrm',
  sourceBytes: statSync(sourcePath).size,
  sourceSha256: sha256(sourcePath),
  model: 'assets/kaguya-live/kaguya.vrm',
  modelBytes: statSync(outPath).size,
  modelSha256: sha256(outPath),
  staging: { copy: 'byte-exact', compression: 'none (v1 faithful copy)', date: new Date().toISOString().slice(0, 10) },
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ modelBytes: manifest.modelBytes, modelSha256: manifest.modelSha256.slice(0, 16) + '…' }));
