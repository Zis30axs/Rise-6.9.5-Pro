import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue(), {
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
