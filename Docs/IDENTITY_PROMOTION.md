# Identity carry-over between environments, and demo data

Open founder decision (ADR-059, `_docs/environments/ENVIRONMENT_STRATEGY.md`): when an environment is promoted (kx-test to kx-pilot / kx-pro), do the people who signed up in the lower one move up, or does every environment start clean? Until the founder chooses, **the tooling refuses to run**.

## The setting

`IDENTITY_PROMOTION_MODE` (read by `apps/dev-idp/src/promotion-mode.ts`, part of `RuntimeOptions.identityPromotionMode`):

| Value | Meaning |
|---|---|
| `ask` (default) | undecided. `npm run identity:export` and `identity:promote` exit with code 3 and do nothing, even for a dry run. |
| `carry` | identities may be exported from one environment and imported into another (below). |
| `separate` | each environment keeps its own identities. The tooling refuses (exit 3). |

An unknown value is an error at start-up, never a silent default. The value belongs to the environment the tool runs against (the source for an export, the target for an import).

## What moves

Carried, subs preserved: `accounts` (persons and dependants, not deleted ones), `account_contacts`, `federated_identities`, `organizations`, `memberships`, `guardian_links`.
Never carried: passkeys (bound to the origin they were enrolled on), TOTP secrets (people enrol again), sessions, OTP state, invitations and SCIM tokens (bearer secrets), link requests, audit events (append-only hash chain per environment), the mock inbox.
**Demo-tagged rows (`data_class = 'DEMO'`) are excluded** unless `--include-demo` is given on the export and on the import; when included they stay tagged DEMO in the target so they can still be removed.

## Procedure

```
# 1. in the SOURCE environment (read only), file is written 0600 and holds personal data: never commit it
IDENTITY_PROMOTION_MODE=carry KX_ENV=test DATABASE_URL=<source> npm run identity:export -- --out test-identities.json

# 2. in the TARGET environment: DRY RUN first (default). It runs the whole import in a transaction and rolls it back, so the counts are exact
IDENTITY_PROMOTION_MODE=carry KX_ENV=pilot DATABASE_URL=<target> npm run identity:promote -- --from test-identities.json --dry-run

# 3. only after reading the report
... npm run identity:promote -- --from test-identities.json --confirm --report report.json --rollback-out rollback.json
```

Rules enforced by the tool: the export checksum must match; source and target environment must both be declared (`KX_ENV`, or `--source-env` / `--target-env`) and differ; an existing row is never overwritten; a phone already used by another sub in the target is a reported conflict and that identity (with its dependants) is skipped; rows whose parent is missing are skipped and counted; `--dry-run` and `--confirm` are mutually exclusive; unknown flags fail.

The report lists, per table, rows inserted and rows already present, demo rows excluded, conflicts (phone masked) and orphans skipped.

## Rollback notes

A confirmed run writes a rollback manifest (the keys it created, nothing else). `npm run identity:promote -- --rollback rollback.json` is a dry run; add `--confirm` to remove exactly those rows (and the passkeys, TOTP, sessions and interaction state created for those subs since). Rows that existed before the import are never in the manifest. Keep the manifest until the promotion is accepted; after people have used the carried accounts a rollback also removes what they did on them, so decide quickly or not at all. A database snapshot before the confirmed run is still the safest rollback.

## The dev IdP is not production

The dev IdP **refuses production mode** (`NODE_ENV`, `KX_ENV`, `APP_ENV` = `production` or `prod`; `apps/dev-idp/src/guard.ts`, the entrypoint and `Docs/DEPLOY_DEV.md`). That guard is unchanged. A production-capable IdP choice (managed IdP, `Docs/IDP_SCORECARD.md`) is a **separate open decision**; this tooling works on the Passport database schema and does not answer it. Setting `IDENTITY_PROMOTION_MODE=carry` does not make the dev IdP acceptable for real people.

## Demo data

Every seeded demo person, dependant and organisation carries `data_class = 'DEMO'` (columns added idempotently by the migration; default `REAL`). Real sign-ups, SCIM provisioning and API-created organisations stay `REAL`.

```
npm run demo-data:remove -- --dry-run     # default: counts per table, nothing deleted
DATABASE_URL=<db> KX_DB_SCHEMA=<schema> npm run demo-data:remove -- --confirm
```

It deletes only rows owned by a DEMO account or DEMO organisation (static check in `test/demo-data.test.ts`), in one transaction, and a second run finds nothing. It never deletes a REAL account or organisation. Rows linking a real account to demo data (a real member of a demo organisation, a guardian link to a demo dependant) are dangling once the demo side is gone: they are removed with it and counted in the report first. `audit_events` is an append-only hash chain and is kept (its count is reported). Accounts that look like old seed rows but were seeded before tagging existed are **reported, not deleted**: re-run `npm run db:seed:demo` (it tags them) and then remove. `--confirm` needs an explicit `DATABASE_URL`.
