import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'scene-roster.spec.ts', workers: 1, timeout: 120_000,
  outputDir: 'outputs/scene-roster/browser-results',
  use: { baseURL: 'http://127.0.0.1:5198', browserName: 'chromium', channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' },
  webServer: {
    command: 'node --max-old-space-size=3072 node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5198 --strictPort',
    url: 'http://127.0.0.1:5198', reuseExistingServer: false,
  },
});
