import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

/** Local source-module regression; never dispatches a GitHub workflow or builds release files. */
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'margo-cafe.spec.ts',
  timeout: 90_000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5186',
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined) },
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5186 --strictPort',
    url: 'http://127.0.0.1:5186',
    reuseExistingServer: !process.env.CI,
  },
});
