import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { generateSecret } from 'otplib';

/**
 * LOCAL-ONLY TOTP secrets of the seeded ops accounts.
 *
 * The seed (config/seed-users.json) marks an account `"totp": true`; it NEVER carries a secret. The first local start (or `npm run dev:totp-secrets`)
 * generates one random secret per such account and keeps them in a git-ignored file (default `<repo>/.local/totp-secrets.json`, mode 0600, keyed by phone),
 * so restarts keep working and local tests and e2e can compute codes. A hosted deployment never calls this (public mode reads no file and writes no
 * TOTP at all). `KX_LOCAL_TOTP_FILE` points to another file; consumers in other repos read the same file (see Docs/DEMO_ACCOUNTS.md).
 */
export function localTotpFile(repoRoot: string, env: NodeJS.ProcessEnv = process.env): string {
  return env.KX_LOCAL_TOTP_FILE ? path.resolve(env.KX_LOCAL_TOTP_FILE) : path.join(repoRoot, '.local/totp-secrets.json');
}

function readStore(file: string): Record<string, string> {
  try {
    const j = JSON.parse(readFileSync(file, 'utf8')) as { secrets?: Record<string, string> };
    return j.secrets && typeof j.secrets === 'object' ? j.secrets : {};
  } catch { return {}; }
}

/** Returns phone -> secret for every phone asked for; generates (and stores) the missing ones. Race-safe enough for parallel test workers (exclusive create, then re-read). */
export function ensureLocalTotpSecrets(file: string, phones: string[], log: (m: string) => void = (m) => console.error(m)): Record<string, string> {
  let store = readStore(file);
  const missing = phones.filter((p) => !store[p]);
  if (missing.length) {
    const next = { ...store };
    for (const p of missing) next[p] = generateSecret();
    mkdirSync(path.dirname(file), { recursive: true });
    const body = JSON.stringify({ $comment: 'LOCAL DEV ONLY, generated on this machine, git-ignored. Delete the file (or run npm run dev:totp-secrets -- --rotate) to rotate; then reseed.', secrets: next }, null, 2) + '\n';
    try {
      writeFileSync(file, body, { mode: 0o600, flag: existsSync(file) && Object.keys(store).length ? 'w' : 'wx' });
      log(`[passport] generated local-only TOTP secrets for ${missing.length} seeded account(s) in ${file} (git-ignored)`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    store = readStore(file);
    if (missing.some((p) => !store[p])) { // another worker won the race with a smaller set: merge and write once more
      for (const p of missing) store[p] ??= next[p]!;
      writeFileSync(file, JSON.stringify({ secrets: store }, null, 2) + '\n', { mode: 0o600 });
    }
  }
  return Object.fromEntries(phones.map((p) => [p, store[p]!]));
}

export function rotateLocalTotpSecrets(file: string): void { rmSync(file, { force: true }); }
