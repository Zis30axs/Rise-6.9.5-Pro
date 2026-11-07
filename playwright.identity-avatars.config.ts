import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'identity-avatars.spec.ts',
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5197',
    browserName: 'chromium',
    launchOptions: {
      executablePath: process.env.AVATAR_TEST_BROWSER || undefined,
      args: process.env.AVATAR_TEST_SINGLE_PROCESS === '1' ? ['--single-process', '--no-zygote'] : [],
    },
  },
  webServer: {
    command: process.env.AVATAR_TEST_PACKAGED === '1'
      ? 'node_modules/.bin/vite preview --config vite.identity-avatars.config.ts --host 127.0.0.1 --port 5197 --strictPort'
      : 'node_modules/.bin/vite --config vite.identity-avatars.config.ts --host 127.0.0.1 --port 5197 --strictPort',
    url: 'http://127.0.0.1:5197/tests/e2e/identity-avatars.html',
    reuseExistingServer: false,
  },
});
