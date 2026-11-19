import { describe, it, expect } from 'vitest';
import {
  createOtpHandlers, LogChannel, generateCode, hashCode, verifyCodeHash, isDevBypass, createChannel,
  WhatsAppAuthTemplateChannel, SmsChannel, FallbackChannel, maskPhone, CUSTOM_CHALLENGE,
  type CreateEvent, type DefineEvent, type VerifyEvent,
} from '../src/index.js';

const phone = '+201000000001';
const attrs = { phone_number: phone };
const quiet = () => {};

describe('core', () => {
  it('generates numeric codes of the requested length', () => {
    for (let i = 0; i < 50; i++) expect(generateCode(6)).toMatch(/^\d{6}$/);
  });
  it('hash verify is salted and exact', () => {
    const h = hashCode('123456', 'salt');
    expect(verifyCodeHash('123456', 'salt', h)).toBe(true);
    expect(verifyCodeHash('123457', 'salt', h)).toBe(false);
    expect(verifyCodeHash('123456', 'other', h)).toBe(false);
  });
  it('000000 bypass only for test numbers and never in production', () => {
    const b = { nodeEnv: 'development', testNumbers: [phone] };
    expect(isDevBypass(phone, '000000', b)).toBe(true);
    expect(isDevBypass('+201111111111', '000000', b)).toBe(false);
    expect(isDevBypass(phone, '111111', b)).toBe(false);
    expect(isDevBypass(phone, '000000', { ...b, nodeEnv: 'production' })).toBe(false);
  });
  it('masks phones', () => { expect(maskPhone(phone)).toBe('+201*******01'); });
  it('refuses log channel in production', () => {
    expect(() => createChannel('log', { nodeEnv: 'production' })).toThrow();
  });
});

describe('cognito triggers', () => {
  const channel = new LogChannel(quiet);
  const h = createOtpHandlers({ channel, bypass: { nodeEnv: 'test', testNumbers: [phone] } });

  const define = async (session: DefineEvent['request']['session'], userNotFound = false) =>
    (await h.defineAuthChallenge({ request: { userAttributes: attrs, session, userNotFound }, response: {} })).response;

  it('define: starts challenge, issues tokens on success, fails after max attempts', async () => {
    expect(await define([])).toMatchObject({ challengeName: CUSTOM_CHALLENGE, issueTokens: false });
    expect(await define([{ challengeName: CUSTOM_CHALLENGE, challengeResult: true }])).toMatchObject({ issueTokens: true });
    const wrong = Array.from({ length: 5 }, () => ({ challengeName: CUSTOM_CHALLENGE, challengeResult: false }));
    expect(await define(wrong)).toMatchObject({ failAuthentication: true });
    expect(await define(wrong.slice(0, 2))).toMatchObject({ challengeName: CUSTOM_CHALLENGE });
    expect(await define([], true)).toMatchObject({ failAuthentication: true });
  });

  const create = (session: CreateEvent['request']['session'], locale = 'en') =>
    h.createAuthChallenge({
      request: { userAttributes: attrs, challengeName: CUSTOM_CHALLENGE, session, clientMetadata: { locale } },
      response: {},
    });
  const verify = (priv: Record<string, string>, answer: string) =>
    h.verifyAuthChallengeResponse({ request: { userAttributes: attrs, privateChallengeParameters: priv, challengeAnswer: answer }, response: {} } as VerifyEvent);

  it('create sends once, re-uses code on retry, never leaks clear code in params', async () => {
    channel.sent.length = 0;
    const first = await create([]);
    expect(channel.sent).toHaveLength(1);
    expect(channel.sent[0].locale).toBe('en');
    const code = channel.sent[0].code;
    expect(JSON.stringify(first.response)).not.toContain(code);
    expect(first.response.publicChallengeParameters?.phone).toBe(maskPhone(phone));
    const retry = await create([{ challengeName: CUSTOM_CHALLENGE, challengeResult: false, challengeMetadata: first.response.challengeMetadata }]);
    expect(channel.sent).toHaveLength(1);
    expect(retry.response.privateChallengeParameters?.hash).toBe(first.response.privateChallengeParameters?.hash);
  });

  it('verify accepts right code, rejects wrong/expired, accepts 000000 for test numbers', async () => {
    channel.sent.length = 0;
    const c = await create([], 'ar');
    expect(channel.sent[0].locale).toBe('ar');
    const code = channel.sent[0].code;
    const priv = c.response.privateChallengeParameters!;
    expect((await verify(priv, code)).response.answerCorrect).toBe(true);
    expect((await verify(priv, code === '123456' ? '654321' : '123456')).response.answerCorrect).toBe(false);
    expect((await verify(priv, 'abcdef')).response.answerCorrect).toBe(false);
    expect((await verify(priv, '000000')).response.answerCorrect).toBe(true); // test number
    expect((await verify({ ...priv, phone: '+201999999999' }, '000000')).response.answerCorrect).toBe(false);
    expect((await verify({ ...priv, expiresAt: '1' }, code)).response.answerCorrect).toBe(false);
  });

  it('production handler never accepts 000000', async () => {
    const prod = createOtpHandlers({ channel, bypass: { nodeEnv: 'production', testNumbers: [phone] } });
    const c = await prod.createAuthChallenge({ request: { userAttributes: attrs, challengeName: CUSTOM_CHALLENGE, session: [] }, response: {} });
    const r = await prod.verifyAuthChallengeResponse({ request: { userAttributes: attrs, privateChallengeParameters: c.response.privateChallengeParameters!, challengeAnswer: '000000' }, response: {} } as VerifyEvent);
    expect(r.response.answerCorrect).toBe(false);
  });
});

describe('channels', () => {
  const msg = { phone, code: '123456', locale: 'ar' as const, ttlMinutes: 5 };
  it('whatsapp refuses TODO templates', async () => {
    const ch = new WhatsAppAuthTemplateChannel({ phoneNumberId: '1', accessToken: 't', templates: { ar: 'TODO_NEEDS_HUMAN_X', en: 'TODO_NEEDS_HUMAN_Y' } });
    await expect(ch.send(msg)).rejects.toThrow(/TODO_NEEDS_HUMAN/);
  });
  it('whatsapp posts a template message', async () => {
    let body: any; let url = '';
    const fetchImpl = (async (u: string, init: RequestInit) => { url = u; body = JSON.parse(init.body as string); return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
    await new WhatsAppAuthTemplateChannel({ phoneNumberId: '99', accessToken: 't', templates: { ar: 'tmpl_ar', en: 'tmpl_en' }, fetchImpl }).send(msg);
    expect(url).toContain('/99/messages');
    expect(body.to).toBe('201000000001');
    expect(body.template.name).toBe('tmpl_ar');
    expect(body.template.language.code).toBe('ar');
  });
  it('falls back to SMS when WhatsApp fails', async () => {
    const texts: string[] = [];
    const wa = { name: 'whatsapp', send: async () => { throw new Error('down'); } };
    const sms = new SmsChannel({ senderId: 'TODO_NEEDS_HUMAN', publish: async (_p, t) => { texts.push(t); } });
    let fell = false;
    await new FallbackChannel(wa, sms, () => { fell = true; }).send(msg);
    expect(fell).toBe(true);
    expect(texts[0]).toContain('123456');
  });
});
