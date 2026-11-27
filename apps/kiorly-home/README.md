# Kiorly Home (ADR-038)

One web sign-in for Kiorly Clinic, Nurse, Pharmacy and Lab, with parity to the Kiorly mobile sign-in (ADR-038, amended 24 Nov 2026). Static Vite React app, route `/signin`. Production `https://www.kiorly.com/signin`, local http://localhost:5194/signin. Passport client `kiorly-home` (public, code + PKCE).

Screen: header (Kiorly lockup, AR/EN, "One sign-in for Clinic, Nurse, Pharmacy and Lab"), card "Sign in" with four tiles (last choice remembered in `kh.last`; `?to=pharmacy`, `/signin/lab`, `?product=nurse` preselect; `?switch=1` shows a note), then two methods (the last one that signed in is remembered in `kh.method`):
* **Kiorex Passport** (default): PKCE at Home, then `<product>/login?sso=passport&from=kiorly-home[&edition=NURSE]`; the product finishes its own silent code flow (no second OTP). After the callback Home asks Passport for the workspaces only to show a hint when the person has exactly one workspace that is not the chosen tile (both options offered, never a block).
* **Password**: single-use HANDOFF. Home posts to the chosen product API `POST <api>/api/v1/auth/handoff/login` (Clinic and Nurse: e-mail + password, Nurse adds `edition: NURSE`; Pharmacy: e-mail + password; Lab: organisation slug + e-mail, it has no passwords) and gets a 30-second one-time code, never a token. The browser goes to `<product>/login?handoff=<code>`; the product web redeems it once with `POST /auth/handoff/exchange`. `status: FALLBACK` (second factor etc.) goes to `<product>/login?reason=mfa`. The API base per tile comes from `config/domains.json` (`api`); the product APIs must list Home's origin in `KIORLY_HOME_ORIGINS` (local default http://localhost:5194 outside production).
Layout (responsive, ADR-038 amendment 24 Nov 2026): phone (<768) the compact mobile layout; tablet (768-1023) one centred column (680px) under the gradient band, tiles in one row of four; desktop (>=1024) split screen: branded panel on the start side (headline "One sign-in for your whole workplace", the four products, "Secure sign-in with Kiorex Passport", pulse motif, "by Kiorex") and the sign-in card centred on the other side (440-520px, tiles 2x2; 560px and one row of four from 1800px). Language (globe + AR/EN) and theme (Sun / Moon / Monitor icon buttons, arrow keys) controls sit in the top bar from 768px up and in the footer on phones; both are 40px+ targets with focus rings. Container queries pick the tile layout, fluid `clamp()` type and spacing, reduced-motion safe. The dev panel is a collapsed drawer (bottom end, overlay) on desktop and stays inline below 1024px.
Sign-out: RP-initiated logout with `id_token_hint`, back to Home. Never asks for a phone or e-mail before verification. Light default theme (Light / Dark / System in the footer, stored in `kh.theme`), AR/EN RTL, axe-clean, 360 px up to 2560 px.

```bash
npm run dev -w @kiorex/kiorly-home                 # http://localhost:5194/signin  (Passport on :4400, proxied at /idp)
npm run build -w @kiorex/kiorly-home               # KX_ENV=staging|production selects the domain table; KX_ENV=dev reads every origin from env (see Docs/DEPLOY_DEV.md)
npm run check:bundle -w @kiorex/kiorly-home        # no dev panel, no localhost in a production build
npx vitest run apps/kiorly-home                    # unit tests
npm run test:e2e -w @kiorex/kiorly-home            # Playwright (system Chrome), throwaway IdP on :4455, Home on :5194
```
The Passport client is registered in `config/idp.json`; restart the dev IdP once to pick it up (`e2e/scripts/up.sh --restart --only=passport`).

## Demo data
No demo or test-user content is rendered in any build (no quick-pick panel, no demo logins, no OTP hints). Seeded demo accounts live in the seed files only; sign in by typing the credentials. `npm run check:bundle` asserts it.

## Tests
* `npx vitest run apps/kiorly-home` : decisions, handoff redirect mapping, request shape per product (no Lab password), i18n parity.
* `npm run test:e2e -w @kiorex/kiorly-home` : 30 Playwright scenarios on its own port :5195 with a throwaway IdP :4455 and stubbed product webs/APIs (layout parity, deep links, icon controls, handoff per tile, errors, FALLBACK, Passport per persona, hint, sign-out, dev panel, AR RTL, dark, axe, 360 px, theme).
* `e2e/responsive.spec.ts` (in the same run): the viewport matrix 360, 390, 768, 1024, 1280, 1366x768, 1280x600, 1440, 1920, 2560 (+ Arabic and dark at 390/768/1024/1440, zoom 125-200%) with axe, no-horizontal-overflow and layout-mode assertions, keyboard focus order, reduced motion and the dev drawer. Screenshots and a contact sheet per viewport go to `KX_SHOTS_DIR` (default `e2e/.results/shots`).
* `npm run test:e2e:real -w @kiorex/kiorly-home` : both methods for all four tiles against the real seeded Clinic, Pharmacy and Lab (replay 401, wrong product/origin, 30 s expiry, second-factor fallback, hint, sign-out). If another checkout owns :5174/:3010: run this workspace's Clinic web on :5184 and API on :3011 and set `KX_CLINIC_WEB=http://localhost:5184 KX_CLINIC_API=http://localhost:3011` (Passport client `kiorly-clinic` registers :5184 as a dev fallback; Home reads a DEV-only `kh.dev.env` override that the test sets).
