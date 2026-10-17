/** Legacy entry point: rebuild through the unified, checked atlas policy. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Same cached-source directory as prepare_atlas_data; no obsolete 110m pipeline.
await import('./prepare_atlas_data.mjs');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const atlas = JSON.parse(fs.readFileSync(path.join(root, 'src/frontend/atlas-data.json'), 'utf8'));
const legacyPath = path.join(root, 'src/frontend/map-data.json');
const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
legacy.world = atlas.countries;
legacy.chinaMaritimeLines = atlas.chinaMaritimeLines;
fs.writeFileSync(legacyPath, JSON.stringify(legacy) + '\n');
console.log('Legacy map cache synchronized with the unified atlas.');
