import { defineConfig, devices } from '@playwright/test';

const IDP = Number(process.env.KX_HOME_E2E_IDP_PORT ?? 4455);
const HOME = Number(process.env.KX_HOME_E2E_PORT ?? 5195); // own port: the shared dev Home stays on :5194

/**
 * Kiorly Home E2E (ADR-038). Real stack pieces: the real dev IdP code on a throwaway schema (:4455), the real Home app on its dev
 * server (:5195, same-origin /idp proxy to the throwaway IdP). Product web origins (5174/5192/5193) are intercepted with stub pages so
 * the test asserts WHERE Home sends the browser without depending on another team's in-flight product work. System Chrome, no downloads.
 */
export default defineConfig({
  testDir: '.', testMatch: /^(?!.*\.real\.).*\.spec\.ts$/, timeout: 60_000, expect: { timeout: 10_000 }, fullyParallel: false, workers: 1, reporter: [['list']], outputDir: './.results',
  use: { baseURL: `http://localhost:${HOME}`, channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure', timezoneId: 'Africa/Cairo', locale: 'en-US' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: [
    { command: 'npx tsx apps/kiorly-home/e2e/server.ts', cwd: '../../..', url: `http://localhost:${IDP}/healthz`, reuseExistingServer: false, timeout: 60_000, stdout: 'pipe' },
    { command: `npx vite --port ${HOME} --strictPort`, cwd: '..', url: `http://localhost:${HOME}/signin`, reuseExistingServer: false, timeout: 60_000, stdout: 'pipe',
      env: { VITE_PASSPORT_ISSUER: `http://localhost:${IDP}`, KX_IDP_PROXY_TARGET: `http://localhost:${IDP}`, KX_ENV: 'local', KX_HOME_PORT: String(HOME), KX_HOME_ORIGIN: `http://localhost:${HOME}` } },
  ],
});
