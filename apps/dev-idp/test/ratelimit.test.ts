import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startHarness, startAuth, randomPhone, Browser, type Harness } from './helpers.js';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });

async function begin(b = new Browser()) {
  const a = await startAuth(h, { phone: '', browser: b });
  const uid = new URL(a.url).pathname.split('/')[2];
  await b.req(`${h.issuer}/interaction/${uid}`);
  return { b, uid, post: (path: string, form: Record<string, string>) => b.req(`${h.issuer}/interaction/${uid}/${path}`, { method: 'POST', form }) };
}

describe('OTP rate limits and lockout (KA-02)', () => {
  it('allows 5 sends per phone per hour, blocks the 6th (429)', async () => {
    const phone = randomPhone();
    const { post } = await begin();
    expect((await post('phone', { phone })).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await post('resend', {})).status).toBe(200);
    expect(h.channel.sent.filter((m) => m.phone === phone)).toHaveLength(5);
    const sixth = await post('resend', {});
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get('retry-after')).toBeTruthy();
    expect(h.channel.sent.filter((m) => m.phone === phone)).toHaveLength(5); // nothing sent
    // the limit is per phone, across interactions and IPs
    const other = await begin(new Browser());
    expect((await other.post('phone', { phone })).status).toBe(429);
  });

  it('allows 20 sends per IP per hour, blocks the 21st', async () => {
    const ip = '203.0.113.77';
    const { post } = await begin(new Browser(ip));
    for (let i = 0; i < 20; i++) expect((await post('phone', { phone: randomPhone() })).status).toBe(200);
    expect((await post('phone', { phone: randomPhone() })).status).toBe(429);
    // another IP is unaffected
    const fresh = await begin();
    expect((await fresh.post('phone', { phone: randomPhone() })).status).toBe(200);
  });

  it('5 wrong attempts kill the challenge; correct code afterwards is refused and the phone is locked', async () => {
    const phone = randomPhone();
    const { post } = await begin();
    await post('phone', { phone });
    const right = h.channel.lastCodeFor(phone)!;
    const wrong = right === '111111' ? '222222' : '111111';
    for (let i = 0; i < 4; i++) {
      const r = await post('verify', { code: wrong });
      expect(r.status).toBe(400);
    }
    const fifth = await post('verify', { code: wrong });
    expect(fifth.status).toBe(429);
    expect((await post('verify', { code: right })).status).toBe(429); // too late
    // new challenge is refused while locked out
    const again = await begin();
    const resend = await again.post('phone', { phone });
    expect(resend.status).toBe(429);
    expect(h.channel.sent.filter((m) => m.phone === phone)).toHaveLength(1);
  });

  it('remaining attempts are reported and a correct code within the limit succeeds', async () => {
    const phone = randomPhone();
    const { post } = await begin();
    await post('phone', { phone });
    const right = h.channel.lastCodeFor(phone)!;
    const wrong = right === '111111' ? '222222' : '111111';
    const r = await post('verify', { code: wrong });
    expect(await r.text()).toContain('4 attempt');
    const ok = await post('verify', { code: right });
    expect([200, 303]).toContain(ok.status);
  });

  it('rejects malformed phone numbers', async () => {
    const { post } = await begin();
    expect((await post('phone', { phone: '0100000' })).status).toBe(400);
    expect((await post('phone', { phone: 'abc' })).status).toBe(400);
  });

  it('expired challenges are rejected', async () => {
    const phone = randomPhone();
    const { post, uid } = await begin();
    await post('phone', { phone });
    await h.idp.pool.query(`UPDATE otp_challenges SET expires_at = now() - interval '1 minute' WHERE interaction_uid=$1`, [uid]);
    const r = await post('verify', { code: h.channel.lastCodeFor(phone)! });
    expect(r.status).toBe(400);
  });

  it('clear OTP codes are never stored in the database', async () => {
    const phone = randomPhone();
    const { post } = await begin();
    await post('phone', { phone });
    const code = h.channel.lastCodeFor(phone)!;
    const rows = await h.idp.pool.query(`SELECT * FROM otp_challenges WHERE phone=$1`, [phone]);
    expect(JSON.stringify(rows.rows)).not.toContain(`"${code}"`);
    expect(rows.rows[0].hash).toHaveLength(64);
  });
});
