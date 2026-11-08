import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', testMatch: 'airport-backdrop.spec.ts', workers: 1, timeout: 180_000,
  outputDir: 'outputs/airport-backgrounds/browser-results',
  reporter: [['list'], ['json', { outputFile: 'outputs/airport-backgrounds/playwright-results.json' }]],
  use: { baseURL: 'http://127.0.0.1:5201', browserName: 'chromium', channel: 'chrome' },
  webServer: {
    command: 'node --max-old-space-size=3072 node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5201 --strictPort',
    url: 'http://127.0.0.1:5201', reuseExistingServer: false,
  },
});
