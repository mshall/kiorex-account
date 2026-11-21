# Kiorex Passport: demo data and manual test guide (DEV ONLY)

> **DEV ONLY / synthetic.** Every name, phone (`+20100000xxxx`), id and code below is fictional and local. The OTP `000000`, the TOTP seeds and the invitation tokens work **only** against the local dev IdP (it refuses to start when `NODE_ENV=production`; the demo seed refuses to run in production, see `scripts/demo-seed-guard.ts`). Workspace index of every demo: [../DEMO_DATA.md](../DEMO_DATA.md). Shared tables (passwords, URLs, persona map): [../TEST_DATA.md](../TEST_DATA.md). Seed-file reference: [Docs/TEST_DATA.md](Docs/TEST_DATA.md).
> Facts here were checked against the running stack and the `kiorex_account` database on 21 Nov 2026.

## 1. What this demo is for

Passport is the shared identity of the ecosystem (phone OTP, passkeys, guardian links for dependants, organisation memberships and invitations, account linking with operator review, step-up for ops). The demo gives one account per interesting state so each screen under `http://localhost:4400/account` can be seen and tested without creating anything: active / ended / expired / pending guardian links, pending / consumed / expired / revoked invitations, an ended membership, four link-request states, two multi-product organisations, a NURSE-edition solo and agency organisation, and ops accounts that need TOTP.

## 2. Start and seed

```bash
# whole stack (Postgres :5433, Passport :4400, Kiorly :3010, Kiorex :4000, Pharmacy :3100, Lab :3200)
e2e/scripts/up.sh                       # from the workspace root; add --build --seed on a fresh machine
# Passport only
cd kiorex-account && npm install && npm run dev        # dev IdP + Passport UI on http://localhost:4400
# demo data (idempotent)
cd kiorex-account && npm run db:seed:demo               # = DEMO_SEED_ALLOWED=true tsx scripts/seed-demo.ts
npx tsx scripts/seed-demo.ts --reset                    # removes ONLY demo records (subs 01HZKXD*, org_demo_*, demo_* ids) and re-creates them
scripts/seed-all.sh [--reset]                           # workspace root: every product in dependency order (do not run --reset while others use the stack)
```

* The dev IdP reads the login users from `config/seed-users.json` at boot to build its OTP `000000` test-number list. After a **first** seed, **restart the IdP** (`seed-all.sh` does it for you) or the new numbers get a random code (printed in the IdP log and in `/dev/inbox`).
* Dependants (`kind = dependant`) have no phone and never log in.
* Passport allows **5 OTP sends per phone per hour**. Clear the counters with `npm run db:reset` (this also drops dev sessions and tokens; do not run it while someone else is testing).
* URLs: UI `http://localhost:4400/account` · dev inbox `http://localhost:4400/dev/inbox` · OIDC discovery `/.well-known/openid-configuration` · second fake upstream IdP `:4401` (federation tests only).

## 3. Personas (all login at `http://localhost:4400/account`, phone OTP `000000` unless noted)

