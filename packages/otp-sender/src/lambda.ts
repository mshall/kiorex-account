/**
 * Lambda entry points (one exported handler per Cognito trigger), wired from environment variables.
 * Deployed by infra/tofu (other repo area): handler = "lambda.defineAuthChallenge" etc.
 * OTP_CHANNEL: whatsapp-sms in staging/prod. "log" is rejected when NODE_ENV=production.
 */
import { createChannel, type ChannelMode } from './channels.js';
import { createOtpHandlers } from './cognito.js';
import { DEFAULT_OTP_POLICY } from './core.js';

const nodeEnv = process.env.NODE_ENV;
const mode = (process.env.OTP_CHANNEL ?? 'log') as ChannelMode;
const handlers = createOtpHandlers({
  channel: createChannel(mode, {
    nodeEnv,
    whatsapp: process.env.WA_PHONE_NUMBER_ID ? {
      phoneNumberId: process.env.WA_PHONE_NUMBER_ID,
      accessToken: process.env.WA_ACCESS_TOKEN ?? '',
      templates: {
        ar: process.env.WA_TEMPLATE_AR ?? 'TODO_NEEDS_HUMAN_WA_AUTH_TEMPLATE_AR',
        en: process.env.WA_TEMPLATE_EN ?? 'TODO_NEEDS_HUMAN_WA_AUTH_TEMPLATE_EN',
      },
    } : undefined,
  }),
  policy: DEFAULT_OTP_POLICY,
  bypass: { nodeEnv, testNumbers: (process.env.OTP_TEST_NUMBERS ?? '').split(',').filter(Boolean) },
});

export const defineAuthChallenge = handlers.defineAuthChallenge;
export const createAuthChallenge = handlers.createAuthChallenge;
export const verifyAuthChallengeResponse = handlers.verifyAuthChallengeResponse;
