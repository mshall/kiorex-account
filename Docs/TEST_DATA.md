# Test data — Kiorex Passport (DEV ONLY)

> **DEV ONLY / synthetic.** Fictional names, phones `+20100000xxxx`, e-mails `@demo.kiorex.test`. Passwords and OTPs here are local dev values, blocked in production.
> No tax-authority integration; VAT is a plain configurable line. Messaging/PSP/video are mocked. Cross-product index: `TEST_DATA.md` in the workspace root (`kiorex-v2/`).

## Run / reset
```bash
npm run db:seed:demo                       # = npx tsx scripts/seed-demo.ts  (idempotent)
npx tsx scripts/seed-demo.ts --reset       # removes only demo records (subs 01HZKXD*, org_demo_*, demo_* ids) then re-creates
```
`config/seed-users.json` holds the login users (read by the dev IdP at boot for the OTP `000000` test-number list: restart the IdP after adding numbers; `scripts/seed-all.sh` does that). `config/seed-demo.json` holds dependants, guardian links, organisations, an invitation and a pending link request. Dev DB `kiorex_account`.
## Logins (phone OTP `000000`) — http://localhost:4400/account
| Phone | Persona | Notes |
|---|---|---|
| +201000001001 | Hoda Mahmoud / هدى محمود | guardian of Yassin (8y) + Laila (4y) |
| +201000001002 | Samir Ali Nassar / سمير علي نصار | co-guardian of Yassin |
| +201000001003 | Karim Mostafa / كريم مصطفى | legal guardian of Salma (15y, court-order ref) |
| +201000001005 | Mahmoud El-Sayed / محمود السيد | guardian of Adam (2y) |
| +201000001004, 1006…1012 | Nourhan, Mariam, Omar, Dalia, Tarek, Heba, Youssef, Rana | patients; 1011/1009 have a pending account-link request (ops queue) |
| +201000002001 | Ahmed Fawzy | owner of org *Nile Care Medical Center (DEMO)* |
| +201000002002 / 2003 | Sara Lotfy / Dr Amr Salem | receptionist / doctor members |
| +201000002004 / 2005 | Mostafa Reda / Dina Wagdy | pharmacist (Delta Pharmacy) / lab technician (Cairo Diagnostics) |
| +201000000099 | Ops super admin | TOTP `<local seed +201000000099>` |
| +201000009001 / 9002 / 9003 | Ops admin / finance / support | TOTP `<local seed +201000009001>` / `<local seed +201000009002>` / none |
| +201000000001 / 0002 | Amira / Hassan | e2e fixtures, unchanged |
Pages: `/account/family` (guardian links, act-as), `/account/orgs` (memberships; pending invite for `+201000001010`, token `demo-invite-nile-nurse`), `/account/security` (demo sessions for 1001, 1005), `/account/ops/links` (ops reviewer queue). OTP codes are also visible at `/dev/inbox`. Dependant accounts have no phone/login by design.

## Rev 2.3 additions (Kiorly Nurse personas)
Accounts (phone OTP `000000`, restart the dev IdP after a first run so the test-number list includes them; seed-all.sh does): `+201000003001` Mona Adel (solo nurse), `3002` agency owner, `3003` dispatcher Dina, `3004`/`3005`/`3007`/`3008`/`3009` agency nurses, `3006` aide, `3010` Dr Mai Hassan (physiotherapist), `3011` Noha Nurse (pending invitation, token `demo-invite-agency-nurse`), and patient `+201000001013` Nabila Hamdy.
Organisations with `edition` (display hint, KA-14): `org_demo_mona_nursing` (NURSE, owner Mona), `org_demo_care_agency` (NURSE: owner, dispatcher, 5 nurses, assistant; Mona is also a `nurse` member = multi-edition memberships), `org_demo_nile_care` gains the physiotherapist Mai (CLINIC). Role hints: owner, dispatcher, nurse, assistant, physiotherapist.