| Phone | Name | Account type / org | Why it exists |
|---|---|---|---|
| `+201000001001` | Hoda Mahmoud / هدى محمود | patient, guardian | mother of Yassin (8y) + Laila (4y); passkeys + sessions + security events; richest history |
| `+201000001002` | Samir Ali Nassar / سمير علي نصار | patient, guardian | co-guardian of Yassin |
| `+201000001003` | Karim Mostafa | patient, legal guardian | guardian of Salma (15y) by court order |
| `+201000001004` | Nourhan Fathy / نورهان فتحي | patient | plain patient |
| `+201000001005` | Mahmoud El-Sayed / محمود السيد | patient, guardian | guardian of Adam (2y); demo session |
| `+201000001006` | Mariam Adel | patient | invitation to Nile Care as receptionist already **consumed** |
| `+201000001007` | Omar Hegazy | patient | guardian link to Kareem (17y) **expired** 17 Nov; doctor invitation to Nile Care **expired**; link request **rejected** |
| `+201000001008` | Dalia Ibrahim / داليا إبراهيم | patient | guardian link to Mariam (9y) **pending** evidence review (court-order ref); a **cancelled** link request |
| `+201000001009` | Tarek Zaki | patient | guardian link to Zeina (6y) **ended**; secondary number of the **pending_review** link request (ops queue) |
| `+201000001010` | Heba Salah / هبة صلاح | patient | **pending invitation** to Nile Care as nurse (token `demo-invite-nile-nurse`); secondary of a **pending_verification** link request |
| `+201000001011` | Youssef Ramadan | patient | **ended** membership (receptionist) at Nile Care; a **revoked** pharmacist invitation to Delta Pharmacy |
| `+201000001012` | Rana Khaled / رنا خالد | patient | plain patient (Nurse-lab consent revoked in Kiorly) |
| `+201000001013` | Nabila Hamdy / نبيلة حمدي | patient | agency home-care client (care plan) |
| `+201000002001` | Ahmed Fawzy | owner, org **Nile Care Medical Center (DEMO)** (`org_demo_nile_care`, CLINIC) | org owner, sees members + sent invitations |
| `+201000002002` | Sara Lotfy / سارة لطفي | receptionist member, Nile Care | |
| `+201000002003` | Dr Amr Salem | doctor member, Nile Care | |
| `+201000002004` | Mostafa Reda | pharmacist member, **Delta Pharmacy Group (DEMO)** (`org_demo_delta_pharma`) | |
| `+201000002005` | Dina Wagdy / دينا وجدي | lab technician member, **Cairo Diagnostics Lab (DEMO)** (`org_demo_cairo_lab`) | |
| `+201000003001` | Mona Adel | **owner of Demo Home Nursing (Mona)** (`org_demo_mona_nursing`, NURSE) and `nurse` member of the agency | multi-edition memberships |
| `+201000003002` | Agency Owner | owner, **Demo Care Agency** (`org_demo_care_agency`, NURSE) | |
| `+201000003003` | Dina Dispatcher | dispatcher | |
| `+201000003004` / `3005` / `3007` / `3008` / `3009` | Heba / Salma / Nadine / Rawan / Yara Nurse | nurse members | verification states differ in Kiorly (verified / verified / rejected / expired / unverified) |
| `+201000003006` | Aya Aide | assistant | |
| `+201000003010` | Dr Mai Hassan | physiotherapist member of Nile Care | |
| `+201000003011` | Noha Nurse (pending invite) | none yet | **pending invitation** to the agency as nurse (token `demo-invite-agency-nurse`) |
| `+201000000001` / `0002` | Amira / Hassan | patients | **e2e fixtures, do not edit** (the e2e suite signs in as them) |
| `+201000000099` | Ops Super Admin | roles `ops_admin`, `super_admin` | OTP + **TOTP** `REMOVED-OLD-DEMO-TOTP-SECRET` (DEV ONLY) |
| `+201000009001` | Ops Admin Demo | `ops_admin` | OTP + TOTP `REMOVED-OLD-DEMO-TOTP-SECRET` |
| `+201000009002` | Ops Finance Demo | `ops_admin`, `finance` | OTP + TOTP `REMOVED-OLD-DEMO-TOTP-SECRET` |
| `+201000009003` | Ops Support Demo | `ops_admin`, `support` | OTP + TOTP **enrolment on first sign-in** (an unconfirmed credential exists, no seeded secret) |

Dependants (no login): Yassin Samir Ali `…4001`, Laila Samir Ali `…4002`, Salma Karim Mostafa `…4003`, Adam Mahmoud El-Sayed `…4004`, Zeina Tarek Zaki `…4005`, Kareem Omar Hegazy `…4006`, Mariam Dalia Ibrahim `…4007` (subs `01HZKXD00000000000000040xx`).
TOTP: add the secret to any authenticator app (Base32, SHA-1, 30 s, 6 digits). A code is accepted once per 30 s step.

