import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testMatch: 'established-bands.spec.ts', workers: 1, timeout: 45000,
  outputDir: 'test-results/established-bands',
  use: { baseURL: 'http://127.0.0.1:5209', browserName: 'chromium' },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5209 --strictPort',
    url: 'http://127.0.0.1:5209/tests/e2e/established-bands.html', reuseExistingServer: false,
  },
});
