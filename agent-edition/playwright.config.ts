import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 360_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  use: {
    baseURL: 'http://127.0.0.1:5191',
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 5191 --strictPort',
    cwd: '..',
    url: 'http://127.0.0.1:5191/agent-edition/agent.html',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