## 4. What data exists (checked against `kiorex_account`)

| Thing | State | Where to see it |
|---|---|---|
| Guardian links `demo_gl_01`..`08` | 01 Hoda->Yassin, 02 Hoda->Laila, 03 Samir->Yassin, 04 Karim->Salma (legal guardian), 05 Mahmoud->Adam: **active** (valid to 2036-11-20) · 06 Tarek->Zeina **ended** · 07 Omar->Kareem **expired** (2026-11-17) · 08 Dalia->Mariam **pending** | `/account/family` as each guardian |
| Organisations | 5 demo: Nile Care (CLINIC), Delta Pharmacy Group (CLINIC), Cairo Diagnostics Lab (CLINIC), Demo Home Nursing (Mona) (NURSE), Demo Care Agency (NURSE) | `/account/orgs` |
| Memberships | Nile Care: owner Ahmed, receptionist Sara, doctor Dr Amr, physiotherapist Dr Mai, **ended** Youssef · Agency: owner, dispatcher, 5 nurses (Mona among them), assistant · Mona's own org: owner Mona · Delta Pharmacy: pharmacist Mostafa · Cairo Lab: technician Dina | `/account/orgs` as the owner |
| Invitations | pending x2 (`demo-invite-nile-nurse` -> `+201000001010`, `demo-invite-agency-nurse` -> `+201000003011`, both valid to 27 Nov), **consumed** (`demo-invite-consumed`, receptionist `…1006`), **expired** (`demo-invite-expired`, doctor `…1007`, 18 Nov), **revoked** (`demo-invite-revoked`, pharmacist `…1011`) | Orgs page: "invitations" and "sent" lists; `/account/orgs?invite=<token>` pre-fills the token |
| Account-link requests | **pending_review** (secondary `+201000001009`), **pending_verification** (`…1010`), **rejected** with reviewer note "Different people (demo)" (`…1007`), **cancelled** (`…1008`) | ops queue `/account/ops/links` (pending_review only); requester side: `/account/linked` |
| Security | synthetic passkeys for Hoda and Ahmed Fawzy (cannot sign in), security events (step-up success, step-up failed, session revoked), demo sessions for Hoda and Mahmoud | `/account/security` |

## 5. Manual test scripts

**P1. Patient phone-OTP sign-in.** 1) Open `http://localhost:4400/account`. 2) Enter `+201000001001`, press continue. 3) Enter `000000`. 4) Skip the passkey prompt. *Expected:* account home for "Hoda Mahmoud / هدى محمود"; the code is also visible at `/dev/inbox` (WhatsApp `kx_otp_*_mock`).

**P2. Wrong code / rate limit.** 1) Enter `+201000001004`, then `123456`. *Expected:* an inline error, no sign-in. 2) Request a code 6 times for the same phone. *Expected:* the sixth is refused (5 per hour); `npm run db:reset` clears it.

**P3. Guardian links (all states).** 1) Sign in as Hoda -> **Family**. *Expected:* Yassin and Laila active, "act as" available. 2) Sign in as Samir (`…1002`): Yassin shown as co-guardian. 3) Karim (`…1003`): Salma, legal guardian with court-order evidence. 4) Tarek (`…1009`): Zeina ended. 5) Omar (`…1007`): Kareem expired. 6) Dalia (`…1008`): Mariam pending review. *Expected:* each status badge matches section 4; an expired or ended link offers no act-as.

**P4. Organisation owner view.** 1) Sign in as Ahmed Fawzy (`+201000002001`) -> **Organisations**. *Expected:* Nile Care with members (Sara, Dr Amr, Dr Mai), the ended membership of Youssef, the sent invitations (pending / consumed / expired) with masked phones; revoke the pending one -> it becomes revoked (re-seed with `--reset` to restore).

