import { describe, it, expect, vi } from 'vitest';
import { handoffLogin } from '../src/handoff';

const CODE = 'Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MGFiY2RlZmdoaWo';
const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })) as unknown as typeof fetch;

describe('handoffLogin (what Home sends to the product API)', () => {
  it('Clinic: e-mail + password to the Clinic API only, no token stored, no credentials, no referrer', async () => {
    const f = reply(200, { status: 'OK', code: CODE });
    const r = await handoffLogin('clinic', { email: ' owner.na@demo.kiorex.test ', password: 'Demo@12345', org: '' }, f);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3010/api/v1/auth/handoff/login');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'owner.na@demo.kiorex.test', password: 'Demo@12345' });
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    expect(r).toMatchObject({ kind: 'redirect', fallback: false });
  });
  it('Nurse: the Clinic API with edition NURSE', async () => {
    const f = reply(200, { status: 'OK', code: CODE });
    const r = await handoffLogin('nurse', { email: 'mona@nurse-demo.kiorly.test', password: 'Demo@12345', org: '' }, f);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain(':3010/');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'mona@nurse-demo.kiorly.test', password: 'Demo@12345', edition: 'NURSE' });
    expect(r.kind === 'redirect' && new URL(r.url).searchParams.get('edition')).toBe('NURSE');
  });
  it('Pharmacy API for Pharmacy', async () => {
    const f = reply(200, { status: 'OK', code: CODE });
    await handoffLogin('pharmacy', { email: 'owner@demo.kiorly.local', password: 'Demo@12345', org: '' }, f);
    expect((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBe('http://localhost:3100/api/v1/auth/handoff/login');
  });
  it('Lab: organisation slug + e-mail, and NO password is sent (the Lab has none)', async () => {
    const f = reply(200, { status: 'OK', code: CODE });
    await handoffLogin('lab', { email: 'tech@demo-lab.test', password: 'ignored', org: ' demo-lab ' }, f);
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3200/api/v1/auth/handoff/login');
    expect(JSON.parse(String(init.body))).toEqual({ email: 'tech@demo-lab.test', password: 'ignored', orgSlug: 'demo-lab' });
  });
  it('network failure is a network error (never a silent success)', async () => {
    const f = vi.fn(async () => { throw new TypeError('failed'); }) as unknown as typeof fetch;
    expect(await handoffLogin('clinic', { email: 'a@b.c', password: 'x', org: '' }, f)).toEqual({ kind: 'error', code: 'network' });
  });
  it('an unreadable answer is a server error', async () => {
    const f = vi.fn(async () => new Response('<html>', { status: 502 })) as unknown as typeof fetch;
    expect(await handoffLogin('clinic', { email: 'a@b.c', password: 'x', org: '' }, f)).toEqual({ kind: 'error', code: 'server' });
  });
});
