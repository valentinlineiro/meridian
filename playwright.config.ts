import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8789',
    trace: 'on-first-retry',
    launchOptions: {
      executablePath: '/home/valentin/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
    },
  },
  webServer: {
    command: 'npx wrangler dev --port 8789 --ip 127.0.0.1 --show-interactive-dev-session=false',
    url: 'http://127.0.0.1:8789/login',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
