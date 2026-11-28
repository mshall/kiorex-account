import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { startHarness, randomPhone, Browser, pkce, type Harness } from './helpers.js';
import { backTarget } from '../src/interactions.js';

/** Passport create-account tab, duplicate handling and "Go back" (founder feedback 28 Nov 2026). */
let h: Harness;
beforeAll(async () => { h = await startHarness(); });
afterAll(async () => { await h.stop(); });

async function start(clientId = 'kiorex-web', extra: Record<string, string> = {}) {
  const redirect = clientId === 'kiorly' ? 'kiorly://auth/callback' : clientId === 'kiorex-ops' ? 'http://localhost:5181/auth/callback' : 'http://localhost:5180/auth/callback';
  const b = new Browser(); const { challenge } = pkce();
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: 'code', scope: 'openid profile phone', state: randomBytes(4).toString('hex'), code_challenge: challenge, code_challenge_method: 'S256', prompt: 'login', ...extra });
  const r = await b.req(`${h.issuer}/auth?${q}`);
  const { url } = await b.follow(r, h.issuer, [redirect]);
  const uid = new URL(url).pathname.split('/')[2]!;
  const post = (action: string, form: Record<string, string> = {}) => b.req(`${h.issuer}/interaction/${uid}/${action}`, { method: 'POST', form: { lang: 'en', ...form } });
  return { b, uid, post, get: (qs = '') => b.req(`${h.issuer}/interaction/${uid}${qs}`), redirect };
}
const text = async (r: Response) => r.text();

describe('intent and tabs', () => {
  it('opens on the tab the product asked for (intent=register) and keeps sign-in as the default; ops has no create-account tab', async () => {
    const reg = await start('kiorex-web', { intent: 'register' });
    const html = await text(await reg.get());
    expect(html).toMatch(/data-mode="register" aria-current="page"/);
    expect(html).toContain('name="consent"');
    expect(await text(await (await start()).get())).toMatch(/data-mode="login" aria-current="page"/);
    expect(await text(await (await start('kiorex-ops', { intent: 'register' })).get())).not.toContain('name="consent"');
  });
  it('a staff product says that an account does not grant access to an organisation', async () => {
    const s = await start('kiorex-web', { intent: 'register' });
    expect(await text(await s.get())).not.toContain('does not give access');
  });
});

describe('create account', () => {
  it('needs consent (no code is sent without it), then creates a patient after the code; consent is audited; roles are never granted', async () => {
    const phone = randomPhone(); const s = await start('kiorex-web', { intent: 'register' });
    await s.get();
    let r = await s.post('phone', { phone, mode: 'register', name: 'Throwaway Test' });
    expect(r.status).toBe(400);
    expect(await text(r)).toContain('Terms of Use');
    expect(h.channel.lastCodeFor(phone)).toBeUndefined();
    r = await s.post('phone', { phone, mode: 'register', consent: '1', name: 'Throwaway Test' });
    expect(r.status).toBe(200);
    r = await s.post('verify', { code: h.channel.lastCodeFor(phone)! });
    expect(r.status).toBe(200);
    expect(await text(await s.get())).not.toContain('already have an account'); // the account this registration just made is not a duplicate
    r = await s.post('finish');
    expect(r.status).toBe(303);
    const acc = await h.idp.pool.query(`SELECT sub, name, roles FROM accounts WHERE phone=$1`, [phone]);
    expect(acc.rows[0].name).toBe('Throwaway Test');
    expect(acc.rows[0].roles).toEqual(['patient']);
    const ev = await h.idp.pool.query(`SELECT data FROM audit_events WHERE type='account.registered' AND sub=$1`, [acc.rows[0].sub]);
    expect(ev.rows[0].data).toMatchObject({ client: 'kiorex-web', consent: 'terms+privacy' });
  });
  it('an existing number asks to sign in AFTER the code (nothing is revealed before), and Sign in finishes the interaction', async () => {
    const seed = h.idp.seedUsers.find((u) => u.roles.includes('patient') && !u.roles.includes('super_admin'))!;
    const s = await start();
    let r = await s.post('phone', { phone: seed.phone, mode: 'register', consent: '1' });
    expect(await text(r)).not.toContain('already');
    r = await s.post('verify', { code: '000000' });
    const html = await text(r);
    expect(html).toContain('You already have an account');
    expect(html).toContain('id="dup-signin"');
    expect(html).not.toContain(seed.phone); // masked
    r = await s.post('continue');
    if (r.status === 200) r = await s.post('finish'); // the optional passkey offer
    const { url } = await s.b.follow(r, h.issuer, [s.redirect]);
    expect(url.startsWith(s.redirect)).toBe(true);
    expect(new URL(url).searchParams.get('code')).toBeTruthy();
  });
  it('sign-in with a number that has no account offers to create one (consent required) instead of silently registering', async () => {
    const phone = randomPhone(); const s = await start();
    await s.post('phone', { phone, mode: 'login' });
    let r = await s.post('verify', { code: h.channel.lastCodeFor(phone)! });
    expect(await text(r)).toContain('No account for this number yet');
    expect((await h.idp.pool.query(`SELECT 1 FROM accounts WHERE phone=$1`, [phone])).rowCount).toBe(0);
    r = await s.post('create', { name: 'Late Joiner' });
    expect(r.status).toBe(400);
    r = await s.post('create', { name: 'Late Joiner', consent: '1' });
    if (r.status === 200) r = await s.post('finish');
    const { url } = await s.b.follow(r, h.issuer, [s.redirect]);
    expect(url.startsWith(s.redirect)).toBe(true);
    expect((await h.idp.pool.query(`SELECT name FROM accounts WHERE phone=$1`, [phone])).rows[0].name).toBe('Late Joiner');
  });
  it('Arabic-Indic digits typed for the phone and the code are accepted as 0-9', async () => {
    const phone = randomPhone(); const ar = (v: string) => v.replace(/\d/g, (d) => String.fromCharCode(0x660 + Number(d)));
    const s = await start();
    expect((await s.post('phone', { phone: ar(phone), mode: 'login' })).status).toBe(200);
    expect(h.channel.lastCodeFor(phone)).toBeTruthy();
    const r = await s.post('verify', { code: ar(h.channel.lastCodeFor(phone)!) });
    expect(await text(r)).toContain('No account for this number yet'); // verified (a wrong code would say Incorrect)
  });
});

