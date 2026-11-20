# Upgrade notes (kiorex-account)

Toolchain and dependency refresh of 20 Nov 2026. Runtime: **Node 26.13.1 (Lithium, Active LTS)**, pinned in `.nvmrc` and used by CI (`node-version-file`).

## Versions

| Tool | Before | After |
|---|---|---|
| Node.js (`.nvmrc`, CI, `engines`) | 22 in CI, `>=20` | 26.13.1, `>=26.13.0` |
| npm (bundled) | 11.12 | 11.20 |
| TypeScript | 5.9.3 | 7.0.2 (native compiler; `tsc -b` unchanged) |
| @types/node | 22.20 | 26.6 |
| Vitest | 2.1.9 | 5.1.1 (explicit `vite` 8.3.8 peer) |
| jsdom / testing-library/react / user-event | 31 / 16.3 / 14.6 | unchanged (latest); jest-dom 6.9 -> 8.0 |
| Playwright / axe | 1.65.1 / 4.14 | unchanged (already latest) |
| tsx / esbuild / oidc-provider / pg / otplib | 4.19 / 0.28 / 9.15 / 8.23 / 13.6 | tsx 4.23, others already latest |
| React / react-dom / @types/react | 18.3.1 | 19.3.1 |
| jose | 5.10 | 6.2 |
| zod | 3.25 | 4.6 |
| ulid | 2.4 | 3.0 |
| @simplewebauthn/server and browser | 13.3 | 14 |
| @types/oidc-provider | 8.8 | 9.13 |
| GitHub Actions | checkout v4/v6, setup-node v4, setup-opentofu v1, setup-tflint v4, trivy 0.28.0, github-script v7 | checkout v7, setup-node v7, setup-opentofu v2, setup-tflint v6, trivy-action 0.36.0, github-script v9; configure-aws-credentials v6 (latest) |
| OpenTofu | 1.13.9 | 1.13.9 (latest); providers aws 6.73 / archive 2.8 / random 3.9 already latest within constraints |
| Lambda runtime (IaC) | nodejs22.x | **nodejs24.x** (see below) |

No ESLint/Prettier/Jest/Prisma/Vite app/Tailwind/Dockerfiles exist in this repo. CI Postgres stays `postgres:16` (workspace rule: PostgreSQL 16 for the products).

## Pinned / deliberate

- **Lambda `nodejs26.x` is public preview** in AWS (no SLA, not for production). The IaC uses `nodejs24.x` (latest GA). Switch both `modules/aws/identity/main.tf` and `modules/product-stack/jobs.tf` to `nodejs26.x` once AWS announces GA. Nothing was applied.
- `npm` stays at the version bundled with Node 26.13.1 (11.20); npm 12 is not bundled with the LTS yet.

## Breaking changes handled

- **jose 6**: `KeyLike` removed, replaced by `CryptoKey` (keys.ts, fake-upstream.ts, packages/backchannel).
- **zod 4**: `z.record` needs an explicit key schema; `.passthrough()` migrated to `z.looseObject`.
- **@simplewebauthn 14**: `AuthenticatorTransportFuture` renamed `AuthenticatorTransport`.
- **oidc-provider 9 types**: `pkce.methods` no longer exists (S256 is the only method in v9, behaviour unchanged).
- **React 19**: no source changes required; root `react`/`react-dom` devDependencies added so `@testing-library/react` resolves the same React copy as the app.
- **Vitest 5**: requires `vite` as an explicit peer (added). jsdom logs harmless "HTMLCanvasElement getContext not implemented" notices from axe.
- **setup-opentofu v2** runs on the Node 24 action runtime, no input changes; **github-script v9** only affects scripts using `require('@actions/github')` (none here).

## Verify

```bash
nvm use                                   # 26.13.1
rm -rf node_modules && npm ci
npm run typecheck && npm test             # needs Postgres on 127.0.0.1:5433 (isolated schemas)
npm run test:e2e                          # Playwright on system Chrome
npm audit
cd infra/tofu/live/staging/frankfurt/kiorex-account && tofu init -backend=false -upgrade && tofu validate   # also prod; never apply
tofu fmt -check -recursive infra/tofu
```

Results at upgrade time: typecheck clean, 206/206 unit and integration tests, 19/19 Playwright tests, `npm audit` 0 vulnerabilities, `tofu validate` OK for staging and prod, lock files unchanged (already latest).
