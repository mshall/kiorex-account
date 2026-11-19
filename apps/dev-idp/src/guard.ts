export const DEV_ONLY_BANNER = `
################################################################################
#                                                                              #
#   KIOREX ACCOUNT  -  DEV IDP  -  LOCAL DEVELOPMENT AND E2E TESTS ONLY        #
#                                                                              #
#   This server accepts a fixed OTP (000000) for seeded numbers, logs OTPs to  #
#   the console and uses throwaway keys + cookie secrets.                      #
#   It MUST NEVER run in production. Production uses the managed IdP           #
#   (see Docs/IDP_SCORECARD.md and the Cognito tofu stack).                    #
#                                                                              #
################################################################################
`;

export function assertNotProduction(env: NodeJS.ProcessEnv = process.env): void {
  const flagged = [env.NODE_ENV, env.KX_ENV, env.APP_ENV].some((v) => (v ?? '').toLowerCase() === 'production' || (v ?? '').toLowerCase() === 'prod');
  if (flagged) {
    console.error(DEV_ONLY_BANNER);
    console.error('REFUSING TO START: NODE_ENV/KX_ENV indicates production. The dev IdP is development-only.');
    throw new Error('dev-idp refuses to start in production');
  }
}
