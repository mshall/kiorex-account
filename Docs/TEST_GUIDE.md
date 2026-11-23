# Kiorex Passport test guide (DEV ONLY)

> **DEV ONLY / synthetic.** All names, phones, e-mails, passwords, OTPs and TOTP seeds below are fake values for the local stack; they are refused when `NODE_ENV=production` and the sign-in quick-pick ("Test users (dev only)") is not in production builds. Providers are mocked (dev inbox / logs, PSP `sandbox-fake`, video `mock`). No tax-authority integration.
> This guide is the repo's slice of the workspace guide `TEST_GUIDE.md` (parent folder `kiorex-v2/`, not part of this repository). Facts verified against the seeds and dev databases on 23 Nov 2026.

## Run the stack and seed it

```bash
# from the workspace root (kiorex-v2/): Postgres :5433 + the five APIs (Passport :4400, Kiorly :3010, Kiorex :4000, Pharmacy :3100, Lab :3200)
e2e/scripts/up.sh --build --seed      # first time; later just e2e/scripts/up.sh (stop: e2e/scripts/down.sh)
scripts/seed-all.sh                   # idempotent demo data in dependency order (--reset re-creates demo rows only)
```
One service only: `e2e/scripts/up.sh --restart --only=passport|kiorly|kiorex|pharmacy|lab > /tmp/up.log 2>&1`. Never touch ports 3000 / 5173 / 5175. Tests you run change data (a cancel stays cancelled): re-seed for the starting state.

```bash
cd kiorex-account
npm run db:seed:demo                 # 40 accounts, families, orgs, invitations, ops TOTP rows (idempotent)
npx tsx scripts/seed-demo.ts --reset # re-create demo records
npm test                             # vitest (incl. dev-test-users.test.ts)
```

URLs: sign-in and account pages http://localhost:4400/account, dev inbox http://localhost:4400/dev/inbox (OTP messages), OIDC discovery http://localhost:4400/.well-known/openid-configuration; clients: patient web :5180, ops console :5181, patient app :8081, Kiorly Clinic / Pharmacy / Lab web, staff app.

## The Test users (dev only) panel

Rendered by `apps/dev-idp/src/dev-test-users.ts` on the phone, code and ops TOTP pages, built from `config/seed-users.json` (groups: Patients, Provider staff, Nurse edition, Ops). A chip submits the phone, the code page fills `000000` and verifies, and for ops the TOTP page shows the **current code** (computed from the stored seed by the dev IdP) with a one-click fill, plus the **seed with a copy button**. A client may pass `login_hint=<seeded phone>` (the patient app does) to pre-fill and auto-submit once. Shown only when `NODE_ENV` is not production and `KX_DEV_TEST_USERS` is not `false`; the dev IdP also refuses to start in production. English and Arabic (RTL), light and dark, phone width. Covered by `apps/dev-idp/test/dev-test-users.test.ts`.

Dev-only secrets: Passport OTP for every seeded phone **`000000`**; staff password **`Demo@12345`** (older Clinic accounts `admin@kiorly.com`, `superadmin@kiorly.com`, `admin@drahmedshall.com`: **`demo`**); Lab dev-login has no password; Postgres `postgres` / `postgres`.

## Test users: 3.1 Passport phones (OTP `000000`)

