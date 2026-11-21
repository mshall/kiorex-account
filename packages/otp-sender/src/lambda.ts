/**
 * Lambda entry points (one exported handler per Cognito trigger), wired from environment variables.
 * Deployed by infra/tofu (other repo area): handler = "lambda.defineAuthChallenge" etc.
 * Delivery is driven only by the shared provider env (Docs/PROVIDERS.md): WHATSAPP_MODE / SMS_MODE = real plus
 * <KIND>_API_URL, <KIND>_API_KEY, <KIND>_SENDER_ID, <KIND>_WEBHOOK_SECRET. With both mock the dev log channel is used, which is
 * rejected when NODE_ENV=production. Misconfiguration throws at cold start (variable names only, never values).
 */
import { createOtpChannelFromEnv } from './real-channels.js';
import { createOtpHandlers } from './cognito.js';
import { DEFAULT_OTP_POLICY } from './core.js';

const nodeEnv = process.env.NODE_ENV;
const handlers = createOtpHandlers({
  channel: createOtpChannelFromEnv({ nodeEnv }),
  policy: DEFAULT_OTP_POLICY,
  bypass: { nodeEnv, testNumbers: (process.env.OTP_TEST_NUMBERS ?? '').split(',').filter(Boolean) },
});

export const defineAuthChallenge = handlers.defineAuthChallenge;
export const createAuthChallenge = handlers.createAuthChallenge;
export const verifyAuthChallengeResponse = handlers.verifyAuthChallengeResponse;
