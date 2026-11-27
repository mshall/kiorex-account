import { isPublicDeployment } from './public-mode.js';

/**
 * Server-side gate for the fixed dev OTP 000000 on the seeded numbers. NOTHING of this is rendered: the sign-in pages never show a
 * quick-pick panel, demo users, codes, seeds or hints (founder decision 27 Nov 2026, every build). Off in production; in public mode it
 * follows KX_DEV_OTP_BYPASS (public-mode.ts).
 */
export function devTestUsersEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const prod = [env.NODE_ENV, env.KX_ENV, env.APP_ENV].some((v) => ['production', 'prod'].includes((v ?? '').toLowerCase()));
  if (isPublicDeployment(env) && env.KX_DEV_OTP_BYPASS !== 'true') return false;
  return !prod && (env.KX_DEV_TEST_USERS ?? 'true').toLowerCase() !== 'false';
}
