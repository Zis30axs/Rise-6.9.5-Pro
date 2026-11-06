import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(root, 'dist');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const bundle = readFileSync(resolve(outputDir, 'immersive-shell.js'), 'utf8');
const moduleEntry = '<script type="module" src="/src/frontend/main.ts"></script>';
if (html.split(moduleEntry).length !== 2) {
  throw new Error('Browser preview entry is missing or duplicated in index.html.');
}
if (!bundle.includes('UNREAD_CITY_IMMERSIVE_BUNDLE')) {
  throw new Error('dist/immersive-shell.js is not a verified Unread City bundle. Run the local build first.');
}
const escapedBundle = bundle.replace(/<\/script/gi, '<\\/script');
const standalone = html.replace(moduleEntry, `<script>\n${escapedBundle}\n</script>`);
mkdirSync(outputDir, { recursive: true });
const output = resolve(outputDir, 'unread-city-browser-preview.html');
writeFileSync(output, standalone, 'utf8');
console.log(`Browser preview written to ${output}`);
