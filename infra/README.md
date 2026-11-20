# infra

OpenTofu for Kiorex Passport (ADR-028). **Nothing has been applied; do not deploy** until the founder approves. Back to the [README](../README.md).

| Path | What |
|---|---|
| [tofu/](tofu/README.md) | Modules (`aws`, `contracts`, `product-stack`) and live stacks `staging` and `prod` in Frankfurt |

The stack reads `../config/idp.json` for clients, scopes, claims, lifetimes and OTP/MFA policy; OTP Lambda handlers come from `packages/otp-sender/src/lambda.ts`.
