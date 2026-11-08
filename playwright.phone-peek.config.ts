import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e',testMatch:['phone-peek.spec.ts','phone-native-swipes.spec.ts'],workers:1,timeout:120_000,
  outputDir:'outputs/phone-peek/browser-results',
  use:{baseURL:'http://127.0.0.1:5197',browserName:'chromium',actionTimeout:15_000,
    launchOptions:{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}},
  webServer:{command:'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5197 --strictPort',
    url:'http://127.0.0.1:5197',reuseExistingServer:false},
});
