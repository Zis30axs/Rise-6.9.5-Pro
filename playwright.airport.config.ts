import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', testMatch: 'airport-sandbox.spec.ts', workers: 1, timeout: 120_000,
  outputDir: 'outputs/airport-district/browser-results',
  reporter: [['list'], ['json', { outputFile: 'outputs/airport-district/playwright-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5199', browserName: 'chromium', channel: 'chrome' },
  webServer: {
    command: 'node --max-old-space-size=3072 node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5199 --strictPort',
    url: 'http://127.0.0.1:5199', reuseExistingServer: false,
  },
});
