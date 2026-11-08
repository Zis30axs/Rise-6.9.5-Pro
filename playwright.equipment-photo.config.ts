import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', testMatch: 'equipment-photo.spec.ts', workers: 1, timeout: 120_000,
  outputDir: 'outputs/equipment-photo/browser-results',
  use: { baseURL: 'http://127.0.0.1:5204', browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5204 --strictPort',
    url: 'http://127.0.0.1:5204', reuseExistingServer: false,
  },
});
