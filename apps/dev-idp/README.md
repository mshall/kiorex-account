# dev-idp

Local-only OIDC provider for development and end-to-end tests, built on `oidc-provider` with a Postgres adapter. Port `4400`. It **refuses to start when `NODE_ENV=production`**. Back to the [README](../../README.md).

```bash
npm run dev -w apps/dev-idp     # or `npm run dev` at the repo root
npm run db:reset -w apps/dev-idp
```

| File | What |
|---|---|
| `src/provider.ts` | OIDC provider setup, PKCE S256 required, clients from `config/idp.json` |
| `src/otp.ts`, `src/notify.ts` | OTP issue and verify with rate limits; mock messaging and dev inbox |
| `src/interactions.ts`, `src/passkeys.ts`, `src/totp.ts` | Login interactions, WebAuthn, TOTP |
| `src/api.ts`, `src/routes.ts` | Session, account, step-up, privacy endpoints |
| `src/guardian.ts`, `src/links.ts`, `src/orgs.ts`, `src/scim.ts`, `src/federation.ts` | Family, linking, organisations, SCIM, federation |
| `src/logout.ts` | Back-channel logout dispatcher |
| `src/account-ui.ts` | Serves the Passport UI at `/account` (esbuild bundle in memory) |

API reference: [Docs/DEV_IDP_CONTRACT.md](../../Docs/DEV_IDP_CONTRACT.md).
