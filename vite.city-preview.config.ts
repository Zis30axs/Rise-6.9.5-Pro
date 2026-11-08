import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { unreadCityOfflinePackPlugin } from './offline-pack-plugin';

const repositoryRoot = fileURLToPath(new URL('.', import.meta.url));

/** Card assets remain unchanged; the standalone website can use local image URLs. */
function previewImageAssets(): Plugin {
  return {
    name: 'unread-city-preview-image-assets',
    enforce: 'pre',
    load(id) {
      const headshotQuery = '?offline-map-headshot';
      if (id.endsWith(headshotQuery)) {
        const filename = id.slice(0, -headshotQuery.length);
        if (!/(?:^|[/\\])assets[/\\]map-avatars[/\\][^/\\]+\.svg$/.test(filename)) {
          throw new Error('Unapproved SVG headshot import: ' + id);
        }
        return `export { default } from ${JSON.stringify(filename + '?url')};`;
      }
      // Models and ZIPs intentionally stay Base64: readLocalAssetBytes accepts
      // only embedded data or local Blob URLs. Do not relax that safety boundary.
      if (!id.endsWith('?inline')) return null;
      const filename = id.slice(0, -'?inline'.length);
      if (!/[/\\]assets[/\\]/.test(filename) || !/\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(filename)) return null;
      return `export { default } from ${JSON.stringify(filename + '?url')};`;
    },
  };
}

export default defineConfig({
  root: resolve(repositoryRoot, 'preview/city-sandbox'),
  base: './',
  publicDir: false,
  assetsInclude: ['**/*.glb'],
  plugins: [previewImageAssets(), unreadCityOfflinePackPlugin(), vue()],
  define: {
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  server: { host: '127.0.0.1', fs: { allow: [repositoryRoot] } },
  build: {
    outDir: resolve(repositoryRoot, 'dist/city-sandbox'),
    emptyOutDir: true,
    assetsInlineLimit: 0,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('unread-city-tokyo-sandbox.glb')) return 'tokyo-model';
          if (id.includes('/src/frontend/generated/downtown-art.ts')) return 'character-art';
          if (id.includes('/src/frontend/atlas-data.json')) return 'atlas-data';
          if (id.includes('/node_modules/')) return 'vendor';
        },
      },
    },
  },
});
