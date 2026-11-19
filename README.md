# kiorex-account - Kiorex Passport

Identity for the Kiorex ecosystem (user-facing name **Kiorex Passport**, host `account.kiorex.com`; KX-04, ADR-012/013).
Production uses a **managed IdP** (default Cognito, vendor decision open: see `Docs/IDP_SCORECARD.md`, marked NEEDS_HUMAN).
This repo holds IdP config-as-code, a **local-only** dev OIDC provider, the OTP sender and back-channel logout helpers. No custom crypto in production.

| Path | What |
|---|---|
| `config/idp.json` | Clients, scopes, claim mapping, token lifetimes, passwordless + OTP policy, MFA policy (single source of truth) |
| `config/seed-users.json` | Local seed users only (never read by the Cognito stack) |
| `apps/dev-idp` | Dev/E2E OIDC provider on `oidc-provider`, port 4400, Postgres adapter. **Refuses to start if `NODE_ENV=production`** |
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
Env: `PORT`, `ISSUER`, `DATABASE_URL`, `KX_DB_SCHEMA`, `KX_FLAG_ACCOUNT_PASSKEYS=true|false`, `KX_TRUST_PROXY`.

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
