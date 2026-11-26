# Running Passport as a public DEV deployment (App Runner or one Docker host)

Scope: a DEV/TEST environment with synthetic data only. Production identity is the managed IdP (Cognito, see `IDP_SCORECARD.md`); the dev IdP never runs there.

## Image

`Dockerfile` at the repo root (multi-arch: it builds natively for `linux/arm64` and `linux/amd64`):

```
docker build -t kiorex-passport-dev .
docker buildx build --platform linux/amd64,linux/arm64 -t <registry>/kiorex-passport-dev --push .   # when a registry exists
```

* Process: `docker/entrypoint.sh` runs `tsx apps/dev-idp/src/migrate.ts` (idempotent schema migration; a failure stops the container, it never starts "healthy" on a broken database), optionally the synthetic demo seed (`KX_RUN_DEMO_SEED=true`, which keeps its own non-production guard), then `exec`s the server (SIGTERM = graceful stop).
* Port `4400` (`PORT`), listens on `HOST=0.0.0.0` inside the image (local runs keep `127.0.0.1`). Runs as the unprivileged `node` user.
* Health: `GET /healthz` returns `200 {"status":"ok",...}` (not under `/api`; also the Docker `HEALTHCHECK`). App Runner health check: HTTP, path `/healthz`, port 4400. Discovery: `/.well-known/openid-configuration`.
* The Passport UI is bundled in memory at start-up, so dev dependencies (`tsx`, `esbuild`, `react`) stay in the image on purpose. Start-up takes about 10 to 20 seconds.

## Why NODE_ENV=development and what keeps it safe

`assertNotProduction()` still refuses `NODE_ENV`, `KX_ENV` or `APP_ENV` = `production` or `prod` (the entrypoint checks it first, then the app again). That is not weakened. A public DEV deployment therefore runs with `NODE_ENV=development` and the **public mode** in `apps/dev-idp/src/public-mode.ts`, which is stricter than the local mode:

| | Local (localhost issuer, default) | Public mode |
|---|---|---|
| Switched on by | nothing | `DEV_IDP_PUBLIC=true` (set in the image), or any non-loopback `ISSUER` (a forgotten flag cannot leave a public host permissive) |
| Demo OTP `000000` for seeded numbers | on | **off** unless `KX_DEV_OTP_BYPASS=true` |
| "Test users" quick-pick panel | on | off unless the OTP bypass is on |
| `/dev/*` helper routes (inbox with OTP codes, events, simulators) | on | **404** unless `KX_DEV_ENDPOINTS=true` |
| Cookie keys | published constants | `KX_COOKIE_KEYS` (32+ chars each) required |
| Confidential client secrets | committed dev values | must be set in `KX_CLIENT_OVERRIDES_JSON` |
| Issuer | localhost | https origin required, no localhost |

The server refuses to start in public mode when any of these is missing, and prints each problem. In mock messaging mode OTP codes are still written to the container log (that is how a tester can read a code without the bypass); use `SMS_MODE=real` / `WHATSAPP_MODE=real` to stop that. Everything is synthetic: never put real people, real phone numbers or production products behind this server. The seeded numbers include the ops super admin `+201000000099`, so with `KX_DEV_OTP_BYPASS=true` anyone who knows the public code can sign in as it: enable the bypass only for an environment that holds no real data, ideally behind an IP allow-list.

## Environment

Required (public mode):

* `DATABASE_URL`, optional `KX_DB_SCHEMA` (default `public`), `DB_POOL_MAX`.
* `ISSUER` the final public https origin, for example `https://account.dev.example.com`. It becomes the token `iss` every product validates: never change it after products are configured.
* `KX_COOKIE_KEYS` comma-separated random keys, 32+ characters each (rotate by prepending a new key).
* `KX_WORKSPACE_URL_CLINIC`, `KX_WORKSPACE_URL_PHARMACY`, `KX_WORKSPACE_URL_LAB` (https; optional `KX_WORKSPACE_URL_NURSE`, defaults to the clinic URL): what `GET /api/workspaces` hands out to Kiorly Home.
* `KX_CLIENT_OVERRIDES_JSON` (below), including a `clientSecret` for every confidential client (today `kiorly-clinic`).
* `KX_TRUST_PROXY=true` (already set in the image; keep it behind App Runner, CloudFront or a reverse proxy that sets `X-Forwarded-*`).

Optional: `KX_DEV_OTP_BYPASS`, `KX_DEV_ENDPOINTS`, `KX_DEV_TEST_USERS`, `KX_RUN_DEMO_SEED` (also set `KIOREX_ENV=dev` so the seed guard can see a non-production environment), `KX_FLAG_ACCOUNT_PASSKEYS`, `KX_FLAG_ACCOUNT_PROVIDER_SSO`, `OTP_TEST_NUMBERS`, `SMS_*`, `WHATSAPP_*`, `HOST`, `PORT`.

### Client URIs without editing code

`config/idp.json` `environments.local` keeps its localhost defaults. A deployment replaces them per client with one JSON value:

```
KX_CLIENT_OVERRIDES_JSON={
  "kiorly-clinic": {
    "redirectUris": ["https://clinic.dev.example.com/auth/kiorex/callback"],
    "postLogoutRedirectUris": ["https://clinic.dev.example.com/"],
    "backchannelLogoutUri": "https://api.clinic.dev.example.com/api/v1/auth/kiorex/backchannel-logout",
    "clientSecret": "<32+ random characters, same value the Clinic API is configured with>"
  },
  "kiorly-pharmacy-web": { "redirectUris": [...], "postLogoutRedirectUris": [...], "backchannelLogoutUri": "https://..." }
}
```

Each present field replaces the matching local value for that client; absent fields keep the default. Unset means no change. Validation fails the start-up (so a typo is never silently ignored): unknown client id, unknown key, wildcards, fragments, `http` other than localhost, `javascript:`/`data:`/`file:` schemes, a secret for a public client, a secret shorter than 16 characters. Custom app schemes (`kiorly://auth/callback`) are allowed for native clients. The Passport SPA client (`kiorex-passport-web`) always follows `ISSUER`. The chicken-and-egg order (hostnames known only after first creation) is solved by the two-pass bootstrap in `_docs/AWS_DEV_ENV_PLAN.md` section 3.6: deploy, read the URLs, set this variable, redeploy.

## Kiorly Home on a DEV tier

`KX_ENV=dev npm run build -w @kiorex/kiorly-home` reads every origin from the environment at build time (`apps/kiorly-home/dev-tier.ts`), so the bundle contains no localhost URL and `config/domains.json` is not used:

`VITE_PASSPORT_ISSUER`, `KX_HOME_ORIGIN`, `KX_PRODUCT_URL_CLINIC`, `KX_PRODUCT_URL_PHARMACY`, `KX_PRODUCT_URL_LAB` (optional `KX_PRODUCT_URL_NURSE`, defaults to the clinic web), `KX_API_CLINIC`, `KX_API_PHARMACY`, `KX_API_LAB`. Every value must be an https non-localhost URL or the build fails. Register Home's `redirectUris` (`https://<home>/signin/callback`) and `postLogoutRedirectUris` (`https://<home>/signin`) through `KX_CLIENT_OVERRIDES_JSON` for the `kiorly-home` client. Token calls go through the same-origin path `/idp/*`, so the host that serves the static bundle must proxy `/idp/*` to the Passport origin (CloudFront behaviour or reverse proxy).

## Not covered here

Pushing the image to a registry, App Runner / ECS service definitions, TLS, DNS and a WAF are infrastructure and stay with the founder-approved deploy step; nothing here deploys anything.
