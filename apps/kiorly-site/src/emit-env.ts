/** Prints the registry-derived build variables: `npm run env:emit -w @kiorex/kiorly-site -- --env test`. Read-only; never touches the network. */
import { loadRegistryEnv } from './registry-env';

const args = process.argv.slice(2);
const val = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const id = val('--env');
if (!id) { console.error('usage: env:emit --env <dev|test|staging|pilot|prod> [--registry <file>]'); process.exit(2); }
try { console.log(Object.entries({ KIORLY_SITE_ENV: id, ...(await loadRegistryEnv(id, val('--registry'))) }).map(([k, v]) => `${k}=${v}`).join('\n')); }
catch (e) { console.error((e as Error).message); process.exit(1); }
