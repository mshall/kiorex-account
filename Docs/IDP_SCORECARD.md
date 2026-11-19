# IdP scorecard for Kiorex Passport (repo: kiorex-account) (KX-04 §6, open question Q3)

> **STATUS: NEEDS_HUMAN.** The vendor decision (KX-01 Q3, owner: CEO / acting CTO, due month 2) is the founder's.
> This document is an engineering recommendation. Scores are desk estimates from public product knowledge and have **not**
> been validated by a spike; pricing and "supported" claims marked *verify* must be checked against current vendor docs
> before the decision is recorded as an amendment to ADR-012.

## 1. What we need from the IdP (from KX-04, ADR-012/013, INTEGRATION.md)

- OIDC code + PKCE, RS256 JWT access tokens (aud `kiorex-api`, 15 min), refresh 30 d with rotation and reuse detection (KA-01, KA-04).
- Passwordless phone OTP over WhatsApp first, SMS fallback, Arabic templates, 5 sends/phone/h, 20/IP/h, 5 attempts/challenge (KA-02).
- Optional passkeys; TOTP for privileged roles (KA-03).
- Session list, remote revoke, **back-channel logout to every client** with `session.revoked` / `subject.deleted` (KA-05, KA-07).
- Custom claims `phone_number`, `phone_number_verified`, `name`, `locale`, `kx_roles`; no clinical data (ADR-013).
- Runs in our AWS account / eu-central-1, full user-data export, 2-year auth audit stream (KA-12).
- No custom crypto in production (KX-22).

## 2. Scores (1 = poor, 5 = excellent), weights from KX-04 §6

| Criterion | Weight | Cognito | Auth0 | Keycloak (managed/ECS) | Zitadel |
|---|---:|---:|---:|---:|---:|
| Protocol correctness & security record | 25% | 3 | 5 | 5 | 4 |
| Phone-OTP and WhatsApp extensibility | 20% | 4 | 4 | 4 | 3 |
| Hosting region & data control | 15% | 4 | 2 | 5 | 4 |
| Operations & availability | 15% | 5 | 5 | 2 | 3 |
| Cost at 1M patients | 15% | 4 | 1 | 3 | 3 |
| Migration fit | 10% | 3 | 5 | 5 | 4 |
| **Weighted total** | | **3.80** | **3.75** | **4.05** | **3.50** |
| Sensitivity: ops 25 / protocol 20 / cost 10 | | 3.95 | 3.95 | 3.85 | 3.45 |

Reading: the raw scorecard favours Keycloak on control and protocol coverage; it loses as soon as a two-to-four person team's
operating burden is weighted properly (the "Operations" criterion is the only one a small team cannot buy back later). Cognito and
Auth0 tie in the ops-heavy view; Auth0 is eliminated by cost (per-MAU cliff, enterprise pricing at 1M patients) and by hosting outside our account.

## 3. Evidence and notes per option

### AWS Cognito (user pool, "Essentials" or "Lite" tier) - recommended default
- **For:** native to the stack (KX-21 §08 already names Cognito + OTP sender Lambda); multi-AZ managed; CloudTrail audit; CUSTOM_AUTH
  Lambda triggers fit phone OTP exactly (implemented in `packages/otp-sender`); pre-token-generation trigger for claims; passkey (WebAuthn)
  sign-in is offered on newer tiers (*verify tier and region availability*); in-account, eu-central-1.
- **Cost:** tiered per-MAU pricing with a free allowance; indicative order of magnitude at 1M MAU is low five figures USD per year or less
  (*verify against the current price page; model it in KX-13*). SMS/WhatsApp message cost dominates anyway and is independent of the IdP.
