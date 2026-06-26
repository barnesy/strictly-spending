import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    // Mode for the fixture to read
    mode: 'cdp',
  },
  webServer: {
    command: "npm.cmd run tauri dev",
    url: "http://localhost:5173",
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
    env: {
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9222",
    },
  },
  projects: [
    {
      name: 'cdp',
    },
  ],
});
