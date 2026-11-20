# passport-ui

The Kiorex Passport self-service web app (React 19, Arabic default plus English, RTL, dark mode, WCAG 2.1 AA). It has no build step: the dev IdP bundles it in memory with esbuild and serves it at `http://localhost:4400/account`. It signs in as the public client `kiorex-passport-web` (PKCE) and calls only the documented `/api` endpoints. Back to the [README](../../README.md).

Pages: account home, security (passkeys, authenticator app, sessions, activity), family and guardians, linked accounts, organisations, data and privacy, connected apps, step-up, and the ops link-review queue.

```bash
npm run dev            # at the repo root, then open http://localhost:4400/account
npm test               # includes the UI tests (jsdom, axe, AR/EN key parity)
npm run test:e2e       # Playwright on system Chrome
```

Wording that needs legal or clinical review is marked "Draft wording" in the UI and tracked in [Docs/NEEDS_HUMAN.md](../../Docs/NEEDS_HUMAN.md). Brand kit is vendored under `src/brand/`; re-vendor when `../_brand` changes and never redraw the logo.
