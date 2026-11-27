# Sign-in limits (one-time-code numbers as an audited setting)

Status: built and tested 28 Nov 2026 (`apps/dev-idp/src/signin-limits.ts`, Passport web `Ops, Sign-in limits`, `/account/ops/limits`, EN and AR).

The numbers that bound one-time codes used to be editable only in `config/idp.json` (`passwordless.otp`). Operations can now propose changes in the Passport web; a different ops admin or super admin approves (a super admin may apply directly as a break-glass, audited); the value is live within 5 seconds, no redeploy.

| Setting | Default (today's file value) | Hard range (code, not a setting) |
|---|---|---|
| `maxSendsPerPhonePerHour` | 5 | 1 to 10 |
| `maxSendsPerIpPerHour` | 20 | 5 to 60 |
| `maxAttemptsPerChallenge` | 5 | 3 to 8 |
| `ttlSeconds` | 300 | 60 to 600 |
| `lockoutMinutesAfterExhaustedChallenge` | 15 | 5 to 240 |

- Nothing stored means the file applies. Only values that differ from the file are stored.
- The ranges are enforced when a change is proposed, when it is applied and when a value is read (a row written by hand is clamped), so an abuse control can be tuned but never switched off or opened wide.
- Not configurable here on purpose: code length, channels, the development bypass (deployment facts), TOTP attempt limits, the baseline MFA roles.
- Storage: tables `signin_limits` (one row) and `signin_limits_changes` (the maker-checker log), created by the idempotent start-up migration. Audit events: `signin.limits.proposed`, `applied`, `applied_direct`, `rejected`, `withdrawn`.
- API (ops role plus a fresh MFA step-up): `GET /api/ops/signin-limits`, `POST /api/ops/signin-limits/changes` (`{ limits, note?, apply? }`), `POST /api/ops/signin-limits/changes/{id}/approve|reject|withdraw`.
- Remember the shared-address caveat of CloudFront: the per-address limit counts the real client address behind the CDN (hardening release of 27 Nov 2026).
