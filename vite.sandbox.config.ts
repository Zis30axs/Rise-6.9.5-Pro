import { defineConfig, type Plugin } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

/** One HTML file: JS and CSS are inlined as a classic script so file:// can open it. */
function singleHtml(): Plugin {
  return {
    name: 'sandbox-single-html',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const htmlName = Object.keys(bundle).find(name => name.endsWith('.html'));
      const html = htmlName ? bundle[htmlName] : undefined;
      if (!html || html.type !== 'asset') return;
      let source = html.source.toString();
      let js = '';
      let css = '';
      for (const item of Object.values(bundle)) {
        if (item.type === 'chunk') js += item.code;
        else if (item.type === 'asset' && item.fileName.endsWith('.css')) css += item.source.toString();
      }
      // String.replace treats $` and $' in the replacement as the text around the match.
      js = js.replace(/<\/script/gi, '<\\/script');
      css = css.replace(/<\/style/gi, '<\\/style');
      source = source.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
      source = source.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/g, '');
      source = source.replace('</head>', () => `<style>${css}</style></head>`);
      source = source.replace('</body>', () => `<script>${js}</script></body>`);
      html.fileName = 'sandbox-demo.html';
      html.source = source;
      for (const name of Object.keys(bundle)) if (bundle[name] !== html) delete bundle[name];
    },
  };
}

export default defineConfig({
  root,
  plugins: [vue(), singleHtml(), {
    name: 'sandbox-avatar-stub',
    enforce: 'pre',
    resolveId(source) {
      if (source.endsWith('MapCharacterAvatar.vue')) return path.resolve(root, 'src/sandbox-demo-avatar-stub.vue');
    },
  }],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    __VUE_OPTIONS_API__: false,
    __VUE_PROD_DEVTOOLS__: false,
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false,
  },
  build: {
    outDir: 'dist/sandbox-demo',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 100000000,
    rollupOptions: {
      input: path.resolve(root, 'sandbox-demo.html'),
      output: {
        format: 'iife',
        name: 'UnreadCitySandboxDemo',
      },
    },
  },
});
