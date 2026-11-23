# Kiorly Home (ADR-038)

One web sign-in for Kiorly Clinic, Nurse, Pharmacy and Lab, with parity to the Kiorly mobile sign-in (ADR-038, amended 24 Nov 2026). Static Vite React app, route `/signin`. Production `https://www.kiorly.com/signin`, local http://localhost:5194/signin. Passport client `kiorly-home` (public, code + PKCE).

Screen: header (Kiorly lockup, AR/EN, "One sign-in for Clinic, Nurse, Pharmacy and Lab"), card "Sign in" with four tiles (last choice remembered in `kh.last`; `?to=pharmacy`, `/signin/lab`, `?product=nurse` preselect; `?switch=1` shows a note), then two methods (the last one that signed in is remembered in `kh.method`):
* **Kiorex Passport** (default): PKCE at Home, then `<product>/login?sso=passport&from=kiorly-home[&edition=NURSE]`; the product finishes its own silent code flow (no second OTP). After the callback Home asks Passport for the workspaces only to show a hint when the person has exactly one workspace that is not the chosen tile (both options offered, never a block).
* **Password**: single-use HANDOFF. Home posts to the chosen product API `POST <api>/api/v1/auth/handoff/login` (Clinic and Nurse: e-mail + password, Nurse adds `edition: NURSE`; Pharmacy: e-mail + password; Lab: organisation slug + e-mail, it has no passwords) and gets a 30-second one-time code, never a token. The browser goes to `<product>/login?handoff=<code>`; the product web redeems it once with `POST /auth/handoff/exchange`. `status: FALLBACK` (second factor etc.) goes to `<product>/login?reason=mfa`. The API base per tile comes from `config/domains.json` (`api`); the product APIs must list Home's origin in `KIORLY_HOME_ORIGINS` (local default http://localhost:5194 outside production).
Sign-out: RP-initiated logout with `id_token_hint`, back to Home. Never asks for a phone or e-mail before verification. Light default theme (Light / Dark / System in the footer, stored in `kh.theme`), AR/EN RTL, axe-clean, down to 360 px.

```bash
npm run dev -w @kiorex/kiorly-home                 # http://localhost:5194/signin  (Passport on :4400, proxied at /idp)
npm run build -w @kiorex/kiorly-home               # KX_ENV=staging|production selects the domain table
npm run check:bundle -w @kiorex/kiorly-home        # no dev panel, no localhost in a production build
npx vitest run apps/kiorly-home                    # unit tests
npm run test:e2e -w @kiorex/kiorly-home            # Playwright (system Chrome), throwaway IdP on :4455, Home on :5194
```
The Passport client is registered in `config/idp.json`; restart the dev IdP once to pick it up (`e2e/scripts/up.sh --restart --only=passport`).

## Test users (dev only)
Panel under the card (absent from production bundles). **Kiorex Passport**: six personas (Ahmed Fawzy +201000002001 Clinic, Mostafa Reda +201000002004 Pharmacy, دينا وجدي +201000002005 Lab, Mona Adel +201000003001 Nurse, multi-workspace +201000002031, no-workspace +201000002032; dev code 000000): a click starts the Passport sign-in with the phone filled and selects the persona's tile. **Password**: the logins of the chosen tile (Clinic 21, Nurse 5, Pharmacy 15, Lab 27 = 3 orgs x 9 roles; password `Demo@12345`, older Clinic demo accounts `demo`, Lab none): a click switches to Password and fills the form.

## Tests
* `npx vitest run apps/kiorly-home` : decisions, handoff redirect mapping, request shape per product (no Lab password), i18n parity.
* `npm run test:e2e -w @kiorex/kiorly-home` : 30 Playwright scenarios on its own port :5195 with a throwaway IdP :4455 and stubbed product webs/APIs (layout parity, deep links, handoff per tile, errors, FALLBACK, Passport per persona, hint, sign-out, dev panel, AR RTL, dark, axe, 360 px, theme).
* `npm run test:e2e:real -w @kiorex/kiorly-home` : both methods for all four tiles against the real seeded Clinic, Pharmacy and Lab (replay 401, wrong product/origin, 30 s expiry, second-factor fallback, hint, sign-out). If another checkout owns :5174/:3010: run this workspace's Clinic web on :5184 and API on :3011 and set `KX_CLINIC_WEB=http://localhost:5184 KX_CLINIC_API=http://localhost:3011` (Passport client `kiorly-clinic` registers :5184 as a dev fallback; Home reads a DEV-only `kh.dev.env` override that the test sets).
