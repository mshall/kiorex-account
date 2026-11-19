import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startHarness, login, call, randomPhone, events, opsLogin, lastInboxCode, type Harness } from './helpers.js';
import { decodeJwt } from 'jose';

/** Identity events must match the additive schemas in kiorex-contracts (>= 1.2.0). Skipped when the sibling repo is absent (CI). */
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../kiorex-contracts/events');
const has = existsSync(path.join(dir, 'guardian.link.changed.schema.json'));
let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });

function check(type: string, data: Record<string, unknown>) {
  const schema = JSON.parse(readFileSync(path.join(dir, `${type}.schema.json`), 'utf8'));
  const d = schema.properties.data;
  for (const k of d.required) expect(data[k], `${type}.${k} missing`).toBeDefined();
  for (const [k, v] of Object.entries(data)) {
    const def = d.properties[k];
    expect(def, `${type}.${k} is not in the contract`).toBeDefined();
    if (def.enum) expect(def.enum, `${type}.${k}`).toContain(v);
    if (def.const) expect(v).toBe(def.const);
    if (def.type === 'string') expect(typeof v).toBe('string');
    if (def.format === 'date-time') expect(Number.isNaN(Date.parse(String(v)))).toBe(false);
  }
}

describe.skipIf(!has)('identity events conform to kiorex-contracts', () => {
  it('guardian.link.changed, membership.changed and account.merged payloads match their schemas', async () => {
    const a = await login(h, { phone: randomPhone(), name: 'A' });
    const t = a.tokens.access_token;
    await call(h, t, 'POST', '/api/dependants', { name: 'Kid', dob: new Date(Date.now() - 5 * 365 * 86400_000).toISOString().slice(0, 10), relationship: 'parent', evidence: { type: 'self_declared' } });
    await call(h, t, 'POST', '/api/orgs', { legal_name: 'Org', country: 'EG' });
    const bPhone = randomPhone();
    await login(h, { phone: bPhone, name: 'A' });
    const req = await call(h, t, 'POST', '/api/links', { phone: bPhone });
    await call(h, t, 'POST', `/api/links/${req.json.link_id}/verify`, { code: await lastInboxCode(h, bPhone) });
    const ops = await opsLogin(h);
    expect((await call(h, ops.tokens.access_token, 'POST', `/api/ops/links/${req.json.link_id}/approve`, {})).json.status).toBe('merged');
    await call(h, ops.tokens.access_token, 'POST', `/api/ops/links/${req.json.link_id}/reverse`, {});
    const sub = decodeJwt(t).sub;
    for (const type of ['guardian.link.changed', 'membership.changed', 'account.merged']) {
      const list = (await events(h, { type })).filter((e) => JSON.stringify(e.data).includes(sub as string));
      expect(list.length, type).toBeGreaterThan(0);
      for (const e of list) { check(type, e.data); expect(e.aggregateType).toBe(JSON.parse(readFileSync(path.join(dir, `${type}.schema.json`), 'utf8')).properties.aggregateType.const); }
    }
  });
});
