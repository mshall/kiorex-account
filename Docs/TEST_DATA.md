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
| +201000000099 | Ops super admin | TOTP `REMOVED-OLD-DEMO-TOTP-SECRET` |
| +201000009001 / 9002 / 9003 | Ops admin / finance / support | TOTP `REMOVED-OLD-DEMO-TOTP-SECRET` / `REMOVED-OLD-DEMO-TOTP-SECRET` / none |
| +201000000001 / 0002 | Amira / Hassan | e2e fixtures, unchanged |
Pages: `/account/family` (guardian links, act-as), `/account/orgs` (memberships; pending invite for `+201000001010`, token `demo-invite-nile-nurse`), `/account/security` (demo sessions for 1001, 1005), `/account/ops/links` (ops reviewer queue). OTP codes are also visible at `/dev/inbox`. Dependant accounts have no phone/login by design.

## Rev 2.3 additions (Kiorly Nurse personas)
Accounts (phone OTP `000000`, restart the dev IdP after a first run so the test-number list includes them; seed-all.sh does): `+201000003001` Mona Adel (solo nurse), `3002` agency owner, `3003` dispatcher Dina, `3004`/`3005`/`3007`/`3008`/`3009` agency nurses, `3006` aide, `3010` Dr Mai Hassan (physiotherapist), `3011` Noha Nurse (pending invitation, token `demo-invite-agency-nurse`), and patient `+201000001013` Nabila Hamdy.
Organisations with `edition` (display hint, KA-14): `org_demo_mona_nursing` (NURSE, owner Mona), `org_demo_care_agency` (NURSE: owner, dispatcher, 5 nurses, assistant; Mona is also a `nurse` member = multi-edition memberships), `org_demo_nile_care` gains the physiotherapist Mai (CLINIC). Role hints: owner, dispatcher, nurse, assistant, physiotherapist.
