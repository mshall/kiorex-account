# KA requirement trace for Kiorex Passport (KX-04 §05)

KX-04 prints IDs as `KA01`; this repo writes them `KA-01`. "Dev IdP" = `apps/dev-idp`; "Prod" = managed IdP configured from `config/`.
Status: **Done** (implemented + tested in this repo), **Config** (expressed as config-as-code for the managed IdP; verified by the spike),
**Later** (phase 2/3, intentionally not built here).

| ID | Pri | Requirement (short) | Dev IdP / repo implementation | Tests | Prod path | Status |
|---|---|---|---|---|---|---|
| KA-01 | M | OIDC code + PKCE, confidential clients, exact redirect URIs | `src/provider.ts` (PKCE S256 required for all clients, exact redirects, 4 clients from `config/idp.json`) | `flow.test.ts` (4 clients, PKCE, redirect, plain rejected, confidential auth) | Cognito app clients from same JSON | Done |
| KA-02 | M | Phone OTP (WhatsApp, SMS fallback); 5 sends/phone/h, 20/IP/h, 5 attempts/challenge | `src/otp.ts`, `packages/otp-sender` (channels incl. fallback), lockout, hashed codes | `ratelimit.test.ts`, `otp-sender.test.ts` | Cognito CUSTOM_AUTH triggers = `otp-sender` `lambda.ts`; limits in WAF + DynamoDB | Done (dev) / Config (prod) |
| KA-03 | M | Passkeys optional; TOTP for privileged roles | Passkey **registration** behind flag `account.passkeys` (`src/passkeys.ts`, interaction + `/api/passkeys/*`) | `flow.test.ts` (flag on/off, options, bad attestation) | IdP-native passkeys; `mfaPolicy` in config | Partial: registration done; TOTP + passkey login = prod IdP |
| KA-04 | M | Access <= 15 min; refresh 30 d with rotation + reuse detection; audience-specific | `tokenLifetimes` (config schema rejects > 900 s), `rotateRefreshToken`, JWT `aud=kiorex-api` | `flow.test.ts` (claims, lifetime, rotation + reuse) | pre-token-generation + app client validity | Done (dev) / Config (prod) |
| KA-05 | M | Session list + remote revoke; back-channel logout to all clients | `src/api.ts` (`/api/sessions`), `src/logout.ts`, `packages/backchannel`; RP-initiated logout routed through the same dispatcher | `sessions-logout.test.ts`, `backchannel.test.ts` | Revoke service + KMS-signed tokens (see scorecard gap 1) | Done (dev) / Config (prod) |
| KA-06 | M | Guardian <-> dependant links | Not in phase-1 scope of this repo state | - | Kiorex API / account service | Later |
| KA-07 | M | Account deletion + export; `subject.deleted` propagation | `DELETE /api/account`, `GET /api/account/export`, tombstone, fan-out | `sessions-logout.test.ts` | Same API contract on prod revoke service | Done |
| KA-08 | P2 | Account linking, dual verification | - | - | - | Later |
| KA-09 | P2 | Org / membership API | `kx_roles` hint only | - | - | Later |
| KA-10 | P2 | Step-up signal (acr/amr) | `amr: ["otp"]` emitted at login; `mfaPolicy.stepUpAcr` reserved | - | IdP MFA | Later |
| KA-11 | P3 | Enterprise federation, SCIM | - | - | - | Later |
| KA-12 | M | Tamper-evident auth audit, 2-year retention | Hash-chained `audit_events` (dev analogue; no raw phone numbers) | `sessions-logout.test.ts` (chain) | CloudTrail + IdP logs -> immutable bucket, 2 y (infra) | Done (dev) / Config (prod) |

## Cross-cutting rules
- **ADR-013 / BR40** (no clinical data in identity): token claim allowlist `accessTokenClaims`; `forbiddenClaims` list; test asserts no unexpected claim in access/ID tokens (`flow.test.ts`).
- **KX-10 identity row** (refresh rotation, revoke, OTP rate limits - Kiorex Account parity): covered by KA-02/04/05 above.
- **No custom crypto in production**: dev IdP = `oidc-provider` (certified), `jose`, `@simplewebauthn/server`; `crypto` only for CSPRNG codes, salted HMAC of OTPs, constant-time compare and the audit hash chain. Production uses a managed IdP; `apps/dev-idp` refuses to start when `NODE_ENV=production`.
- **ADR-023/025**: `account.passkeys` is a flag (capability, ships ON); OTP rate limits/lockout are safety controls, never flags.
