# Kiorex Passport: SCIM 2.0 provider-directory sync (KA-11, second half)

Status: built and tested in the Passport service (`apps/dev-idp/src/scim.ts`, tests `apps/dev-idp/test/ka11-scim.test.ts`). It lets an
organisation's directory (Microsoft Entra ID, Okta, Google Workspace, any SCIM 2.0 client) provision its staff into a Passport
organisation (KA-09). No external IdP product is needed: the endpoints are served by Passport itself. Whether a customer actually
uses it is a commercial decision (FD-12 now only covers enterprise SAML/OIDC federation product choice in the managed IdP).

## Endpoints

Base URL: `<issuer>/scim/v2` (dev `http://localhost:4400/scim/v2`, production `https://account.kiorex.com/scim/v2`). Content type
`application/scim+json`. Auth: `Authorization: Bearer kxscim_...` (one token per organisation).

| Endpoint | Support |
|---|---|
| `GET /ServiceProviderConfig`, `/ResourceTypes`, `/Schemas` | discovery (patch + filter supported; bulk/sort/etag/changePassword not) |
| `GET/POST /Users`, `GET/PUT/PATCH/DELETE /Users/{id}` | yes; list filter `userName eq`, `externalId eq`, `id eq`; `startIndex`/`count` |
| `GET /Groups`, `GET /Groups/{id}`, `PATCH`/`PUT /Groups/{id}` | the organisation's role-hint groups (`role-owner`, `role-admin`, `role-doctor`, ...) |
| `POST /Groups`, `DELETE /Groups/{id}` | refused (groups are fixed) |

## Token management (Passport API, org owner/admin, Bearer access token of a signed-in manager)

- `POST /api/orgs/{orgId}/scim-tokens {label}` -> `{token_id, token, scim_base_url}`; the token is shown once, stored as SHA-256 only.
- `GET /api/orgs/{orgId}/scim-tokens` (label, created, last used, revoked) and `DELETE /api/orgs/{orgId}/scim-tokens/{tokenId}` (revoke: the next SCIM call is 401).
- Audited: `scim.token.created|revoked`, `scim.user.created|activated|deactivated|deleted`.

## Mapping to Passport

| SCIM | Passport |
|---|---|
| User `phoneNumbers[0]` (E.164, required) | the identity key. Existing account with that phone (primary or merged contact) is reused; otherwise a person account is created with `phone_verified=false` (the person verifies by phone OTP at first sign-in) |
| User `userName`, `externalId` | stored per organisation in `scim_users` (unique per org, case-insensitive userName) |
| User `displayName` / `name` | sets the account name only when it is empty: a person's own name is never overwritten by the directory |
| User `locale` | `ar*` -> `ar`, else `en` (new accounts only) |
| User `active` | `true` -> active membership; `false` -> membership revoked (`status=revoked`, `kx_orgs` hint disappears from new tokens). Entra-style `"True"/"False"` strings accepted |
| Extension `urn:kiorex:params:scim:schemas:extension:passport:2.0:User` `roleHint` and Group membership | the membership `role_hint` (default `staff`); changes emit `membership.changed` like every other membership change |
| `DELETE /Users/{id}` | revokes the membership and removes the SCIM mapping. **The Passport identity is never deleted** (the person owns it) |

Guardrails (ADR-013): identity attributes only. Clinical/licence/profession attributes are ignored, never stored, never echoed
(profession and scope of practice live in Kiorly, ADR-029). SCIM never grants or removes `owner`, cannot deactivate an owner, only sees
users it provisioned for its own organisation, cannot change a phone number (identity key), and a user's group membership removal is a
no-op (a user has exactly one role hint; deactivate to end the membership). A directory admin can attach any phone number to an
organisation they control; this only yields a hint (`org_id` + `role_hint`), exactly like an owner-created membership, and products
still decide permissions.

## Connecting an IdP

1. An organisation owner/admin creates a SCIM token (API above; the Passport UI button is a follow-up).
2. Entra ID: Enterprise application -> Provisioning -> tenant URL = base URL, secret token = the token; map `userName`, `externalId`,
   `displayName`, `phoneNumbers[type eq "mobile"].value`, `active`. Okta: SCIM 2.0 app with the same unique identifier field `userName`.
3. Assign the groups `role-doctor`, `role-nurse`, ... (or set `roleHint`) to the users.

## Not done / needs a human

- Passport UI screen for token management (API only).
- Production hosting of the SCIM routes next to the managed IdP (AWS) follows the same deploy decision as the rest of Passport (FD-17).
- SCIM bulk, sort and ETag are intentionally unsupported. Rate limiting per token is a hardening follow-up.
