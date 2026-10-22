import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', testMatch: 'npc-phone.spec.ts', timeout: 45000, workers: 1,
  use: { baseURL:'http://127.0.0.1:5184',browserName:'chromium',headless:true,
    launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,args:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?['--no-sandbox','--disable-dev-shm-usage']:[]} },
  webServer:{command:'npx vite --host 127.0.0.1 --port 5184 --strictPort',url:'http://127.0.0.1:5184/tests/fixtures/npc-phone.html',reuseExistingServer:!process.env.CI},
});