- **Gaps we must close ourselves (this repo):**
  1. **No native OIDC back-channel logout** emitted by the user pool. Mitigation: a revoke service (Lambda behind API Gateway, or part of the
     Kiorex API) calls `AdminUserGlobalSignOut` / `RevokeToken` and fans out logout tokens built with `@kiorex/backchannel`, signed by a KMS key
     (RS256 asymmetric; no key material in code). Session list is likewise a thin service over our own session table. *Highest-risk item for the spike.*
  2. Access-token `aud`: standard Cognito access tokens carry `client_id`, not `aud`; the pre-token-generation v2 trigger can set it (*verify*) -
     otherwise products validate `client_id`/scope and the resource-server scope. The dev IdP emits `aud=kiorex-api`; contract tests must pin the same.
  3. Refresh-token rotation + reuse detection: confirm availability in the chosen tier (*verify*); if absent, compensate with short-lived refresh and revoke-on-anomaly.
  4. OTP rate limits (5/phone/h, 20/IP/h) are enforced outside Cognito (WAF rate rules + a DynamoDB counter in the create-challenge Lambda).
  5. Not an OpenID-certified OP at the time of writing (*verify*); acceptable because products consume standard JWT/JWKS and the contract is tested against the dev IdP.
  6. Export: users and attributes are exportable via API; password hashes are not (irrelevant for passwordless patients; relevant only for provider passwords in phase 2+).
- **Lock-in:** moderate. Subject IDs are opaque; claims shape is pinned in `config/idp.json`; moving later means re-issuing `sub` mapping, so keep `sub` ULID in a custom attribute from day 1.

### Auth0 (Okta)
- Certified, mature passkeys, rotation + reuse detection, Actions for custom OTP, back-channel logout, bulk import with hashes.
- SaaS outside our AWS account (EU tenant possible); MAU/enterprise pricing is the deciding problem at 1M patients (KX-13 unit economics). Not recommended.

### Keycloak (self-hosted on ECS/EKS, or a managed Keycloak vendor)
- Certified, full feature coverage including back-channel logout, sessions, custom authenticator SPI for WhatsApp OTP, TOTP, passkeys. Runs in our account.
- Operations burden: HA (3 nodes + Infinispan), PostgreSQL, upgrades every ~quarter with SPI compatibility, patching, theme maintenance. A small team should not own this in M1-M6.
- Best fallback if the Cognito spike fails on back-channel logout or rotation.

### Zitadel (cloud or self-hosted)
- Modern, passkey-first, event-sourced audit (nice for KA-12), Actions v2 for custom OTP delivery, session API.
- WhatsApp OTP needs a custom action/SMS provider hook; smaller ecosystem and fewer Egypt/MENA operators; pricing to verify. Good second spike candidate.

## 4. Recommendation (NEEDS_HUMAN)

1. **Choose AWS Cognito for Phase 1 (M1-M6, patients, passwordless)**, because it is already in the infrastructure plan (KX-21), is operationally free for
   us, and Phase 1 needs only the features it does well (phone OTP via Lambda, JWT, claims).
2. Run the **two-week month-1 spike** KX-04 §6 prescribes between **Cognito and Keycloak (ECS)** with these pass/fail checks, all automated against
   the dev IdP's contract tests (`apps/dev-idp/test/*`) so the comparison is fair:
   - `aud=kiorex-api`, claims allowlist, 15 min access / 30 d refresh with rotation + reuse detection;
   - OTP over WhatsApp then SMS with Arabic template, rate limits from `config/idp.json`;
   - session list + remote revoke propagating a back-channel `session.revoked` to a test client within 5 s;
   - `subject.deleted` fan-out on account deletion; full user export;
   - p95 sign-up <= 60 s, OTP delivery >= 98% (KX-04 Phase 1 exit criteria).
3. If back-channel logout or rotation cannot be met on Cognito within the spike, **switch to Keycloak on ECS** (or Zitadel Cloud); `config/idp.json`,
   `@kiorex/otp-sender` (trigger-shaped, channel-pluggable) and `@kiorex/backchannel` are IdP-agnostic and carry over.
4. Record the decision as an amendment to ADR-012 and close Q3.

## 5. Config-as-code mapping

| Concern | Source of truth | Cognito stack consumes |
|---|---|---|
| Clients, redirect URIs, logout URIs | `config/idp.json` -> `clients[].environments.<env>` | user pool app clients |
| Scopes / resource server | `resourceServers`, `scopes` | resource server + custom scopes |
| Claim mapping, allowed claims | `claimsMapping`, `accessTokenClaims`, `forbiddenClaims` | pre-token-generation Lambda |
| Token lifetimes | `tokenLifetimes` | app client token validity |
| OTP policy and rate limits | `passwordless.otp` | OTP Lambdas env + WAF rules |
| MFA policy | `mfaPolicy` | MFA config for privileged groups |
