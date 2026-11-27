import { defineConfig, devices } from '@playwright/test';

const MOCK = Number(process.env.KIORLY_SITE_E2E_PORT ?? 5496);
const LIVE = MOCK + 1;
const cwd = '../../..';
// The two builds get their hosts from the environment of the test run (the app has no host literal): a mock-leads site and a live-endpoint site.
const common = { KIORLY_SITE_ENV: 'local', KIORLY_HOME_URL: `http://127.0.0.1:${MOCK + 10}` };

/** Kiorly site E2E: static dist served by the preview server (same index handling as the CloudFront function). System Chrome, no downloads, no network beyond 127.0.0.1. */
export default defineConfig({
  testDir: '.', testMatch: /.*\.spec\.ts/, timeout: 60_000, expect: { timeout: 10_000 }, fullyParallel: false, workers: 1, reporter: [['list']], outputDir: './.results',
  use: { baseURL: `http://127.0.0.1:${MOCK}`, channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: [
    { command: `npx tsx apps/kiorly-site/src/build-cli.ts --out apps/kiorly-site/dist-e2e-mock && npx tsx apps/kiorly-site/src/preview-cli.ts`, cwd, url: `http://127.0.0.1:${MOCK}/en/`, reuseExistingServer: false, timeout: 60_000, stdout: 'pipe',
      env: { ...common, KIORLY_SITE_ORIGIN: `http://127.0.0.1:${MOCK}`, KIORLY_SITE_PORT: String(MOCK), KIORLY_SITE_DIST: 'apps/kiorly-site/dist-e2e-mock' } },
    { command: `npx tsx apps/kiorly-site/src/build-cli.ts --out apps/kiorly-site/dist-e2e-live && npx tsx apps/kiorly-site/src/preview-cli.ts`, cwd, url: `http://127.0.0.1:${LIVE}/en/`, reuseExistingServer: false, timeout: 60_000, stdout: 'pipe',
      env: { ...common, KIORLY_SITE_ORIGIN: `http://127.0.0.1:${LIVE}`, KIORLY_SITE_PORT: String(LIVE), KIORLY_SITE_DIST: 'apps/kiorly-site/dist-e2e-live', KIORLY_LEAD_ENDPOINT: `http://127.0.0.1:${MOCK + 20}/leads`, KIORLY_PLANS_ENDPOINT: `http://127.0.0.1:${MOCK + 30}/plans` } },
  ],
});