## Seeding staging on AWS (non-production only; written, never applied)
Nothing here deploys anything. A human first deploys the staging stacks and pushes the seed images, then seeds by hand:
1. `enable_demo_seed = true` is set **only** in the staging `terraform.tfvars` (default `false`; prod `false` and a stray `true` fails the plan). For Passport it creates only an IAM policy (and an optional assumable role), no Lambda: see point 4. OpenTofu never creates users.
2. Deploy the staging Cognito stack as usual (`tofu apply` by a human).
3. From the workspace root run `scripts/seed-staging.sh --dry-run` (prints the plan), then `scripts/seed-staging.sh --yes` (order: Passport Cognito users, Kiorly Clinic, Pharmacy, Lab, Kiorex provider sync, Kiorex). `--reset` removes and re-creates the demo records only; `--only lab,kiorex` re-runs selected steps. The script refuses any AWS account other than the staging one. Single product: `tofu output demo_seed_invoke`.
4. Passport on AWS is Cognito: no Lambda and no account DB. `scripts/seed-cognito-demo.mjs --user-pool-id <pool> [--dry-run] [--reset] --out .seed/cognito-sub-map.json` (AWS SDK only inside `scripts/adapters/cognito-adapter.mjs`) creates the demo personas of `config/seed-users.json` (verified phone, name, locale, `custom:kx_roles`, random permanent password that is never shown; sign-in is phone OTP `000000`, accepted for the numbers in the staging `test_phone_numbers`, which now lists every demo persona). It refuses a pool whose name/tags look like production, and anything but `DEMO_SEED_ALLOWED=true` + `KIORLY_ENV=staging`. IAM: `enable_demo_seed = true` (staging tfvars) creates the least-privilege policy `<name>-cognito-demo-seed` (Describe/Create/Get/SetPassword/UpdateAttributes/Delete on that pool only) and, if `demo_seed_principal_arns` is set, an assumable role; the prod stack fails the plan if `enable_demo_seed = true`. Ops users must enrol TOTP in the Passport UI on first sign-in (the dev TOTP secrets are not valid in Cognito).
**Guard (every seed entrypoint, `src/common/demo-seed-guard.ts`; `scripts/demo-seed-guard.ts` in kiorex-account):** the demo seed runs only when `DEMO_SEED_ALLOWED=true` **and** the environment is declared non-production (`KIORLY_ENV` / `KIOREX_ENV` / `ENV_TAG`, the `Env` tag OpenTofu sets; `NODE_ENV` is only a fallback because staging containers run with `NODE_ENV=production`). It fails closed: any variable saying prod/production/live, an unknown environment name, an undeclared environment under `NODE_ENV=production`, a database whose host/name looks like production, or any "allow in prod" override all refuse. It logs a banner (environment + database name, never credentials). Local `npm run` scripts set `DEMO_SEED_ALLOWED=true` for you; `scripts/seed-all.sh` also sets `KIORLY_ENV=local`. Tests: `demo-seed-guard.node.test.ts` (jest/vitest equivalent in platform/account).
Mock providers stay mock on staging (`MODE=mock`, PSP `sandbox-fake`, messaging `log`), so every seeded flow works without real providers. Cognito generates user subs, so the Passport step writes a phone-to-sub map that the Clinic / Pharmacy / Kiorex seeds take as `DEMO_SUB_MAP_JSON` (seed-staging.sh passes it). Families, organisations, invitations, link requests and TOTP of the Passport demo exist only in the local dev IdP DB (the AWS Passport stack is Cognito only): on staging the guardian/org Passport screens are not seeded.
Known limits: Kiorex's provider sync and the Nurse-lab push-back call Kiorly Clinic/Lab over HTTPS and need the egress path HB07 from the isolated subnets (until then those steps warn and the Kiorex data is seeded without the clinic mirror). Seeding Kiorex needs the platform's `KIORLY_CLIENT_KEY/SECRET` runtime secrets. The seed images could not be built in this session (Docker daemon not running): build them once before the first run.

## Q10 additions: guardian / invitation / linking / security states (`config/seed-demo.json`, `scripts/seed-demo.ts`)
- **Fix:** the four dependants (Yassin, Laila, Salma, Adam) used subs `...3001-3004`, which are also Mona/agency owner/dispatcher/Heba, so a re-seed turned the Nurse accounts into children. Dependants now use `01HZKXD...4001-4007`; run `scripts/seed-all.sh --reset` once on an existing DB.
- **Guardian links, every state:** active x5 (Hoda -> Yassin, Laila; Samir -> Yassin; Karim -> Salma, court order; Mahmoud -> Adam), `demo_gl_06` **ended** (Tarek `+201000001009` -> Zeina, guardian request), `demo_gl_07` **expired** (Omar `+201000001007` -> Kareem, 17y), `demo_gl_08` **pending** evidence review (Dalia `+201000001008` -> Mariam, court order ref).
- **Invitations:** pending x2 (`demo-invite-nile-nurse`, `demo-invite-agency-nurse`), **consumed** (`demo-invite-consumed`), **expired** (`demo-invite-expired`), **revoked** (`demo-invite-revoked`). Ended membership: Youssef (`+201000001011`) at Nile Care.
- **Account linking:** pending_review (ops queue), pending_verification, rejected (with reviewer note), cancelled.
- **Security / step-up:** passkeys listed for Hoda and Ahmed Fawzy (synthetic, cannot sign in), security events (step-up success 3 min ago, step-up failed, session revoked), demo sessions for Hoda and Mahmoud; ops accounts need the TOTP step-up (see the root TEST_DATA.md).

## Kiorly Home personas (ADR-038, DEV ONLY)
OTP `000000`. `+201000002031` Demo Multi-Workspace Owner (member of Nile Care as doctor, Delta Pharmacy as pharmacist, Cairo Lab as lab technician: three workspaces, picker). `+201000002032` Demo No-Workspace Newcomer (no organisation: Create or join). One-workspace staff: `+201000002001` (Clinic), `+201000002004` (Pharmacy), `+201000002005` (Lab); `+201000003001` Mona (Nurse edition). Demo organisations carry `product_refs` (`kiorly_clinic_tenant_id=na`, `kiorly_pharmacy_tenant_id=org_demo_kiorly`, `kiorly_lab_tenant_id=demo-lab`) so the workspace endpoint derives the product.



**Tagging and removal:** every seeded person, dependant and organisation carries `data_class = 'DEMO'`. `npm run demo-data:remove -- --dry-run` lists what would go, `--confirm` deletes it (never a REAL row; idempotent). See `Docs/IDENTITY_PROMOTION.md`.