| Phone | Name | Use it for |
|---|---|---|
| `+201000001001` | Hoda Mahmoud / هدى محمود | richest history: completed visits, expired hold, 2 dependants (Yassin 8y, Laila 4y), 4 addresses, home bookings with Mona, an OFFERED waitlist entry, telemedicine ENDED, pharmacy order PENDING_PAYMENT |
| `+201000001002` | Samir Ali Nassar | co-guardian of Yassin; `mk03` CONFIRMED with deposit PAID (cancel/refund test); telemedicine WAITING; pharmacy PAID |
| `+201000001003` | Karim Mostafa | guardian of Salma (15y, court order); pharmacy REJECTED; physio |
| `+201000001004` | Nourhan Fathy / نورهان فتحي | pharmacy order `kx_ph_demo_4` READY; `mk26` pending clinic; lab `kx_lb_demo_1` PENDING_PAYMENT |
| `+201000001005` | Mahmoud El-Sayed / محمود السيد | cardiology, guardian of Adam (2y), uploaded ECG, 10-session physio series, care-plan request |
| `+201000001006` | Mariam Adel | `mk05` CONFIRMED (reschedule), telemedicine SCHEDULED, pharmacy DISPENSED, lab SUBMITTED |
| `+201000001007` | Omar Hegazy | lab `kx_lb_demo_4` COLLECTED (release it in Lab), pharmacy REJECTED |
| `+201000001008` | Dalia Ibrahim | **no-show with forfeited deposit** (`mk06`), lab result released, pharmacy CANCELLED |
| `+201000001009` | Tarek Zaki | **checked-in** today (`mk09`), lab result released; Passport link request `pending_review` |
| `+201000001010` | Heba Salah | cancelled and refunded (`mk12`); pending Nile Care nurse invitation |
| `+201000001011` / `…1012` / `…1013` | Youssef Ramadan / Rana Khaled / Nabila Hamdy | dentistry + lab cancelled / refunded, agency client / home-care plan `kx_cp_demo_1` (10 visits, 4 done) |
| `+201000000001` / `…0002` | Amira (ar) / Hassan (en) | plain patients |
| `+201000002001` .. `…2010` | Ahmed Fawzy (Nile Care owner), Sara, Dr Amr Salem, Mostafa Reda (pharmacist), Dina Wagdy (lab tech), Dr Nadia Fouad, Demo Pharmacy Owner, Omar Cashier, Dr Salma (lab signatory), Demo Lab Owner | provider-side people with a Passport identity (organisations, invitations, Sign in with Kiorex Passport on Kiorly) |
| `+201000003001` .. `…3011` | Mona (solo nurse), Agency Owner, Dina Dispatcher, Heba / Salma / Aya / Nadine / Rawan / Yara, Dr Mai Hassan (physio), Noha (pending invite) | Nurse edition personas; `…3004` Heba is the verified agency nurse |

### 3.2 Ops console (Passport phone + `000000` + authenticator code)

| Phone | Role | TOTP seed (Base32, DEV ONLY) |
|---|---|---|
| `+201000000099` | Ops **super admin** (flags, gates, two-person approvals) | `REMOVED-OLD-DEMO-TOTP-SECRET` |
| `+201000009001` | Ops admin (everything except changing flags) | `REMOVED-OLD-DEMO-TOTP-SECRET` |
| `+201000009002` | Ops finance (role claim only; API treats it as `ops_admin`) | `REMOVED-OLD-DEMO-TOTP-SECRET` |
| `+201000009003` | Ops support (claim only) | none seeded: it enrols a new authenticator on first sign-in (the page shows the setup key) |

The Passport dev panel computes the current code for you (the dev IdP knows the seed). To do it by hand: any authenticator app with the seed, or `node -e "console.log(require('otplib').generateSync({secret:'REMOVED-OLD-DEMO-TOTP-SECRET',strategy:'totp'}))"` from `kiorex-account/`. A code can be used once: if "wrong code" appears right after a quick sign-in, wait for the next 30-second code.

## Flows

### 4.1 Passport sign-in, sign-out and account pages (P1-P9)

1. **Sign in (patient).** Open http://localhost:5180 and press Sign in (or open http://localhost:4400/account). On Passport tap the chip **Hoda Mahmoud**. *Expected:* you land back signed in as Hoda; the code is also in http://localhost:4400/dev/inbox.
2. **By hand.** Enter `+201000001001`, continue, enter `000000`, choose "Not now" for the passkey. Same result. A wrong code shows an inline error with the attempts left; asking for a code six times for one phone is refused (5 per hour; `npm run db:reset` in `kiorex-account` clears it).
3. **Sign out.** In the patient web account menu choose Sign out. *Expected:* back signed out, and the Passport session ends too (pressing Sign in shows the phone page again, not an automatic sign-in).
4. **Family.** Chip Hoda, http://localhost:4400/account/family: Yassin and Laila active with "act as"; chip Samir shows Yassin as co-guardian; Karim shows Salma (court-order evidence); Tarek shows Zeina ended; dependants have no phone, so nothing to sign in with.
5. **Organisations.** Chip Ahmed Fawzy (`+201000002001`): `/account/orgs` lists Nile Care with members and invitations (pending, consumed, expired, with masked phones). Chip Heba Salah (`+201000001010`): accept the pending nurse invitation (token `demo-invite-nile-nurse`) and she becomes a nurse member (re-seed to repeat). Chip Mona (`+201000003001`): two organisations (solo and agency).
6. **Security.** Chip Hoda, `/account/security`: two synthetic passkeys, sessions (revoke one), events; revoking all sessions asks for step-up.
7. **Ops link review.** Chip Ops super admin, `/account/ops/links`: one pending request (secondary `+201000001009`). Do not approve unless you intend to change data.

More: `DEMO_DATA.md` (P1-P9), `Docs/TEST_DATA.md`.
