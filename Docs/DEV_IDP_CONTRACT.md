# Dev IdP and identity API reference

Moved out of the README to keep the landing page short. Dev-only values; production uses the managed IdP configured from `config/idp.json`. Dev secrets and seed values are in the workspace `INTEGRATION.md` and [TEST_DATA.md](TEST_DATA.md).

## Dev IdP contract
- Issuer `http://localhost:4400`, discovery `/.well-known/openid-configuration`, JWKS `/jwks`. Auth code + PKCE (S256 mandatory).
- Clients: `kiorex-web` (public, `http://localhost:5180/auth/callback`), `kiorex-ops` (public, `http://localhost:5181/auth/callback`),
  `kiorex-mobile` (public, `kiorex://auth/callback`, `http://localhost:8081/auth/callback`),
  `kiorly-clinic` (confidential, dev secret in the workspace `INTEGRATION.md`, `http://localhost:5174/auth/kiorex/callback`).
- Planned, not yet registered (NEEDS_HUMAN): public PKCE client `kiorly-team` for the Kiorly Team staff app, redirect `kiorlyteam://auth/callback` (founder decision 23 Nov 2026; the earlier `kiorly-work`/`kiorlywork` and `kiorly-app` names are retired). Register it with the final bundle id `com.kiorly.team`.
- Access token: RS256 JWT, `aud=kiorex-api`, <= 15 min, claims `sub phone_number phone_number_verified name locale kx_roles` (+ `sid`). Refresh 30 d, rotating with reuse detection. No clinical data.
- Seed users: `+201000000001` Amira, `+201000000002` Hassan (patients), `+201000000099` ops (`ops_admin`, `super_admin`). OTP `000000` is accepted only for these numbers when `NODE_ENV!=production`; other codes are printed to the console.
- Back-channel logout to `http://localhost:4000/api/v1/auth/backchannel-logout` and `http://localhost:3010/api/v1/auth/kiorex/backchannel-logout`; events `session.revoked`, `subject.deleted` (logout token `events` carries the standard URI plus `https://schemas.kiorex.com/event/<event>`). Verify in products with `@kiorex/backchannel`.
- Session API (Bearer access token): `GET /api/sessions`, `DELETE /api/sessions/:id`, `DELETE /api/sessions` (all others), `GET /api/account/export`, `DELETE /api/account`, passkeys `/api/passkeys/register/{options,verify}` (flag `account.passkeys`). RP-initiated logout at `/session/end`.
- Pages are AR/EN with RTL, Kiorex brand tokens (`../_brand`, committed fallback in `apps/dev-idp/assets/brand`).
- OTP limits: 5 sends/phone/h, 20/IP/h, 5 attempts/challenge then 15 min lockout (HTTP 429).

## Identity APIs added for KA-06/08/09/10/11 (all Bearer access token unless noted)
All messaging is **mocked** (founder decision 19 Nov 2026): OTPs, invitations and notifications are logged and written to a DB dev inbox.
`GET /dev/inbox?to=&channel=&template=&after=` (and `DELETE /dev/inbox`) lists them for E2E tests (OTP code is in `data.code`);
`GET /dev/events?type=&after=` lists identity events (`guardian.link.changed`, `membership.changed`, `account.merged`).
- **Guardian (KA-06)**: `POST|GET /api/dependants`, `DELETE /api/dependants/:sub`, `POST /api/dependants/:sub/co-guardians`, `POST /api/guardian-links/:id/accept`,
  `POST /api/guardian/act-as {dependant_sub, scope?}` -> acting-as token (`sub`=dependant, `act.sub`=guardian, <= 10 min, never past the age-of-majority expiry).
- **Account linking (KA-08)**: `POST /api/links {phone}` (OTP to the OTHER number), `POST /api/links/:id/verify {code}`, `GET /api/links`, `DELETE /api/links/:id`;
  operator review (ops role + MFA step-up): `GET /api/ops/links[?status=]`, `POST /api/ops/links/:id/{approve,reject,reverse}`. Never automatic.
- **Orgs (KA-09)**: `POST|GET /api/orgs`, `GET /api/orgs/:id/members`, `POST /api/orgs/:id/invitations`, `DELETE .../invitations/:iid`, `PATCH|DELETE /api/orgs/:id/members/:sub`, `POST /api/invitations/accept {token}`. Claim `kx_orgs` with scope `kx_org`.
- **Step-up (KA-10)**: login tokens carry `acr`/`amr`/`auth_time`; `GET /api/totp`, `POST /api/totp/{enroll,confirm}`, `GET /api/step-up/policy?action=`, `POST /api/step-up {method:'totp',code}` or `{method:'passkey',response}` (+ `POST /api/step-up/passkey/options`) -> fresh `acr=urn:kiorex:acr:mfa` token. Ops/privileged roles must pass TOTP at login (otplib; seeded ops secret in `config/seed-users.json`, dev only).
- **Passkey login (KA-03)**: login page button; `POST /interaction/:uid/passkey/login/{options,verify,finish}` (flag `account.passkeys`).
- **Federation (KA-11)**: flag `account.provider_sso`; second fake upstream IdP on port 4401 (`apps/dev-idp/src/fake-upstream.ts`); `GET /api/federation/identities`, `DELETE /api/federation/identities/:upstream/:sub`.
- **SCIM 2.0 (KA-11)**: `/scim/v2/Users` + `/Groups` with a per-organisation bearer token (`POST /api/orgs/:id/scim-tokens`); see `Docs/SCIM.md`.

## Passport web UI (`/account`)
`npm run dev`, then open <http://localhost:4400/account> (sign in with a seed number and OTP `000000`, or read the code in `GET /dev/inbox`; ops `+201000000099` also needs the TOTP from `config/seed-users.json`).
The React app in `apps/passport-ui/src` is bundled in memory by esbuild when the IdP serves it (no build step; it rebuilds when a source file changes). It signs in as the public client `kiorex-passport-web` (PKCE) and calls only the documented `/api` endpoints.
Pages: account home, security (passkeys, authenticator app, sessions, sign-in activity), family and guardians, linked accounts, organisations, data and privacy (export / delete), connected apps, step-up, and the ops link-review queue. Wording that needs legal/clinical review is marked "Draft wording" in the UI and listed in `Docs/NEEDS_HUMAN.md` (#19-22).
```bash
npm test               # includes UI unit/component tests (jsdom, axe) and the dev-IdP API tests
npm run test:e2e       # Playwright on the SYSTEM Chrome (no browser download); starts its own IdP on :4450 with a throwaway schema
```


Back to the [README](../README.md) · [Docs index](INDEX.md)
