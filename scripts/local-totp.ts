/**
 * LOCAL-ONLY: the per-machine TOTP secrets of the seeded ops accounts (never committed, see apps/dev-idp/src/local-totp.ts).
 *   npm run dev:totp-secrets              create the file if missing and print phone -> secret
 *   npm run dev:totp-secrets -- --rotate  delete and regenerate (then run db:seed:demo / restart the dev IdP so the database follows)
 */
import { REPO_ROOT, loadSeedUsers } from '../apps/dev-idp/src/config.js';
import { localTotpFile, rotateLocalTotpSecrets } from '../apps/dev-idp/src/local-totp.js';

if (/^(production|prod)$/i.test(process.env.NODE_ENV ?? '') || process.env.ISSUER?.startsWith('https://')) throw new Error('local-only tool: refusing to run against a hosted or production environment');
const file = localTotpFile(REPO_ROOT);
if (process.argv.includes('--rotate')) rotateLocalTotpSecrets(file);
const users = loadSeedUsers().filter((u) => u.totp);
console.log(`# local TOTP secrets (${file}); never commit, never copy to a shared environment`);
for (const u of users) console.log(`${u.phone}  ${u.name.padEnd(20)} ${u.totpSecret}`);
