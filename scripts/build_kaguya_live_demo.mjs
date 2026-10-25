// Assembles the standalone 超かぐや姫！ 3D livestream demo into one self-contained
// HTML file (outputs/kaguya-live-3d-demo.html). No dev server and no character
// card needed — the page opens directly from disk via file://.
// Usage: node scripts/build_kaguya_live_demo.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataUrl = bytes => `data:text/javascript;base64,${Buffer.from(bytes).toString('base64')}`;
const file = p => readFileSync(path.join(root, p));

// Vendor modules keep no relative imports: relative specifiers cannot resolve
// inside data:-URL modules (no base URL). three.module.js re-exports from
// ./three.core.js and GLTFLoader pulls in two utils — all rewritten to bare
// specifiers mapped below.
const threeModule = file('node_modules/three/build/three.module.js').toString('utf8')
  .replaceAll(`from './three.core.js'`, `from 'three/core'`)
  .replaceAll(`from "./three.core.js"`, `from "three/core"`);

// GLTFLoader resolves its utils with relative specifiers, which cannot resolve
// inside a data:-URL module (no base URL). Rewrite them to bare specifiers and
// map those in the import map instead.
const gltfLoader = file('node_modules/three/examples/jsm/loaders/GLTFLoader.js').toString('utf8')
  .replaceAll(`from '../utils/BufferGeometryUtils.js'`, `from 'three/examples/jsm/utils/BufferGeometryUtils.js'`)
  .replaceAll(`from "../utils/BufferGeometryUtils.js"`, `from "three/examples/jsm/utils/BufferGeometryUtils.js"`)
  .replaceAll(`from '../utils/SkeletonUtils.js'`, `from 'three/examples/jsm/utils/SkeletonUtils.js'`)
  .replaceAll(`from "../utils/SkeletonUtils.js"`, `from "three/examples/jsm/utils/SkeletonUtils.js"`);

for (const [name, source] of [
  ['three.module', threeModule],
  ['GLTFLoader', gltfLoader],
  ['BufferGeometryUtils', file('node_modules/three/examples/jsm/utils/BufferGeometryUtils.js').toString('utf8')],
  ['SkeletonUtils', file('node_modules/three/examples/jsm/utils/SkeletonUtils.js').toString('utf8')],
  ['three-vrm', file('node_modules/@pixiv/three-vrm/lib/three-vrm.module.min.js').toString('utf8')],
]) {
  const relative = [...source.matchAll(/from\s*['"](\.[^'"]+)['"]/g)].map(match => match[1]);
  if (relative.length) throw new Error(`${name} still has relative imports: ${relative.join(', ')}`);
}

const imports = {
  'three': dataUrl(threeModule),
  'three/core': dataUrl(file('node_modules/three/build/three.core.js')),
  'three/examples/jsm/loaders/GLTFLoader.js': dataUrl(gltfLoader),
  'three/examples/jsm/utils/BufferGeometryUtils.js': dataUrl(file('node_modules/three/examples/jsm/utils/BufferGeometryUtils.js')),
  'three/examples/jsm/utils/SkeletonUtils.js': dataUrl(file('node_modules/three/examples/jsm/utils/SkeletonUtils.js')),
  '@pixiv/three-vrm': dataUrl(file('node_modules/@pixiv/three-vrm/lib/three-vrm.module.min.js')),
};

const html = file('scripts/kaguya-live-demo-template.html').toString('utf8')
  .split('__IMPORTS__').join(JSON.stringify({ imports }))
  .split('__MODEL__').join(file('assets/kaguya-live/kaguya.vrm').toString('base64'));

writeFileSync(path.join(root, 'outputs/kaguya-live-3d-demo.html'), html);
console.log(JSON.stringify({ out: 'outputs/kaguya-live-3d-demo.html', bytes: html.length }));
