import { assertNotProduction } from './guard.js';
assertNotProduction();
const { loadIdpConfig, runtimeFromEnv } = await import('./config.js');
const { createPool } = await import('./db.js');
const rt = runtimeFromEnv(loadIdpConfig());
const pool = createPool(rt.databaseUrl, rt.schema);
await pool.query('TRUNCATE oidc_payloads, otp_challenges, otp_send_log, otp_lockouts, session_meta, passkey_challenges');
await pool.end();
console.log('dev-idp: cleared sessions, tokens and OTP rate limits');
