import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSync } from 'otplib';
import { ensureLocalTotpSecrets } from '../apps/dev-idp/src/local-totp.js';
import { loadSeedUsers } from '../apps/dev-idp/src/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('no published TOTP secret (27 Nov 2026)', () => {
  it('no tracked file carries a fixed TOTP seed or a seed-style Base32 literal', () => {
    const files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter((f) => f && !/package-lock\.json$|\.(png|ico|woff2?|ttf|svg)$/.test(f));
    const hits: string[] = [];
    for (const f of files) {
      if (f === 'test/no-published-totp-secrets.test.ts' || !existsSync(path.join(root, f)) || statSync(path.join(root, f)).isDirectory()) continue;
      const text = readFileSync(path.join(root, f), 'utf8');
      if (/TOTPSEED/i.test(text)) hits.push(`${f}: TOTPSEED`);
      if (/["']totpSecret["']\s*:\s*["'][A-Z2-7]{16,}["']/.test(text)) hits.push(`${f}: committed totpSecret`);
    }
    expect(hits).toEqual([]);
  });

  it('the seed only marks who has a TOTP; the secret is generated locally, random, stable and private (0600)', () => {
    const seed = JSON.parse(readFileSync(path.join(root, 'config/seed-users.json'), 'utf8')).users as Array<{ phone: string; totp?: boolean; totpSecret?: string }>;
    expect(seed.filter((u) => u.totp).length).toBeGreaterThanOrEqual(3);
    expect(seed.some((u) => u.totpSecret)).toBe(false);
    const dir = mkdtempSync(path.join(os.tmpdir(), 'kx-totp-'));
    const file = path.join(dir, 'secrets.json');
    const logs: string[] = [];
    const a = ensureLocalTotpSecrets(file, ['+201000000099', '+201000009001'], (m) => logs.push(m));
    const b = ensureLocalTotpSecrets(file, ['+201000000099', '+201000009001', '+201000009002'], () => undefined);
    expect(a['+201000000099']).toMatch(/^[A-Z2-7]{32}$/);
    expect(a['+201000000099']).not.toBe(a['+201000009001']);
    expect(b['+201000000099']).toBe(a['+201000000099']); // stable across restarts, new accounts are added
    expect(b['+201000009002']).toMatch(/^[A-Z2-7]{32}$/);
    expect(statSync(file).mode & 0o077).toBe(0);
    expect(logs.join()).not.toContain(a['+201000000099']); // the log names the file, never a secret
    expect(generateSync({ secret: a['+201000000099'], strategy: 'totp' })).toMatch(/^\d{6}$/);
  });

  it('a hosted start loads no secret at all (totp: none)', () => {
    expect(loadSeedUsers(undefined, { totp: 'none' }).some((u) => u.totpSecret)).toBe(false);
    const local = loadSeedUsers(undefined, { totp: 'local', env: { KX_LOCAL_TOTP_FILE: path.join(mkdtempSync(path.join(os.tmpdir(), 'kx-totp-')), 's.json') } });
    expect(local.filter((u) => u.totpSecret).length).toBe(local.filter((u) => u.totp).length);
  });
});
