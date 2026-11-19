import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.KX_E2E_PORT ?? 4450);

/**
 * Passport web UI E2E. Uses the SYSTEM Chrome (channel "chrome"): no browser download. Starts its own throwaway dev IdP (server.ts)
 * with a separate Postgres schema, so it never touches the dev database on port 4400. Needs Postgres on 127.0.0.1:5433.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  outputDir: './.results',
  use: { baseURL: `http://localhost:${PORT}`, channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure', timezoneId: 'Africa/Cairo' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'npx tsx apps/passport-ui/e2e/server.ts',
    cwd: '../../..',
    url: `http://localhost:${PORT}/healthz`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'pipe',
  },
});
