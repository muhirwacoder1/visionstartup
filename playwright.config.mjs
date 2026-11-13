import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:'*.spec.mjs',
  use:{viewport:{width:1440,height:900}, launchOptions:{executablePath:process.env.CHROMIUM_EXECUTABLE}},
});
