import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import {
  buildLogoutToken, verifyLogoutToken, jwksFromKeys, JtiCache, deliverLogoutToken, handleBackchannelLogout,
  BACKCHANNEL_LOGOUT_EVENT,
} from '../src/index.js';

const issuer = 'http://localhost:4400';
let priv: CryptoKey; let getKey: ReturnType<typeof jwksFromKeys>; let other: CryptoKey;

beforeAll(async () => {
  const kp = await generateKeyPair('RS256');
  priv = kp.privateKey as CryptoKey;
  const jwk = await exportJWK(kp.publicKey);
  getKey = jwksFromKeys([{ ...jwk, kid: 'k1', alg: 'RS256', use: 'sig' }]);
  other = (await generateKeyPair('RS256')).privateKey as CryptoKey;
});

const build = (o: Partial<Parameters<typeof buildLogoutToken>[0]> = {}) =>
  buildLogoutToken({ issuer, audience: 'kiorex-web', sub: 'S1', sid: 'sid1', event: 'session.revoked', key: priv, kid: 'k1', ...o });

describe('backchannel logout tokens', () => {
  it('round-trips session.revoked', async () => {
    const v = await verifyLogoutToken(await build(), { issuer, audience: 'kiorex-web', getKey });
    expect(v).toMatchObject({ sub: 'S1', sid: 'sid1', event: 'session.revoked' });
    expect(v.payload.events).toHaveProperty([BACKCHANNEL_LOGOUT_EVENT]);
  });
  it('round-trips subject.deleted without sid', async () => {
    const v = await verifyLogoutToken(await build({ sid: undefined, event: 'subject.deleted' }), { issuer, audience: 'kiorex-web', getKey });
    expect(v.event).toBe('subject.deleted');
    expect(v.sid).toBeUndefined();
  });
  it('rejects wrong audience, issuer, signature, expiry', async () => {
    const t = await build();
    await expect(verifyLogoutToken(t, { issuer, audience: 'other', getKey })).rejects.toThrow();
    await expect(verifyLogoutToken(t, { issuer: 'http://evil', audience: 'kiorex-web', getKey })).rejects.toThrow();
    await expect(verifyLogoutToken(await build({ key: other }), { issuer, audience: 'kiorex-web', getKey })).rejects.toThrow();
    const old = await build({ now: 1000 });
    await expect(verifyLogoutToken(old, { issuer, audience: 'kiorex-web', getKey })).rejects.toThrow();
  });
  it('rejects tokens with nonce, missing event or wrong typ', async () => {
    const mk = (payload: Record<string, unknown>, typ = 'logout+jwt') =>
      new SignJWT(payload).setProtectedHeader({ alg: 'RS256', typ, kid: 'k1' }).setIssuer(issuer).setAudience('kiorex-web')
        .setIssuedAt().setExpirationTime('2m').setJti('j').sign(priv);
    const o = { issuer, audience: 'kiorex-web', getKey };
    await expect(verifyLogoutToken(await mk({ sub: 'a', nonce: 'n', events: { [BACKCHANNEL_LOGOUT_EVENT]: {} } }), o)).rejects.toThrow(/nonce/);
    await expect(verifyLogoutToken(await mk({ sub: 'a', events: {} }), o)).rejects.toThrow(/event/);
    await expect(verifyLogoutToken(await mk({ events: { [BACKCHANNEL_LOGOUT_EVENT]: {} } }), o)).rejects.toThrow(/sub or sid/);
    await expect(verifyLogoutToken(await mk({ sub: 'a', events: { [BACKCHANNEL_LOGOUT_EVENT]: {} } }, 'JWT'), o)).rejects.toThrow();
  });
  it('requires sub or sid when building', async () => {
    await expect(build({ sub: undefined, sid: undefined })).rejects.toThrow();
  });
  it('detects replay with JtiCache', async () => {
    const cache = new JtiCache();
    const t = await build();
    const o = { issuer, audience: 'kiorex-web', getKey, replayCache: cache };
    await verifyLogoutToken(t, o);
    await expect(verifyLogoutToken(t, o)).rejects.toThrow(/replayed/);
  });
  it('handleBackchannelLogout maps to HTTP status', async () => {
    const o = { issuer, audience: 'kiorex-web', getKey };
    expect((await handleBackchannelLogout(await build(), o)).status).toBe(200);
    expect((await handleBackchannelLogout('garbage', o)).status).toBe(400);
    expect((await handleBackchannelLogout(undefined, o)).status).toBe(400);
  });
});

describe('deliverLogoutToken', () => {
  it('posts form body and succeeds on 200', async () => {
    let seen: { body?: string; ct?: string } = {};
    const fetchImpl = (async (_u: string, init: RequestInit) => {
      seen = { body: init.body as string, ct: (init.headers as Record<string, string>)['content-type'] };
      return new Response(null, { status: 200 });
    }) as unknown as typeof fetch;
    const r = await deliverLogoutToken('http://x/y', 'tok', { fetchImpl });
    expect(r).toMatchObject({ ok: true, status: 200, attempts: 1 });
    expect(seen.body).toBe('logout_token=tok');
    expect(seen.ct).toBe('application/x-www-form-urlencoded');
  });
  it('retries 5xx then fails; does not retry 4xx', async () => {
    let n = 0;
    const f5 = (async () => { n++; return new Response(null, { status: 503 }); }) as unknown as typeof fetch;
    const r = await deliverLogoutToken('http://x', 't', { fetchImpl: f5, retries: 2, backoffMs: 1 });
    expect(r).toMatchObject({ ok: false, attempts: 3 });
    expect(n).toBe(3);
    let m = 0;
    const f4 = (async () => { m++; return new Response(null, { status: 400 }); }) as unknown as typeof fetch;
    expect((await deliverLogoutToken('http://x', 't', { fetchImpl: f4, backoffMs: 1 })).attempts).toBe(1);
    expect(m).toBe(1);
  });
  it('reports network errors', async () => {
    const f = (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch;
    const r = await deliverLogoutToken('http://x', 't', { fetchImpl: f, retries: 1, backoffMs: 1 });
    expect(r).toMatchObject({ ok: false, attempts: 2, error: 'ECONNREFUSED' });
  });
});
