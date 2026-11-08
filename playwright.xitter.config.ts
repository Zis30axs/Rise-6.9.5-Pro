import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e',testMatch:'xitter.spec.ts',workers:1,timeout:45000,
  use:{baseURL:'http://127.0.0.1:5198',browserName:'chromium',launchOptions:{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}},
  webServer:{command:'node scripts/serve_xitter_preview.mjs',url:'http://127.0.0.1:5198/outputs/xitter-qa/index.html',reuseExistingServer:false},
});
