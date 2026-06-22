import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  use: {
    // Mode for the fixture to read
    mode: 'tauri',
  },
  webServer: {
    command: "npm run tauri dev",
    url: "http://localhost:5173",
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'tauri',
    },
  ],
});
