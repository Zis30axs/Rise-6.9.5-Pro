import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'protagonist-presence.spec.ts',
  timeout: 120_000,
  workers: 1,
  outputDir: './test-results/protagonist-presence',
  use: { baseURL: 'http://127.0.0.1:5188', browserName: 'chromium', headless: true, actionTimeout: 10_000 },
  webServer: {
    command: `node --input-type=module -e "import { createServer } from 'vite'; const server = await createServer({ server: { host: '127.0.0.1', port: 5188, strictPort: true } }); await server.listen();"`,
    url: 'http://127.0.0.1:5188',
    reuseExistingServer: false,
  },
});
