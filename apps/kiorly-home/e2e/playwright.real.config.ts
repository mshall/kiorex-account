import { defineConfig, devices } from '@playwright/test';

/**
 * Kiorly Home against the REAL local stack (ADR-038): the shared dev Passport :4400, the real Clinic (web :5174 + API :3010), Pharmacy
 * (:5192 + :3100) and Lab (:5193 + :3200), all seeded (`scripts/seed-all.sh`). Home runs on its dev server :5194 (reused when already up).
 * Nothing is stubbed: the products complete their own Passport code flow and their own bootstrap. Run:
 *   npm run test:e2e:real -w @kiorex/kiorly-home
 */
const HOME = 5194;
export default defineConfig({
  testDir: '.', testMatch: /.*\.real\.spec\.ts/, timeout: 120_000, expect: { timeout: 20_000 }, fullyParallel: false, workers: 1, reporter: [['list']], outputDir: './.results-real',
  use: { baseURL: `http://localhost:${HOME}`, channel: 'chrome', trace: 'retain-on-failure', screenshot: 'only-on-failure', timezoneId: 'Africa/Cairo', locale: 'en-US' },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: { command: `npx vite --port ${HOME} --strictPort`, cwd: '..', url: `http://localhost:${HOME}/signin`, reuseExistingServer: true, timeout: 60_000, stdout: 'pipe',
    env: { VITE_PASSPORT_ISSUER: 'http://localhost:4400', KX_IDP_PROXY_TARGET: 'http://localhost:4400', KX_ENV: 'local' } },
});
