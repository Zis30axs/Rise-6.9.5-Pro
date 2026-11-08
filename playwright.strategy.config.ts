import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'strategy-panels-packaged.spec.ts',
  workers: 1,
  timeout: 120_000,
  use: { baseURL: 'http://127.0.0.1:5178', browserName: 'chromium' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5178 --strictPort',
    url: 'http://127.0.0.1:5178',
    reuseExistingServer: !process.env.CI,
  },
});
