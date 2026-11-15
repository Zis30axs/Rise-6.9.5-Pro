/**
 * Assembles the standalone 3D Scrapbook Workbench frontend demo into one
 * self-contained HTML file (outputs/scrapbook-workbench-3d-demo.html).
 * Opens directly from disk via file:// without a server or character card.
 * Usage: node scripts/build_scrapbook_demo.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const STICKER_PATHS = {
  'mygo-m': 'assets/stickers/mygo/mygo-m.png',
  'mygo-y': 'assets/stickers/mygo/mygo-y.png',
  'mygo-g': 'assets/stickers/mygo/mygo-g.png',
  'mygo-o': 'assets/stickers/mygo/mygo-o.png',
  'mygo-exclamation': 'assets/stickers/mygo/mygo-exclamation.png',
  'chibi-01': 'assets/stickers/chibi-wave2-20261114/chibi-01.png',
  'chibi-02': 'assets/stickers/chibi-wave2-20261114/chibi-02.png',
  'chibi-03': 'assets/stickers/chibi-wave2-20261114/chibi-03.png',
  'chibi-04': 'assets/stickers/chibi-wave2-20261114/chibi-04.png',
  'chibi-05': 'assets/stickers/chibi-wave2-20261114/chibi-05.png',
  'chibi-06': 'assets/stickers/chibi-wave2-20261114/chibi-06.png',
  'chibi-07': 'assets/stickers/chibi-wave2-20261114/chibi-07.png',
  'chibi-08': 'assets/stickers/chibi-wave2-20261114/chibi-08.png',
};

export function buildScrapbookDemo({ write = true } = {}) {
  const stickers = {};
  for (const [key, relPath] of Object.entries(STICKER_PATHS)) {
    const absPath = path.join(root, relPath);
    const bytes = readFileSync(absPath);
    stickers[key] = `data:image/png;base64,${bytes.toString('base64')}`;
  }

  const rawCore = readFileSync(path.join(root, 'scripts/scrapbook-demo-core.mjs'), 'utf8');
  const inlinedCore = rawCore
    .replace(/^export\s+(const|function)\s+/gm, '$1 ')
    .replace(/<\/script/gi, '<\\/script');

  const safeStickersJson = JSON.stringify(stickers).replace(/<\/script/gi, '<\\/script');

  const template = readFileSync(path.join(root, 'scripts/scrapbook-demo-template.html'), 'utf8');
  if (!template.includes('__STICKERS_JSON__') || !template.includes('__CORE_JS__')) {
    throw new Error('Scrapbook template is missing required injection markers.');
  }

  const html = template
    .split('__STICKERS_JSON__')
    .join(safeStickersJson)
    .split('__CORE_JS__')
    .join(inlinedCore);

  if (html.includes('__STICKERS_JSON__') || html.includes('__CORE_JS__')) {
    throw new Error('Scrapbook HTML still contains unreplaced template markers.');
  }

  const outPath = path.join(root, 'outputs/scrapbook-workbench-3d-demo.html');
  if (write) {
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, html, 'utf8');
  }

  return {
    outPath,
    bytes: Buffer.byteLength(html, 'utf8'),
    stickerCount: Object.keys(stickers).length,
    html,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildScrapbookDemo({ write: true });
  console.log(
    JSON.stringify({
      out: 'outputs/scrapbook-workbench-3d-demo.html',
      bytes: result.bytes,
      stickers: result.stickerCount,
    }),
  );
}
