import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import base from '../../vite.config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
// This entry only offers Tokyo. The full card retains its world atlas and every overseas component.
const local: Plugin = {
  name: 'tokyo-viewer',
  enforce: 'pre',
  resolveId(id, from) {
    if (id === 'virtual:tokyo-map-crops') return '\0tokyo-crops';
    if (id === './map-character-avatar')
      return resolve('examples/tokyo/map-portrait.ts');
    if (
      from?.includes('WorldMap.vue') &&
      /^\.\/(AtlasMapScene|BeijingSandbox|CaliforniaSandbox|ParisSandbox)\.vue$/.test(
        id
      )
    )
      return '\0tokyo-only';
    if (from?.includes('WorldMap.vue') && id === './atlas-data.json')
      return '\0tokyo-scope';
  },
  load(id) {
    if (id === '\0tokyo-crops')
      return (
        'export default ' +
        execFileSync('python3', ['examples/tokyo/headshots.py'], {
          encoding: 'utf-8',
          maxBuffer: 2000000,
        })
      );
    if (id === '\0tokyo-only') return 'export default {render(){return null}}';
    if (id === '\0tokyo-scope') {
      const d = JSON.parse(
        readFileSync(resolve('src/frontend/atlas-data.json'), 'utf8')
      );
      const filter = (set: any) => ({
        ...set,
        features: set.features
          .filter(
            (r: any) =>
              r.properties.id === 'JPN' || r.properties.countryId === 'JPN'
          )
          .map((r: any) => ({ ...r, geometry: null })),
      });
      return (
        'export default ' +
        JSON.stringify({
          countries: filter(d.countries),
          subdivisions: filter(d.subdivisions),
        })
      );
    }
  },
  generateBundle(_o, bundle) {
    const chunk = Object.values(bundle).find((i) => i.type === 'chunk');
    if (!chunk || chunk.type !== 'chunk') throw Error('Viewer missing');
    const strings = new Map<string, number>();
    const packed = chunk.code.replace(
      /([`"'])(data:[^"'`\s\\]+;base64,[a-zA-Z0-9+/=]+)\1/g,
      (original, _q, url) => {
        let i = strings.get(url);
        if (i === undefined) {
          i = strings.size;
          strings.set(url, i);
        }
        return '__TOKYO_MEDIA[' + i + ']';
      }
    );
    chunk.code =
      'var __TOKYO_MEDIA=' + JSON.stringify([...strings.keys()]) + ';' + packed;
    const prefix =
      '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>东京城市沙盘 · 未读之城</title></head><body><div id="app"></div><script src="';
    const suffix = '"></script></body></html>';
    this.emitFile({
      type: 'asset',
      fileName: 'index.html',
      source: prefix + './atlas.js' + suffix,
    });
    this.emitFile({
      type: 'asset',
      fileName: 'Tokyo-Sandbox-Full.html',
      source:
        prefix +
        'data:text/javascript;base64,' +
        Buffer.from(chunk.code).toString('base64') +
        suffix,
    });
  },
};
export default defineConfig({
  ...base,
  plugins: [local, ...base.plugins!],
  build: {
    ...base.build,
    outDir: 'dist/tokyo-viewer',
    emptyOutDir: true,
    lib: {
      entry: 'examples/tokyo/main.ts',
      name: 'TokyoAtlas',
      formats: ['iife'],
      fileName: () => 'atlas.js',
    },
  },
});
