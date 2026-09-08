import { defineConfig, devices } from '@playwright/test';
import { localUrl } from './scripts/local-url.mjs';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'output/playwright/report', open: 'never' }],
  ],
  outputDir: 'output/playwright/results',
  use: {
    baseURL: localUrl(),
    ignoreHTTPSErrors: true,
    // Per-action canvas snapshots can delay native taps enough to miss a cue.
    // Keep action/error traces; explicit screenshots cover visual inspection.
    trace: { mode: 'retain-on-failure', screenshots: false, snapshots: false },
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'phone',
      use: { ...devices['iPhone 13'], defaultBrowserType: 'webkit' },
    },
    {
      name: 'phone-landscape',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 915, height: 412 },
        defaultBrowserType: 'chromium',
      },
    },
  ],
});
