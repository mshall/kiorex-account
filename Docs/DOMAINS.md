# Domains and URLs per environment (ADR-038)

ONE table: `config/domains.json` (typed accessor `config/domains.ts`). Go-live is configuration only.

| Role | local | staging (placeholders) | production |
|---|---|---|---|
| Passport | http://localhost:4400 | https://account.staging.kiorex.com | https://account.kiorex.com |
| Kiorly Home (sign-in) | http://localhost:5194/signin | https://www.staging.kiorly.com/signin | https://www.kiorly.com/signin (kiorly.com redirects) |
| Clinic | http://localhost:5174 | https://clinic.staging.kiorly.com | https://clinic.kiorly.com (alias https://app.kiorly.com) |
| Nurse (edition of Clinic) | http://localhost:5174 | https://nurse.staging.kiorly.com | https://nurse.kiorly.com |
| Pharmacy | http://localhost:5192 | https://pharmacy.staging.kiorly.com | https://pharmacy.kiorly.com |
| Lab | http://localhost:5193 | https://lab.staging.kiorly.com | https://lab.kiorly.com |
| APIs | :3010 :3100 :3200 | api.clinic/pharmacy/lab.staging.kiorly.com | api.clinic/pharmacy/lab.kiorly.com (to confirm) |

## Who consumes it
- **Passport**: `GET /api/workspaces` product URLs (override `KX_WORKSPACE_URL_CLINIC|NURSE|PHARMACY|LAB`, tier from `KX_ENV`); the client registrations in `config/idp.json` (`kiorly-home`, `kiorly-clinic`, `kiorly-pharmacy-web`, `kiorly-lab-web`, staging and production blocks) are asserted equal to the table by `test/domains.test.ts`.
- **Kiorly Home**: `vite.config.ts` bakes only the selected environment (`KX_ENV=local|staging|production`) into the bundle, so a production build has no localhost (checked by `npm run check:bundle -w @kiorex/kiorly-home`).
- **Products** (separate repos, never import this file): carry the same hosts in their own env: web CORS allow-list and API `CORS_ORIGINS`, OIDC redirect and post-logout URIs (`<product>/auth/callback` or `/auth/kiorex/callback`, post-logout `<product>/` and `<home>/signin`), `PUBLIC_BASE_URL`, secure-cookie flags. Cookies are host-only, Secure, HttpOnly, SameSite=Lax; never `Domain=.kiorly.com`.
- **Product webs, Kiorly Home hand-off (24 Nov 2026)**: each web has a header link "Switch workspace" -> `<home>/signin?switch=1` (AR/EN). The Home origin is `VITE_KIORLY_HOME_URL` at build time (value = `home` of the table); `vite dev` falls back to http://localhost:5194, a production build without it shows no link. Each web login page starts "Sign in with Kiorex Passport" by itself when opened with `?sso=passport` (what Home sends; skipped on Back navigation so there is no loop).
- **Infra**: `infra/tofu/modules/kiorly-domains` reads the same JSON (ACM SANs, Route 53 records, CloudFront and App Runner custom-domain mapping per environment). `tofu validate` only; never applied here.
- **Mobile**: `config/app-links/` templates for `https://www.kiorly.com/.well-known/` (com.kiorly.app).

## Hard-coded host audit (23 Nov 2026)
Searched Clinic, Pharmacy, Lab, Passport, staff app and Kiorex platform for `kiorly.com`, `app.kiorly.com`, `kiorly.link`: no host is hard-coded in runtime code. Findings are all documentation strings in OpenTofu variable descriptions (`app.kiorly.com`, `mail.kiorly.com` examples), the Clinic stacks' `nurse_domain` default `nurse.kiorly.com` (matches the table), a marketing link in the Kiorex landing page, store-copy text in the staff app, and mocked URLs in provider unit tests. CSP is `frame-ancestors 'none'` and CORS/redirect lists come from env. Nothing to fix in code; product env must be set from this table at go-live (NEEDS_HUMAN D10).
