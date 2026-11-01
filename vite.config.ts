import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';

export default defineConfig({
  assetsInclude: ['**/*.glb'],
  plugins: [
    // Export map-avatar SVGs as BASE64 data URL literals, not Vite's URL-encoded SVG.
    // The existing Lite ZIP externalizer then finds and moves these large assets
    // into its SHA-256-verified local archive; the card PNG stays lightweight.
    {
      name: 'unread-city-map-headshot-base64',
      enforce: 'pre',
      load(id) {
        const query = '?offline-map-headshot';
        if (!id.endsWith(query)) return null;
        const filename = id.slice(0, -query.length);
        if (!/(?:^|[/\\])assets[/\\]map-avatars[/\\][^/\\]+\.svg$/.test(filename)) {
          throw new Error('Unapproved SVG headshot import: ' + id);
        }
        const encoded = readFileSync(filename).toString('base64');
        return 'export default ' + JSON.stringify('data:image/svg+xml;base64,' + encoded) + ';';
      },
    },
    vue(), {
    name: 'unread-city-portable-bundle',
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk') item.code = '/* UNREAD_CITY_IMMERSIVE_BUNDLE v0.2.0 */\n' + item.code;
      }
    },
  }],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  build: {
    emptyOutDir: false,
    sourcemap: false,
    lib: {
      entry: 'src/frontend/main.ts',
      name: 'UnreadCityShell',
      formats: ['iife'],
      fileName: () => 'immersive-shell.js',
    },
  },
});
