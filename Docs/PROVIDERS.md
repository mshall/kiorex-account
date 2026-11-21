# Outbound providers (Passport): SMS and WhatsApp for OTP and notifications

Same variable names and neutral payloads as the Kiorex platform (`kiorex-platform/Docs/PROVIDERS.md`). Going live = setting env values; no code change when the vendor speaks the neutral format, otherwise adapt the single mapping file for that kind.

## 1. Inventory

| Flow | Code | Kind |
|---|---|---|
| Phone OTP (Cognito custom auth Lambda) | `packages/otp-sender/src/lambda.ts` -> `createOtpChannelFromEnv` | WHATSAPP first, SMS fallback |
| Phone OTP (local dev IdP) | `apps/dev-idp/src/otp.ts` + `createApp` channel selection | same |
| Notifications (guardian link, org invitation, account-link verification, merge) | `apps/dev-idp/src/notify.ts` `Notifier` | WHATSAPP |
| Delivery status | `apps/dev-idp/src/delivery.ts`, `POST /webhooks/{sms|whatsapp}` | SMS, WHATSAPP |

Email and payments are not used by Passport (the kit in `packages/otp-sender/src/providers/` keeps all four kinds' env parsing for parity).

## 2. Environment

| Variable | Meaning |
|---|---|
| `WHATSAPP_MODE` / `SMS_MODE` | `mock` (default) or `real` |
| `<KIND>_API_URL` | vendor base URL (https; loopback http only for tests) |
| `<KIND>_API_KEY` | secret, sent as `Authorization: Bearer` (mapping may change) |
| `<KIND>_SENDER_ID` | SMS sender id / WhatsApp phone-number id |
| `<KIND>_WEBHOOK_SECRET` | secret (>= 16 chars) for the delivery-status webhook |
| `<KIND>_TIMEOUT_MS`, `<KIND>_MAX_RETRIES` | optional (8000, 2) |
| `WHATSAPP_TEMPLATE_MAP` | optional JSON, e.g. `{"kx_otp_en":"approved_otp_en","kx_otp_ar":"approved_otp_ar","guardian_link_created":"..."}` |

Channel selection (`createOtpChannelFromEnv`): both real = WhatsApp then SMS fallback (KA-02); one real = that one; none real = dev log channel, **rejected when `NODE_ENV=production`**. A misconfigured real kind throws at Lambda cold start / dev IdP start with variable **names only**. The old `OTP_CHANNEL`, `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_TEMPLATE_AR/EN` are no longer read.

## 3. Security properties in real mode

* The code is placed only in the provider request. It is never logged, never in an error (`OTP sms send failed: PROVIDER_INVALID_REQUEST_400`), never stored (only the salted HMAC hash).
* The dev log channel, the dev inbox and every dev route (`/dev/inbox`, `/dev/delivery-status`, `/dev/webhooks/simulate`, `/dev/reset-rate-limits`) are disabled (404) when either kind is real. The dev IdP also refuses to start in production.
* Rate limits are unchanged and enforced before sending: 5 sends per phone per hour, 20 per IP per hour, lockout after an exhausted challenge. Cognito path: WAF + advanced security + the per-challenge attempts in `cognito.ts`.
* `000000` bypass: seeded test numbers only, never when `NODE_ENV=production`.
* HTTP client: timeout, retries with exponential backoff and jitter on network / timeout / 429 / 5xx (never 4xx), one `Idempotency-Key` per send (`otp:<uuid>`), errors mapped to short codes.
* Delivery-status webhook `POST /webhooks/sms` and `/webhooks/whatsapp`: `X-Webhook-Timestamp` + `X-Webhook-Signature: sha256=HMAC(secret, "<ts>.<rawBody>")`, +-300 s tolerance, body `{ "events": [{ "id": "<providerRef>", "status": "sent|delivered|read|failed", "error": "..." }] }`. Persisted in `delivery_status` (provider ref, channel, masked phone, status), forward-only. In AWS the webhook receiver is not part of the Cognito Lambda: it needs an API Gateway route to the dev-IdP-equivalent handler `DeliveryStatus.handleWebhook` (infra follow-up); the verification and parsing code is already in the package.

## 4. Neutral payloads

SMS `POST {SMS_API_URL}/messages` `{ to, from, body, reference }` -> `{ id }`.
WhatsApp `POST {WHATSAPP_API_URL}/messages` `{ to, from, type:"template", template:{ name, language, variables:{ body, code, ttlMinutes } }, reference }` -> `{ id }`.
Mappings to adapt: `packages/otp-sender/src/providers/sms.mapping.ts`, `whatsapp.mapping.ts`.

## 5. Mock mode (default) and dev views

* `GET /dev/inbox[?to=&channel=&template=&after=]` (each message carries `providerRef`), `DELETE /dev/inbox`.
* `GET /dev/delivery-status`; `POST /dev/webhooks/simulate {providerRef, state: DELIVERED|READ|FAILED}` delivers a **signed** webhook through the real handler.
* Dummy data: any seeded phone gets code `000000`; other numbers get a random code visible in the inbox (see DEMO_DATA.md).

## 6. Tests

`packages/otp-sender/test/providers.test.ts` (fake HTTP server: env/fail-fast, retry/backoff/idempotency, timeout, no-leak errors, fallback, HMAC) and `apps/dev-idp/test/providers-real.test.ts` / `providers-mock.test.ts` (end-to-end real-mode OTP, rate limit, disabled dev routes, webhook persistence, simulator).
