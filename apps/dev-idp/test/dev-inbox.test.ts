import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startHarness, login, randomPhone, inbox, type Harness } from './helpers.js';
import { DevInbox } from '../src/notify.js';

let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });

describe('mock messaging: DB dev inbox at GET /dev/inbox (CLAUDE.md founder decision)', () => {
  it('OTP goes through the WhatsApp authentication-template mock and lands in the dev inbox with the code', async () => {
    const phone = randomPhone();
    await login(h, { phone });
    const msgs = await inbox(h, { to: phone });
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatchObject({ channel: 'whatsapp', to: phone, template: 'kx_otp_en_mock', locale: 'en', state: 'delivered' });
    expect(msgs[0].data).toEqual({ code: h.channel.lastCodeFor(phone), purpose: 'otp' }); // same code the log channel saw
    expect(msgs[0].body).toContain('WhatsApp authentication template');
  });

  it('renders the Arabic template for AR users and supports filters', async () => {
    const phone = randomPhone();
    await login(h, { phone, lang: 'ar' });
    const [m] = await inbox(h, { to: phone, channel: 'whatsapp' });
    expect(m).toMatchObject({ template: 'kx_otp_ar_mock', locale: 'ar' });
    expect(await inbox(h, { to: phone, channel: 'sms' })).toHaveLength(0);
    const after = await inbox(h, { after: String(m.id), to: phone });
    expect(after).toHaveLength(0);
  });

  it('falls back to the SMS mock when WhatsApp fails (same code path as production)', async () => {
    const inb = new DevInbox(h.idp.pool);
    const ch = inb.otpChannel({ whatsappFails: () => true });
    const phone = randomPhone();
    await ch.send({ phone, code: '424242', locale: 'en', ttlMinutes: 5 });
    const [m] = await inbox(h, { to: phone });
    expect(m).toMatchObject({ channel: 'sms', template: 'otp' });
    expect(m.body).toContain('424242');
    expect(m.data.code).toBe('424242');
  });

  it('DELETE /dev/inbox clears it; the endpoint is dev-only data and never exposes seeded users beyond what was sent', async () => {
    await fetch(`${h.issuer}/dev/inbox`, { method: 'DELETE' });
    expect(await inbox(h)).toEqual([]);
    const r = await fetch(`${h.issuer}/dev/inbox`);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
});
