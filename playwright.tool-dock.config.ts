import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', testMatch: ['tool-dock.spec.ts', 'abilities-entry.spec.ts', 'invitation-book.spec.ts'], workers: 1, timeout: 120_000,
  outputDir: 'outputs/tool-dock/browser-results',
  use: { baseURL: 'http://127.0.0.1:5198', browserName: 'chromium',
    launchOptions: { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } },
  webServer: { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5198 --strictPort',
    url: 'http://127.0.0.1:5198', reuseExistingServer: false },
});
