import { assertNotProduction, DEV_ONLY_BANNER } from './guard.js';

// Safety is unchanged: production is refused first, whatever else is set (see public-mode.ts for the supported public DEV deployment).
try { assertNotProduction(); } catch { process.exit(1); }
console.log(DEV_ONLY_BANNER);

const { loadIdpConfig, runtimeFromEnv, parseClientOverrides } = await import('./config.js');
const { assertPublicConfig, PUBLIC_DEV_BANNER } = await import('./public-mode.js');
const { createApp } = await import('./app.js');

const cfg = loadIdpConfig();
const runtime = runtimeFromEnv(cfg);
if (runtime.publicMode) {
  console.log(PUBLIC_DEV_BANNER);
  const overrides = parseClientOverrides();
  try {
    assertPublicConfig({
      env: process.env, issuer: runtime.issuer,
      confidentialClients: cfg.clients.filter((c) => c.type === 'confidential').map((c) => ({ clientId: c.clientId, secretOverridden: !!overrides[c.clientId]?.clientSecret })),
    });
  } catch { process.exit(1); }
}
const app = await createApp({ runtime, cfg });
console.log(`[dev-idp] issuer        ${app.issuer}`);
console.log(`[dev-idp] discovery     ${app.issuer}/.well-known/openid-configuration`);
console.log(`[dev-idp] health        ${app.issuer}/healthz`);
console.log(`[dev-idp] database      ${runtime.databaseUrl.replace(/:[^:@/]*@/, ':***@')} (schema ${runtime.schema})`);
console.log(`[dev-idp] passkeys flag account.passkeys=${runtime.passkeysEnabled}`);
console.log(runtime.devOtpBypass === false
  ? '[dev-idp] demo OTP 000000 is OFF (set KX_DEV_OTP_BYPASS=true to enable it for the seeded numbers)'
  : `[dev-idp] seed numbers  ${app.testNumbers.join(', ')} (OTP 000000 accepted; codes are also logged below)`);

const stop = async () => { await app.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