**P5. Accept an invitation (changes data).** 1) Sign in as Heba (`+201000001010`) -> Organisations. 2) The pending Nile Care nurse invitation is listed; or paste `demo-invite-nile-nurse` into the token field. 3) Accept. *Expected:* Heba becomes a `nurse` member of Nile Care and the invitation turns consumed; for a fresh state run `npx tsx scripts/seed-demo.ts --reset`. Same for Noha (`…3011`) with `demo-invite-agency-nurse`.

**P6. Multi-edition membership.** 1) Sign in as Mona (`+201000003001`) -> Organisations. *Expected:* two organisations (her own solo NURSE org as owner, the agency as nurse) with the NURSE edition hint. 2) Agency owner (`…3002`): members list shows owner, dispatcher, 5 nurses, assistant.

**P7. Security page.** 1) Hoda -> **Security**. *Expected:* two synthetic passkeys, sessions list (revoke one -> removed), events (step-up success 3 min old, step-up failed, session revoked). A privileged action (e.g. revoking all sessions) asks for step-up.

**P8. Ops: TOTP step and link review.** 1) Sign in as `+201000000099`, `000000`. 2) TOTP prompt: enter the current code for `REMOVED-OLD-DEMO-TOTP-SECRET`. 3) Open `/account/ops/links`. *Expected:* exactly one pending request (secondary `+201000001009`). Approve/reject needs a fresh step-up; **do not approve** unless you want two demo accounts merged (merges are reversible only through the reviewed reverse action). 4) Repeat as `+201000009001` with its own secret: same queue. 5) `+201000009003`: after the OTP you are asked to enrol a TOTP (scan the QR, confirm) because no secret is seeded.

**P9. Dependant has no login.** Try to sign in with Yassin's sub or any phone: dependants have no phone, so there is nothing to enter; they only exist under their guardian's Family page.

## 6. What each role should and should not see

| Role | Should see | Should NOT see |
|---|---|---|
| Patient (Nourhan `…1004`) | Home, Family (empty), Organisations (empty), Security, Privacy, Linked accounts, Apps | `/account/ops/links` content (403 or empty), other people's links |
| Guardian (Hoda, Samir, Karim, Mahmoud) | Family with active dependants, act-as | dependants of other guardians; ended/expired links as actionable |
| Org owner (Ahmed, agency owner, Mona) | members, sent invitations, invite/revoke | other orgs' members |
| Org member (Sara, Dr Amr, Dina Dispatcher, nurses) | the org membership with their role hint | the invitations list of the org, invite/revoke buttons |
| Ops admin / finance / support | the ops queue after TOTP step-up | any action without a fresh step-up (`acr = mfa`) |
| Ops super admin | everything above | n/a (super_admin only additionally gates flag changes in the Kiorex ops console) |

## 7. Known limitations

* Mock providers: OTP, invitation and WhatsApp messages are written to the dev inbox and the IdP log (`.e2e/logs/passport.log`); nothing leaves the machine. The `/dev/inbox` page shows OTPs on purpose: dev only.
* Synthetic passkeys cannot authenticate; real passkey enrolment needs a platform authenticator in the browser.
* `finance` and `support` are role claims on the account; the Kiorex API and ops console treat every `ops_admin` alike (only `super_admin` is distinct), so finance/support behave as ops admin today.
* AWS staging uses Cognito: families, organisations, invitations, link requests and TOTP exist **only** in this local dev IdP (see the staging notes in `Docs/TEST_DATA.md`).
* `+201000000001/2` are shared with the e2e suite: do not change their accounts.
* Consuming or revoking an invitation (P4/P5) changes the seeded state; `scripts/seed-demo.ts --reset` brings it back.

---
Verified: 2026-11-21 (`kiorex_account` database via SELECT: 35 demo-range accounts, link requests `…1009` pending_review / `…1010` pending_verification / `…1007` rejected / `…1008` cancelled, TOTP rows for `…0099`, `…9001`, `…9002` confirmed and `…9003` unconfirmed).
