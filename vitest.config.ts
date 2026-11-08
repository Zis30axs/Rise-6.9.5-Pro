import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { unreadCityOfflinePackPlugin } from './offline-pack-plugin';

export default defineConfig({
  assetsInclude: ['**/*.glb'],
  plugins: [unreadCityOfflinePackPlugin(), vue()],
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts', 'tests/**/*.test.js'] },
});
