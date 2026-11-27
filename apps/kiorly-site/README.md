# @kiorex/kiorly-site: the Kiorly public site (single-page index + join flow)

Static, bilingual (Arabic right to left and English), light theme, no framework. A Node build script renders the pages to HTML, esbuild bundles three tiny scripts, and `dist/` is ready for **S3 + CloudFront** at the registry service `kiorly.marketing` (`test.kiorly.com` now, `kiorly.com` in production; ADR-059). Since 28 Nov 2026 the home page is a rich **single-page experience** with the full lead pipeline behind it (platform `Docs/LEADS.md`).

| Page | Content |
|---|---|
| `/` | language chooser (redirects by browser language, remembers an explicit choice) |
| `/<lang>/` | hero, products (Clinic, Pharmacy, Lab, Nurse, staff app, hospitals and chains: benefits, standalone vs connected, flow, mock-up), standalone vs connected, what connecting to Kiorex adds (marketplace, bookings, Passport, Pay, growth engine, commission visible to both sides, reconciliation, order flows) with a diagram, four journeys, security and privacy, **plans (live, from the platform)**, FAQ, and the **Join us** form |
| `404.html`, `robots.txt`, `sitemap.xml` (production only) | |

Illustrations and "screenshots" are inline SVG generated in `src/art.ts` (illustrative mock-ups with no real data; text inside them is localised and mirrored for RTL). Logos: the Kiorly lockups and marks (identical to `_brand/dist/svg/kiorly-*`, guarded) and the **Kiorex waveform logo** (`assets/vendor/kiorex-logo-full.svg`, copied byte for byte from `_brand/`, parity tested, shown only in "Kiorly by Kiorex" places at 120 px or wider). Fonts: Jost, IBM Plex Sans Arabic and Plus Jakarta Sans SemiBold (SIL OFL, `assets/vendor/OFL.txt`).

## Build

Every host comes from the registry (no host literal in code):

```
npm run env:emit -w @kiorex/kiorly-site -- --env test      # KIORLY_SITE_ENV, KIORLY_SITE_ORIGIN, KIORLY_HOME_URL, KIORLY_LEAD_ENDPOINT
npm run build -w @kiorex/kiorly-site -- --env test         # same values read from the registry, then builds dist/
KIORLY_SITE_ENV=test KIORLY_SITE_ORIGIN=... KIORLY_HOME_URL=... KIORLY_LEAD_ENDPOINT=... npm run build -w @kiorex/kiorly-site   # explicit values
```

| Variable | Meaning |
|---|---|
| `KIORLY_SITE_ENV` | `local`, `dev`, `test`, `staging`, `pilot`, `prod` (required) |
| `KIORLY_SITE_ORIGIN` | https origin of the site (canonical, hreflang and sitemap URLs) |
| `KIORLY_HOME_URL` | https origin of Kiorly Home; "Sign in" goes to `<origin>/signin` |
| `KIORLY_LEAD_ENDPOINT` | `https://<kiorex.api host>/api/v1/public/leads` (from the registry). **Unset = mock mode**: the form validates and says nothing was sent. `pilot` and `prod` refuse to build without it (`KIORLY_ALLOW_MOCK_LEADS=true` overrides) |
| `KIORLY_PLANS_ENDPOINT` | `https://<kiorex.api host>/api/v1/public/plans` (from the registry; `env:emit` prints it). The page reads the plans from it when it loads. **Unset = the neutral "plans are being finalised" text only.** The site holds no plan, price or feature of its own (the old `KIORLY_PLANS_FILE` is gone) |
| `KIORLY_INDEXABLE` | `true`/`false`; default indexable only in `prod` |
| `KIORLY_CONTACT_EMAIL` | optional address shown in the footer and the no-JavaScript fallback |

Non-production builds show a "Preview build" strip and visible `TODO_NEEDS_HUMAN` notes; a production build drops those markers (the consent text keeps its draft mark until counsel signs).

## Plans (live)

The Plans section ships the neutral text (`data-plans-fallback`) and a hidden live area. In the browser `src/plans.ts` does `GET <KIORLY_PLANS_ENDPOINT>` (no credentials, no referrer, 6 s timeout), validates the answer against the contract `kiorly.public-plans.v1` strictly, and only then replaces the text with tabs per product (Clinic, Pharmacy, Lab; a product with nothing to show has no tab) and one card per plan: name, summary, limits, features, and the price **only if the contract carries one**, otherwise "Pricing to be announced". Amounts are formatted in the market currency of the answer (`Intl`, Arabic digits in the Arabic page). A failing, malformed or silent platform leaves the neutral text: no error, no number. The words come from `src/content.ts` `PLANS` (the build serialises the labels of the page language into `data-labels`, the bundle carries no copy of its own); values from the platform are escaped. What is shown is edited by a Kiorly super admin (and read by ops) in the Kiorly admin, `/kiorly-plans`; see the platform `Docs/KIORLY_ADMIN.md`. The API answers `Cache-Control: max-age=60`, so a change shows within about two minutes.

## The join form

Five steps (how to join + provider type; the business, with fields that depend on the type; contact and location; licences and plan; preferences, review and consent). The two choices **Standalone** / **Standalone and connected to Kiorex** are in the page (cards) and as the first step. Picklists come from the live `GET <endpoint>/config` (edited in the admin Settings) with `src/form-defaults.json` as the offline default (regenerate from the platform: `scripts/emit-lead-form-defaults.ts`). Client validation mirrors the platform rules (`src/lead.ts`); the server stays the authority (400 `VALIDATION_FAILED { fields }` sends the visitor to the right step). Spam control on this side: a hidden honeypot; the platform adds strict validation, body limit, rate limits and idempotency (`Idempotency-Key`, one key per attempt, reused on retries). No CAPTCHA. Nothing the visitor types is stored in the browser or the URL. Success screen: reference number (`KL-XXXXXXXX`), copy button, what happens next.

Payload (JSON, no credentials, no referrer): see `buildPayload` in `src/lead.ts` and platform `apps/api/src/leads/lead-validation.ts`.

## Hosting

- Upload `dist/` to the private S3 bucket behind CloudFront (OAC) with `deploy/cloudfront-index-rewrite.js` (OpenTofu `envs/test`, service `kiorly.marketing`). HTML `max-age=300`, assets immutable.
- Headers by the response-headers policy (HSTS, nosniff, referrer policy, `frame-ancestors 'none'`); the page CSP allows only same-origin scripts, styles and fonts, and `connect-src` to the lead and plans endpoint origins (the same API origin). CORS: the platform allow-lists the site origin (registry `cors.kiorex.api`).

## Tests

`npx vitest run apps/kiorly-site` (config, the plans reader and renderer in jsdom, client validation, whole-site build checks: both languages, RTL, sections, SEO, brand parity, no localhost or hardcoded host, no price in the build, links and ids resolve, production variant) and `npx playwright test -c apps/kiorly-site/e2e/playwright.config.ts` (a mock-leads site and a live-endpoint site on ports 5496/5497 with the endpoint intercepted: language redirect and RTL, no horizontal scroll at 375/768/1280, tabs by keyboard, reduced motion, no-JavaScript, axe on the page, every tab and every form step in both languages, the full form flow, conditional fields, validation, idempotent retry, 400 to step mapping, live configuration, honeypot, and the live plans with the endpoint intercepted: tabs, prices only where set, Arabic digits, fallback on 503 / garbage / silence, join prefill, axe at 375px). The deployed end-to-end is `e2e/kx-test/tests/10-site-leads.spec.ts`.
