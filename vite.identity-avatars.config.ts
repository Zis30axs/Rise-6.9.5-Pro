import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { defineConfig, mergeConfig } from 'vite';
import baseConfig from './vite.config';

export default mergeConfig(baseConfig, defineConfig({
  plugins: [{
    name: 'identity-avatar-test-page',
    closeBundle() {
      const directory = 'test-results/identity-avatar-build/tests/e2e';
      mkdirSync(directory, { recursive: true });
      const html = readFileSync('tests/e2e/identity-avatars.html', 'utf8')
        .replace('./identity-avatars-fixture.ts', '/identity-avatars.js')
        .replace('</head>', '<link rel="stylesheet" href="/unread-city.css"></head>');
      writeFileSync(`${directory}/identity-avatars.html`, html);
    },
  }],
  optimizeDeps: { entries: ['tests/e2e/identity-avatars.html'] },
  build: {
    outDir: 'test-results/identity-avatar-build',
    emptyOutDir: true,
    lib: { entry: 'tests/e2e/identity-avatars-fixture.ts', name: 'IdentityAvatarTest', fileName: () => 'identity-avatars.js' },
  },
}));
