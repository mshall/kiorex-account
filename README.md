# kiorex-account - Kiorex Passport

> **QA / demo data:** synthetic Egyptian dataset, logins, URLs and reset instructions in [Docs/TEST_DATA.md](Docs/TEST_DATA.md) (DEV ONLY).

Identity for the Kiorex ecosystem (user-facing name **Kiorex Passport**, host `account.kiorex.com`; KX-04, ADR-012/013).
Production uses a **managed IdP** (default Cognito, vendor decision open: see `Docs/IDP_SCORECARD.md`, marked NEEDS_HUMAN).
This repo holds IdP config-as-code, a **local-only** dev OIDC provider, the OTP sender and back-channel logout helpers. No custom crypto in production.

| Path | What |
|---|---|
| `config/idp.json` | Clients, scopes, claim mapping, token lifetimes, passwordless + OTP policy, MFA policy (single source of truth) |
| `config/seed-users.json` | Local seed users only (never read by the Cognito stack) |
| `apps/dev-idp` | Dev/E2E OIDC provider on `oidc-provider`, port 4400, Postgres adapter. **Refuses to start if `NODE_ENV=production`** |
| `apps/passport-ui` | **Kiorex Passport web UI** (React, AR/EN RTL, dark mode): served by the dev IdP at `http://localhost:4400/account` |
| `packages/otp-sender` | Cognito custom-auth challenge triggers (define/create/verify) + channels (log, WhatsApp template, SMS, fallback) |
| `packages/backchannel` | Build / verify / deliver OIDC back-channel logout tokens for products |
| `Docs/` | `IDP_SCORECARD.md`, `KA_TRACE.md`, `NEEDS_HUMAN.md` |

**For the tofu/Cognito stack (infra/tofu, other agent):** read `config/idp.json` (environments `staging` / `production`; ignore `environments.local` and `config/seed-users.json`). OTP Lambdas: handler exports in `packages/otp-sender/src/lambda.ts`.

## Run
```bash
npm install
npm run dev            # dev IdP at http://localhost:4400 (Postgres 127.0.0.1:5433/kiorex_account)
npm test               # unit + end-to-end tests (needs Postgres on 5433; uses a throwaway schema)
npm run typecheck
npm run db:reset       # clear dev sessions/tokens/OTP rate limits
```
Env: `PORT`, `ISSUER`, `DATABASE_URL`, `KX_DB_SCHEMA`, `KX_FLAG_ACCOUNT_PASSKEYS=true|false`, `KX_FLAG_ACCOUNT_PROVIDER_SSO=true|false`, `KX_FAKE_UPSTREAM_PORT` (default 4401), `KX_TRUST_PROXY`.

## Dev IdP contract (INTEGRATION.md)
- Issuer `http://localhost:4400`, discovery `/.well-known/openid-configuration`, JWKS `/jwks`. Auth code + PKCE (S256 mandatory).
- Clients: `kiorex-web` (public, `http://localhost:5180/auth/callback`), `kiorex-ops` (public, `http://localhost:5181/auth/callback`),
  `kiorex-mobile` (public, `kiorex://auth/callback`, `http://localhost:8081/auth/callback`),
  `kiorly-clinic` (confidential, secret `dev-kiorly-clinic-secret`, `http://localhost:5174/auth/kiorex/callback`).
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

## Passport web UI (`/account`)
`npm run dev`, then open <http://localhost:4400/account> (sign in with a seed number and OTP `000000`, or read the code in `GET /dev/inbox`; ops `+201000000099` also needs the TOTP from `config/seed-users.json`).
The React app in `apps/passport-ui/src` is bundled in memory by esbuild when the IdP serves it (no build step; it rebuilds when a source file changes). It signs in as the public client `kiorex-passport-web` (PKCE) and calls only the documented `/api` endpoints.
Pages: account home, security (passkeys, authenticator app, sessions, sign-in activity), family and guardians, linked accounts, organisations, data and privacy (export / delete), connected apps, step-up, and the ops link-review queue. Wording that needs legal/clinical review is marked "Draft wording" in the UI and listed in `Docs/NEEDS_HUMAN.md` (#19-22).
```bash
npm test               # includes UI unit/component tests (jsdom, axe) and the dev-IdP API tests
npm run test:e2e       # Playwright on the SYSTEM Chrome (no browser download); starts its own IdP on :4450 with a throwaway schema
```

## Brand (Q11)
Passport uses the shared Kiorex brand kit (`../_brand`, vendored under `apps/dev-idp/assets/brand/` and `apps/passport-ui/src/brand/`): Passport lockup, `tokens.css` (set `data-theme="auto"` on `<html>` to follow the OS; `light`/`dark` force), self-hosted Jost + IBM Plex Sans Arabic (`/static/brand/fonts.css`). Never redraw the logo; re-vendor when `_brand` changes.
