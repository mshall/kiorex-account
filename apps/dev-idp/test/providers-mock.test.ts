import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startHarness, login, randomPhone, inbox, type Harness } from './helpers.js';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });

describe('mock mode (default): dev inbox, delivery status and signed webhook simulation', () => {
  it('OTP lands in the dev inbox with a providerRef; /dev/webhooks/simulate advances its status through the verified webhook path', async () => {
    const phone = randomPhone();
    await login(h, { phone });
    const [m] = await inbox(h, { to: phone });
    expect(m.providerRef).toBe(`mock_whatsapp_${m.id}`);
    const sim = (state: string, ref = m.providerRef) => fetch(`${h.issuer}/dev/webhooks/simulate`, { method: 'POST', body: JSON.stringify({ providerRef: ref, state }) });
    expect((await sim('READ')).status).toBe(200);
    const [after] = await inbox(h, { to: phone });
    expect(after.state).toBe('read');
    const st = (await (await fetch(`${h.issuer}/dev/delivery-status`)).json()) as { statuses: Array<{ provider_ref: string; status: string; recipient_masked: string }> };
    expect(st.statuses.find((s) => s.provider_ref === m.providerRef)).toMatchObject({ status: 'READ' });
    expect(st.statuses.find((s) => s.provider_ref === m.providerRef)!.recipient_masked).not.toContain(phone);
    expect((await sim('DELIVERED')).status).toBe(200); // ignored (backwards), still 200
    expect((await inbox(h, { to: phone }))[0].state).toBe('read');
    expect((await sim('BOGUS')).status).toBe(400);
    expect((await sim('FAILED', 'not_a_mock_ref')).status).toBe(400);
  });

  it('the public webhook rejects unsigned calls even in mock mode', async () => {
    const r = await fetch(`${h.issuer}/webhooks/sms`, { method: 'POST', body: JSON.stringify({ events: [{ id: 'x', status: 'delivered' }] }) });
    expect(r.status).toBe(401);
  });
});
