import { assertNotProduction, DEV_ONLY_BANNER } from './guard.js';

try { assertNotProduction(); } catch { process.exit(1); }
console.log(DEV_ONLY_BANNER);

const { loadIdpConfig, runtimeFromEnv } = await import('./config.js');
const { createApp } = await import('./app.js');

const cfg = loadIdpConfig();
const runtime = runtimeFromEnv(cfg);
const app = await createApp({ runtime, cfg });
console.log(`[dev-idp] issuer        ${app.issuer}`);
console.log(`[dev-idp] discovery     ${app.issuer}/.well-known/openid-configuration`);
console.log(`[dev-idp] database      ${runtime.databaseUrl.replace(/:[^:@/]*@/, ':***@')} (schema ${runtime.schema})`);
console.log(`[dev-idp] passkeys flag account.passkeys=${runtime.passkeysEnabled}`);
console.log(`[dev-idp] seed numbers  ${app.testNumbers.join(', ')} (OTP 000000 accepted; codes are also logged below)`);

const stop = async () => { await app.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
