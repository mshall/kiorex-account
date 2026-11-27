/**
 * Emits the KX_CLIENT_OVERRIDES_JSON value for a Passport deployment from the service URL registry (ADR-059), so nobody types a redirect URI.
 *
 *   npm run client-overrides:emit -- --env test                        compact JSON on stdout (paste into the task / service environment)
 *   npm run client-overrides:emit -- --env test --format env           KX_CLIENT_OVERRIDES_JSON='...' (a shell / env-file line)
 *   npm run client-overrides:emit -- --env test --pretty               indented
 *   ... --origin-map <registry origin>=<other origin>                  ALSO register another origin for a service (repeatable), for example the default
 *                                                                      CDN host of a first stand-up; the registry hosts stay registered
 *   ... --backchannel same-origin                                      back-channel on the client's own origin (/api/...) instead of the gateway host
 *   ... --with-secrets                                                 add clientSecret for confidential clients from KX_CLIENT_SECRET_<CLIENT> variables
 *                                                                      (KX_CLIENT_SECRET_KIORLY_CLINIC); fails if one is missing. Secrets never come from the registry.
 *   ... --registry <file>                                              default: $KX_REGISTRY_FILE, else ../_docs/registry/service-url-registry.yaml
 *   ... --rows <file>                                                  rows from `validate-registry.mjs --emit redirects --env <e>` (no registry needed)
 *
 * The output is validated with the same parser the IdP uses at start-up (unknown client, wildcard, plain http, secret on a public client all fail here).
 * Read-only: it prints and exits; it never writes a file and never contacts anything.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadIdpConfig } from '../apps/dev-idp/src/config.js';
import { buildClientOverrides, secretEnvName, type NativeClient, type RedirectRow } from './lib/client-overrides.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flags = new Set(['--pretty', '--with-secrets']);
const withValue = new Set(['--env', '--format', '--registry', '--rows', '--origin-map', '--backchannel']);
const bad = args.filter((a, i) => (a.startsWith('--') ? !flags.has(a) && !withValue.has(a) : !withValue.has(args[i - 1] ?? '')));
const fail = (m: string): never => { console.error(m); process.exit(2); };
if (bad.length) fail(`unknown argument(s): ${bad.join(' ')}`);
const vals = (k: string) => args.flatMap((a, i) => (a === k ? [args[i + 1] ?? ''] : []));
const val = (k: string) => vals(k)[0];

const env = val('--env') ?? fail('--env <dev|test|staging|pilot|prod> is required');
const backchannel = (val('--backchannel') ?? 'registry') as 'registry' | 'same-origin';
if (!['registry', 'same-origin'].includes(backchannel)) fail('--backchannel must be registry or same-origin');
const originMap: Record<string, string> = {};
for (const m of vals('--origin-map')) {
  const [from, to] = m.split('=');
  try { if (!from || !to || new URL(from).protocol !== 'https:' || new URL(to).protocol !== 'https:') throw new Error(); } catch { fail(`--origin-map expects https://from=https://to, got "${m}"`); }
  originMap[new URL(from!).origin] = new URL(to!).origin;
}

let rows: RedirectRow[]; let natives: NativeClient[] = []; let issuerEnv: string;
if (val('--rows')) {
  rows = JSON.parse(readFileSync(val('--rows')!, 'utf8')) as RedirectRow[];
  issuerEnv = env === 'pilot' ? 'prod' : env; // the registry's pilot -> prod rule; with --rows the file already holds the issuer group
} else {
  const file = val('--registry') || process.env.KX_REGISTRY_FILE || path.resolve(here, '../../_docs/registry/service-url-registry.yaml');
  if (!existsSync(file)) fail(`registry not found at ${file}: pass --registry <file> or --rows <file> (the registry lives in the workspace repository, _docs/registry)`);
  const validator = path.join(path.dirname(file), 'validate-registry.mjs');
  if (!existsSync(validator)) fail(`validate-registry.mjs not found next to the registry (${validator})`);
  const reg = await import(pathToFileURL(validator).href);
  const r = reg.load(file);
  if (!r.environments.some((e: { id: string }) => e.id === env)) fail(`unknown environment "${env}" (registry has ${r.environments.map((e: { id: string }) => e.id).join(', ')})`);
  issuerEnv = r.oidc.issuer_env[env];
  rows = reg.redirectsFor(r, issuerEnv) as RedirectRow[];
  natives = (r.native_clients ?? []) as NativeClient[];
}

const base = loadIdpConfig(undefined, {});
const confidential = base.clients.filter((c) => c.type === 'confidential').map((c) => c.clientId);
const secrets: Record<string, string> = {};
if (args.includes('--with-secrets')) {
  for (const id of confidential) {
    const v = process.env[secretEnvName(id)];
    if (!v) fail(`--with-secrets: ${secretEnvName(id)} is not set (confidential client ${id}; 32+ random characters, the same value the product API is configured with)`);
    secrets[id] = v!;
  }
}
let overrides;
try { overrides = buildClientOverrides(rows, { env, issuerEnv, nativeClients: natives, originMap, backchannel, secrets }); } catch (e) { fail(e instanceof Error ? e.message : String(e)); }
const json = JSON.stringify(overrides, null, args.includes('--pretty') ? 2 : undefined);
try { loadIdpConfig(undefined, { KX_CLIENT_OVERRIDES_JSON: json }); } catch (e) { fail(`the emitted overrides do not pass the IdP's own validation: ${e instanceof Error ? e.message : e}`); }
const missing = confidential.filter((id) => overrides![id] && !overrides![id]!.clientSecret);
if (missing.length) console.error(`note: confidential client(s) ${missing.join(', ')} need a clientSecret before the IdP will start in public mode: re-run with --with-secrets and ${missing.map(secretEnvName).join(', ')} set.`);
console.log(args.includes('--format') && val('--format') === 'env' ? `KX_CLIENT_OVERRIDES_JSON='${json.replace(/'/g, `'\\''`)}'` : json);
