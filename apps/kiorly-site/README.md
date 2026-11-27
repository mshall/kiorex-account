# @kiorex/kiorly-site: the Kiorly public marketing site

Static, bilingual (Arabic right to left and English), no framework. A Node build script renders every page to HTML, esbuild bundles two tiny scripts (the onboarding form and the root-page language redirect), and the result in `dist/` is ready for **S3 + CloudFront** at the registry service `kiorly.marketing` (`test.kiorly.com`, later `kiorly.com`; ADR-059). Kiorly marks only: the Kiorex logo is never used here (a test fails if a Kiorex asset reaches `dist/`).

| Page (per language `/ar/`, `/en/`) | Content |
|---|---|
| `/` | language chooser (redirects by browser language, remembers an explicit choice) |
| `/<lang>/` | home: what Kiorly is, the three products, one account |
| `/<lang>/clinics/`, `pharmacies/`, `labs/` | product pages (copy in `src/content.ts`) |
| `/<lang>/how-it-works/` | four steps from request to go-live |
| `/<lang>/plans/` | plans from configuration only; **never a price** |
| `/<lang>/onboarding/` | provider onboarding / lead form |
| `404.html`, `robots.txt`, `sitemap.xml` (production only) | |

## Build

Every host comes from the build environment (no host literal in code; the registry `_docs/registry/service-url-registry.yaml` is the only list of hosts):

```
npm run env:emit -w @kiorex/kiorly-site -- --env test      # prints KIORLY_SITE_ENV, KIORLY_SITE_ORIGIN, KIORLY_HOME_URL from the registry
npm run build -w @kiorex/kiorly-site -- --env test         # same values read from the registry, then builds dist/
KIORLY_SITE_ENV=test KIORLY_SITE_ORIGIN=... KIORLY_HOME_URL=... npm run build -w @kiorex/kiorly-site   # explicit values (CI without the workspace repository)
```

| Variable | Meaning |
|---|---|
| `KIORLY_SITE_ENV` | `local`, `dev`, `test`, `staging`, `pilot`, `prod` (required) |
| `KIORLY_SITE_ORIGIN` | https origin of the site (required; canonical, hreflang and sitemap URLs) |
| `KIORLY_HOME_URL` | https origin of Kiorly Home (`kiorly.app`); the "Sign in" button goes to `<origin>/signin` (required) |
| `KIORLY_LEAD_ENDPOINT` | https URL the form POSTs JSON to. **Unset = mock mode**: the form validates, sends nothing and says so on the page. `pilot` and `prod` refuse to build without it (`KIORLY_ALLOW_MOCK_LEADS=true` overrides, for a deliberately inert site) |
| `KIORLY_PLANS_FILE` | optional JSON `{ "plans": [ { id, name:{ar,en}, summary:{ar,en}, features:{ar:[],en:[]} } ] }`. Any key that looks like pricing (price, amount, fee, currency, ...) fails the build: pricing is set in Ops and each plan only shows "pricing is set in Kiorly Ops and is not published on this page" |
| `KIORLY_INDEXABLE` | `true`/`false`; default indexable only in `prod`. Non-indexable builds emit `noindex,nofollow` on every page, `Disallow: /` in `robots.txt` and no sitemap |
| `KIORLY_CONTACT_EMAIL` | optional address shown in the footer |

Non-production builds show a "Preview build: copy under review" strip.

## Lead form contract

`POST <KIORLY_LEAD_ENDPOINT>` with `content-type: application/json`, no credentials, no referrer:

```json
{ "source": "kiorly-site", "env": "test", "locale": "ar", "submittedAt": "<ISO time>", "kind": "clinic|pharmacy|lab",
  "organisation": "", "contactName": "", "phone": "+20...", "email": "", "city": "", "message": "",
  "consent": { "accepted": true, "textVersion": "draft-1" } }
```

Empty optional fields are omitted. A hidden honeypot field blocks simple bots client-side; the receiving endpoint must still rate-limit and bot-check (the site cannot sign the request: a browser holds no secret). The consent text is a **draft pending counsel review**; `textVersion` changes whenever the wording does. The platform's existing HMAC-signed `POST /partners/v1/leads` is for product-originated leads; a public, unsigned intake (rate limit, captcha, CORS for the site origin) does not exist yet: see `Docs/NEEDS_HUMAN.md`.

## Hosting (not applied by this repository)

- Upload `dist/` to a private S3 bucket behind CloudFront with Origin Access Control. Attach `deploy/cloudfront-index-rewrite.js` as a viewer-request CloudFront Function (S3 has no directory index: `/ar/clinics/` becomes `/ar/clinics/index.html`). Custom error response 404 -> `/404.html`.
- Cache: `/assets/*` are content-hashed (`Cache-Control: public, max-age=31536000, immutable`); HTML short (`max-age=300`).
- Headers (response headers policy): `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'` (in a header: the CSP `<meta>` in each page cannot carry it). The page CSP allows only same-origin scripts, styles and fonts, and `connect-src` to the lead endpoint origin.
- Certificate and DNS: registry service `kiorly.marketing`, certificate of the environment's own zone. Founder-gated; do not apply from here.

## Tests

`npx vitest run apps/kiorly-site` (config, lead validation, whole-site build checks: both languages, RTL, SEO tags, no localhost or hardcoded host, no price, only Kiorly marks, links resolve) and `npx playwright test -c apps/kiorly-site/e2e/playwright.config.ts` (builds a mock-leads and a live-endpoint site on ports 5196/5197; language redirect and switch, 375 px layout, axe light and dark in both languages, form validation and submission against an intercepted endpoint).
