# Kiorly Home (ADR-038)

One web sign-in for Kiorly Clinic, Nurse, Pharmacy and Lab. Static Vite React app, route `/signin`. Production `https://www.kiorly.com/signin`, local http://localhost:5194/signin. Passport client `kiorly-home` (public, code + PKCE).

Flow: **Sign in with Kiorex Passport first** (phone OTP or passkey), then Home calls `GET /api/workspaces` and shows cards. One workspace skips the picker; several show the picker (last used first); none shows Create or join (each product's existing sign-up); `?to=pharmacy` or `/signin/lab` bypasses the picker; `?switch=1` always shows it. Home redirects to `<product>/login?sso=passport&from=kiorly-home[&edition=NURSE]`; the product completes its own silent Passport code flow. Sign-out ends the Passport session (RP-initiated logout with `id_token_hint`) and returns to Home. Never reveals which products a phone number belongs to before the code is verified. Patients are not part of it.

```bash
npm run dev -w @kiorex/kiorly-home                 # http://localhost:5194/signin  (Passport on :4400, proxied at /idp)
npm run build -w @kiorex/kiorly-home               # KX_ENV=staging|production selects the domain table
npm run check:bundle -w @kiorex/kiorly-home        # no dev panel, no localhost in a production build
npx vitest run apps/kiorly-home                    # unit tests
npm run test:e2e -w @kiorex/kiorly-home            # Playwright (system Chrome), throwaway IdP on :4455, Home on :5194
```
The Passport client is registered in `config/idp.json`; restart the dev IdP once to pick it up (`e2e/scripts/up.sh --restart --only=passport`).

## Test users (dev only)
Panel on the signed-out screen (absent from production bundles): click a persona to start the Passport sign-in with the phone filled in (dev code 000000).
| Persona | Phone | Result |
|---|---|---|
| Ahmed Fawzy (Nile Care owner) | +201000002001 | one workspace: Clinic, auto-route |
| Mostafa Reda (pharmacist) | +201000002004 | one workspace: Pharmacy |
| دينا وجدي (lab technician) | +201000002005 | one workspace: Lab |
| Mona Adel (solo nurse + agency) | +201000003001 | one card: Nurse (edition NURSE) |
| Demo Multi-Workspace Owner | +201000002031 | picker: Clinic, Pharmacy, Lab |
| Demo No-Workspace Newcomer | +201000002032 | Create or join |

## Test guide
Manual: start Passport (:4400, seeded with `scripts/seed-demo.sh`), `npm run dev`, open /signin, pick each persona above; try `/signin?to=lab`, `/signin?switch=1`, Arabic (RTL) and dark theme; sign out and confirm the next sign-in asks for the phone again.
Automated: `test/core.test.ts` (decisions, URLs, i18n parity), `apps/dev-idp/test/workspaces.test.ts` (endpoint), `test/domains.test.ts` (domain table and client registrations), `e2e/home.spec.ts` (10 browser scenarios incl. axe on picker, empty state and Arabic dark).
