# Passport sign-in page: Create account, duplicates, Go back (28 Nov 2026)

Code: `apps/dev-idp/src/views.ts` (pages), `interactions.ts` (steps), `provider.ts` (`extraParams`). Tests: `apps/dev-idp/test/register-and-back.test.ts`, `apps/passport-ui/e2e/10-register-back.spec.ts`, live `e2e/kx-test/tests/19-passport-register.spec.ts`.

## What a product sends on the authorize request

| Parameter | Values | Effect |
|---|---|---|
| `intent` | `register` or `login` (`signin` is read as `login`; anything else is `login`) | which tab opens: **Create account** or **Sign in**. Not security relevant: the person can switch tabs. `kiorex-ops` has no Create account tab (ops staff are provisioned by administrators). |
| `return_to` | an absolute http(s) URL | where **Go back** from the FIRST step returns. Followed only when its origin equals the origin of one of the client's registered redirect or post-logout URIs and it carries no credentials; otherwise ignored. Never an open redirect. |
| `ui_locales` | `ar` or `en` | language |

Without a valid `return_to`, Go back from the first step answers the product the OAuth way (`error=access_denied` plus `state` at the registered redirect URI) for `kiorex-web` (its documented entry contract), the booking widget popup and native apps; every other web product is sent to the home (`/`) of the origin of the redirect URI of this very request (Passport self-service: `/account`).

## Steps and Go back (decided from server state, never from what the page claims)

phone -> code -> second factor (TOTP) / notice -> passkey offer -> done.
Go back: first step -> the app; code -> phone (the pending code is abandoned, nothing typed is kept, no number in the address); any step after the verified code -> the code step (the same still-valid code is entered again; attempt limits and lockouts are unchanged). The browser Back button on those steps does the same (a `popstate` hook posts the Go back form); OIDC state lives in the interaction cookie and the database, so Back never breaks it.

## Create account and duplicates

- The Create account tab needs the **terms and privacy consent** (server-enforced: no code is sent without it). Links come from `KX_TERMS_URL` and `KX_PRIVACY_URL` (https only; unset: the words are shown without a link). The consent version recorded today is `draft-1`: the wording is the founder's/counsel's to approve. Audit event `account.registered` holds client, consent kind and version.
- Nothing about an account is revealed before the one-time code: after the verified code, a number that already has an account on the **Create account** tab is told "You already have an account" with a Sign in button; a number without an account on the **Sign in** tab is offered "Create account" (name, consent). Requests that send no tab (older clients, API tests) keep the former behaviour: the account is created on the first verified number.
- New accounts get the `patient` role only. Provider staff are never granted anything here: product binding stays the products' (ADR-061: verified phone). Staff products show a note on the Create tab.
- The code length, limits (sign-in limits setting), MFA policy and passkey offer are unchanged.

## Hosted builds

No development note on a public deployment (`DEV_IDP_PUBLIC` or a non-loopback issuer). Selectors kept for the e2e helpers: `#phone`, `#code`, `#totp`, `#totp-skip`, `#finish button`, `form[action$="/phone|/verify|/totp"]`; new: `#consent`, `#create-account`, `#dup-signin`.