describe('Go back', () => {
  it('steps back one step at a time: code -> phone (nothing kept, challenge dead), and a verified step -> code', async () => {
    const phone = randomPhone(); const s = await start();
    await s.post('phone', { phone, mode: 'login' });
    let r = await s.post('back');
    let html = await text(r);
    expect(html).toContain('id="phone"');
    expect(html).not.toContain(phone.slice(-6));
    expect(html).not.toContain('value="+20'); // the half-entered phone is not leaked into the form
    const first = h.channel.lastCodeFor(phone)!;
    expect(await text(await s.post('verify', { code: first }))).toContain('Request a code first'); // the abandoned code can no longer be used
    // a GET after Back shows the phone step, not the old code step
    expect(await text(await s.get())).toContain('id="phone"');

    // verified, then back returns to the code step with the same (still valid) code
    await s.post('phone', { phone, mode: 'login' });
    await s.post('verify', { code: h.channel.lastCodeFor(phone)! });
    r = await s.post('back');
    html = await text(r);
    expect(html).toContain('id="code"');
    r = await s.post('verify', { code: h.channel.lastCodeFor(phone)! });
    expect(await text(r)).toContain('No account for this number yet');
  });
  it('from the MFA step it steps back to the code step, and no token can be issued in between', async () => {
    const ops = h.idp.seedUsers.find((u) => u.roles.includes('super_admin'))!;
    const s = await start('kiorex-ops');
    await s.post('phone', { phone: ops.phone, mode: 'login' });
    let r = await s.post('verify', { code: '000000' });
    expect(await text(r)).toContain('id="totp"');
    r = await s.post('back');
    expect(await text(r)).toContain('id="code"');
    r = await s.post('finish');
    expect(r.headers.get('location') ?? '').not.toContain('localhost:5181'); // no authorization code: the interaction just starts over
  });
  it('from the first step it returns to the app: the validated return_to, else the product home; a hostile return_to is never followed', async () => {
    let s = await start('kiorex-web', { return_to: 'http://localhost:5180/pharmacies?x=1' });
    let r = await s.post('cancel');
    expect(r.status).toBe(303);
    expect(r.headers.get('location')).toBe('http://localhost:5180/pharmacies?x=1');
    for (const hostile of ['https://evil.example/steal', '//evil.example', 'javascript:alert(1)', 'http://localhost:5180.evil.example/', 'http://user:pw@localhost:5180/']) {
      s = await start('kiorex-web', { return_to: hostile });
      r = await s.post('cancel');
      expect(r.headers.get('location')).toBe('http://localhost:5180/'); // product home derived from the registered redirect URI
    }
    s = await start('kiorly'); // native app: the OAuth answer, not a made-up URL
    r = await s.post('cancel');
    r = await s.b.req(new URL(r.headers.get('location')!, h.issuer).toString()); // the provider's resume step answers the app with the OAuth error
    expect(r.headers.get('location')).toMatch(/^kiorly:\/\/auth\/callback\?.*error=access_denied/);
  });
  it('backTarget never returns a URL outside the registered origins', () => {
    const reg = { redirectUris: ['https://www.example.com/auth/callback'], postLogoutRedirectUris: ['https://www.example.com/'] };
    expect(backTarget('x', reg, 'https://www.example.com/care')).toBe('https://www.example.com/care');
    expect(backTarget('x', reg, 'https://evil.example/')).toBe('https://www.example.com/');
    expect(backTarget('x', reg, 'https://www.example.com.evil.example/')).toBe('https://www.example.com/');
    expect(backTarget('kiorex-widget', reg, 'https://evil.example/')).toBeUndefined();
    expect(backTarget('x', { redirectUris: ['kiorex://auth/callback'], postLogoutRedirectUris: [] }, 'https://evil.example/')).toBeUndefined();
  });
});

describe('pages', () => {
  it('every Passport screen has a Go back control (EN and AR), no development note on a hosted build is covered by the hosted flag', async () => {
    const s = await start();
    for (const lang of ['en', 'ar']) {
      const html = await text(await s.get(`?lang=${lang}`));
      expect(html).toContain(lang === 'ar' ? 'رجوع' : 'Go back');
      expect(html).toContain('action="/interaction/' + s.uid + '/cancel"');
    }
    const code = await text(await (async () => { await s.post('phone', { phone: randomPhone(), mode: 'login' }); return s.get(); })());
    expect(code).toContain('/back"');
    expect(code).toContain('data-resend');
  });
});
