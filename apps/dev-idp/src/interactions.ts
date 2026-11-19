import type { IncomingMessage, ServerResponse } from 'node:http';
import type Provider from 'oidc-provider';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Account, Accounts } from './accounts.js';
import type { OtpService } from './otp.js';
import type { Passkeys } from './passkeys.js';
import type { Audit } from './audit.js';
import { maskPhone } from '@kiorex/otp-sender';
import { clientIp, readBody, readForm, redirect, send } from './http.js';
import { codePage, errorText, passkeyPage, phonePage, totpPage, page, t, t2, esc, type Lang } from './views.js';
import type { Pool } from './db.js';
import type { IdpConfig } from './config.js';
import type { Totp } from './totp.js';
import type { Federation, FederatedResult } from './federation.js';
import { HttpError } from './services.js';
import { clearStates, getState, setState } from './istate.js';

export interface InteractionDeps {
  provider: Provider; accounts: Accounts; otp: OtpService; passkeys: Passkeys; audit: Audit;
  passkeysEnabled: boolean; trustProxy: boolean;
  pool: Pool; cfg: IdpConfig; totp: Totp; federation: Federation;
}

function pickLang(req: IncomingMessage, url: URL, form: Record<string, string>, uiLocales?: unknown): Lang {
  const v = form.lang ?? url.searchParams.get('lang') ?? String(uiLocales ?? '') ?? '';
  if (v.startsWith('ar')) return 'ar';
  if (v.startsWith('en')) return 'en';
  return String(req.headers['accept-language'] ?? '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

/** The first factor that is currently satisfied for an interaction. */
interface FirstFactor { account: Account; method: 'otp' | 'passkey' | 'fed'; amr: string[]; mfa: boolean; fedPending?: FederatedResult }

export async function handleInteraction(d: InteractionDeps, req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const m = url.pathname.match(/^\/interaction\/([^/]+)(?:\/(.*))?$/);
  if (!m) return send(res, 404, { error: 'not_found' });
  const [, uid, action = ''] = m;
  let details;
  try {
    details = await d.provider.interactionDetails(req, res);
  } catch {
    return send(res, 400, page('en', 'Session expired', '<h1>Session expired</h1><p>Start again from the app.</p>'));
  }
  if (details.uid !== uid) return send(res, 400, { error: 'interaction_mismatch' });

  const isPost = req.method === 'POST';
  const isJson = String(req.headers['content-type'] ?? '').includes('application/json');
  const form = isPost && !action.startsWith('passkey') ? await readForm(req) : {};
  const lang = pickLang(req, url, form, details.params.ui_locales);
  const ip = clientIp(req, d.trustProxy);
  const back = () => redirect(res, `/interaction/${uid}?lang=${lang}`);
  const acrCfg = d.cfg.stepUp.acr;

  const otpAccount = async (): Promise<Account | undefined> => {
    const ch = await d.otp.latest(uid);
    if (!ch?.verified_at || ch.consumed_at || ch.locked) return undefined;
    return (await d.accounts.findByPhone(ch.phone)) ?? (await d.accounts.create(ch.phone, ch.locale, ch.name));
  };

  const firstFactor = async (): Promise<FirstFactor | undefined> => {
    const pk = await getState(d.pool, uid, 'passkey_login');
    if (pk) {
      const account = await d.accounts.findBySub(pk.sub);
      if (account) return { account, method: 'passkey', amr: pk.data.amr as string[], mfa: pk.data.uv === true };
    }
    const fl = await getState(d.pool, uid, 'fed_login');
    if (fl) {
      const account = await d.accounts.findBySub(fl.sub);
      if (account) return { account, method: 'fed', amr: ['fed'], mfa: false };
    }
    const account = await otpAccount();
    if (!account) return undefined;
    const fp = await getState(d.pool, uid, 'fed_pending');
    return { account, method: 'otp', amr: fp ? ['otp', 'fed'] : ['otp'], mfa: false, fedPending: fp?.data as unknown as FederatedResult | undefined };
  };

  const secondFactorDone = async (ff: FirstFactor): Promise<boolean> => {
    if (ff.mfa) return true;
    const t = await getState(d.pool, uid, 'totp');
    return !!t && t.sub === ff.account.sub;
  };
  const needsMfa = (ff: FirstFactor) => d.totp.requiresMfa(ff.account);

  const renderTotp = async (ff: FirstFactor, error?: string, status = 200) => {
    const enrol = (await d.totp.isEnrolled(ff.account.sub)) ? undefined : await d.totp.enrolStart(ff.account);
    return send(res, status, totpPage(lang, uid, { error, enrol }));
  };

  const finishLogin = async () => {
    const ff = await firstFactor();
    if (!ff) return back();
    const totpDone = await secondFactorDone(ff);
    if (needsMfa(ff) && !totpDone) return back(); // privileged roles must pass TOTP (KA-03/KA-10) before any token is issued
    if (ff.method === 'otp') {
      const c = await d.otp.consume(uid);
      if (!c) return back();
    }
    if (ff.fedPending) await d.federation.link(ff.account.sub, ff.fedPending);
    const secondFactorAmr = !ff.mfa && totpDone ? ['totp', 'mfa'] : [];
    const amr = [...ff.amr, ...secondFactorAmr];
    const acr = ff.mfa || totpDone ? acrCfg.mfa : acrCfg.basic;
    await d.audit.record('login.success', ff.account.sub, { amr, acr, client: details.params.client_id });
    await clearStates(d.pool, uid);
    await d.provider.interactionFinished(req, res, { login: { accountId: ff.account.sub, amr, acr, remember: true } }, { mergeWithLastSubmission: false });
  };

  /** After a first factor (and any required TOTP): offer passkey registration after phone OTP, else finish. */
  const afterFactors = async (ff: FirstFactor) => {
    if (needsMfa(ff) && !(await secondFactorDone(ff))) return renderTotp(ff);
    if (ff.method === 'otp' && d.passkeysEnabled) return send(res, 200, passkeyPage(lang, uid));
    return finishLogin();
  };

  const phoneView = async (o: { error?: string; phone?: string; name?: string } = {}, status = 200) => {
    const fedPending = await getState(d.pool, uid, 'fed_pending');
    return send(res, status, phonePage(lang, uid, { ...o, passkeyLogin: d.passkeysEnabled, federation: d.federation.available(), fedLinkNotice: !!fedPending }));
  };

  // ---- consent: first-party clients, auto-grant requested scopes/claims/resources ----
  if (details.prompt.name === 'consent' && (action === '' && !isPost)) {
    const { prompt, params, session } = details;
    let grant = details.grantId ? await d.provider.Grant.find(details.grantId) : undefined;
    if (!grant) grant = new d.provider.Grant({ accountId: session!.accountId, clientId: String(params.client_id) });
    const missingScope = prompt.details.missingOIDCScope as string[] | undefined;
    if (missingScope) grant.addOIDCScope(missingScope.join(' '));
    const missingClaims = prompt.details.missingOIDCClaims as string[] | undefined;
    if (missingClaims) grant.addOIDCClaims(missingClaims);
    const missingRes = prompt.details.missingResourceScopes as Record<string, string[]> | undefined;
    if (missingRes) for (const [ind, scopes] of Object.entries(missingRes)) grant.addResourceScope(ind, scopes.join(' '));
    const grantId = await grant.save();
    return void (await d.provider.interactionFinished(req, res, { consent: { grantId } }, { mergeWithLastSubmission: true }));
  }
  if (details.prompt.name !== 'login') return send(res, 400, { error: 'unsupported_prompt', prompt: details.prompt.name });

  const x = t(lang);

  // ---- GET: render step by state ----
  if (!isPost && action === '') {
    const ff = await firstFactor();
    if (ff) return afterFactors(ff);
    const ch = await d.otp.latest(uid);
    if (ch && !ch.locked && !ch.consumed_at && ch.expires_at.getTime() > Date.now()) {
      return send(res, 200, codePage(lang, uid, maskPhone(ch.phone)));
    }
    return phoneView();
  }

  // ---- KA-11 provider SSO / federation (flag account.provider_sso) ----
  if (!isPost && action.startsWith('federate/')) {
    if (!d.federation.isEnabled) return send(res, 403, { error: 'FEATURE_DISABLED', key: d.cfg.federation.flag, scope: 'global' });
    if (action === 'federate/done') {
      const r = await d.federation.takeResult(uid);
      if (!r) return back();
      const linked = await d.federation.findLinked(r.upstream_id, r.upstream_sub);
      if (linked && (await d.accounts.findBySub(linked))) {
        await setState(d.pool, uid, 'fed_login', linked, { upstream: r.upstream_id });
        await d.audit.record('federation.login', linked, { upstream: r.upstream_id });
      } else {
        await setState(d.pool, uid, 'fed_pending', '', r as unknown as Record<string, unknown>);
      }
      return back();
    }
    const upstreamId = action.slice('federate/'.length);
    try {
      return redirect(res, await d.federation.begin(uid, upstreamId, url.searchParams.get('login_hint') ?? undefined));
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.code });
      throw e;
    }
  }

  if (isPost && action === 'phone') {
    const phone = (form.phone ?? '').replace(/[\s-]/g, '');
    const r = await d.otp.send({ interactionUid: uid, phone, ip, locale: lang, name: form.name });
    if (!r.ok) {
      await d.audit.record('otp.send.denied', null, { reason: r.reason, phone: maskPhone(phone) });
      const status = r.reason === 'invalid_phone' ? 400 : r.reason === 'send_failed' ? 502 : 429;
      if (r.retryAfterSeconds) res.setHeader('retry-after', String(r.retryAfterSeconds));
      return phoneView({ error: errorText(lang, r.reason), phone, name: form.name }, status);
    }
    await d.audit.record('otp.sent', null, { phone: maskPhone(phone) });
    return send(res, 200, codePage(lang, uid, maskPhone(phone)));
  }

  if (isPost && action === 'resend') {
    const ch = await d.otp.latest(uid);
    if (!ch) return back();
    const r = await d.otp.send({ interactionUid: uid, phone: ch.phone, ip, locale: lang, name: ch.name });
    if (!r.ok) {
      return send(res, 429, codePage(lang, uid, maskPhone(ch.phone), { error: errorText(lang, r.reason) }),
        r.retryAfterSeconds ? { 'retry-after': String(r.retryAfterSeconds) } : {});
    }
    return send(res, 200, codePage(lang, uid, maskPhone(ch.phone)));
  }

  if (isPost && action === 'change') {
    await d.otp.consume(uid).catch(() => undefined);
    return phoneView();
  }

  if (isPost && action === 'verify') {
    const r = await d.otp.verify(uid, form.code ?? '');
    const ch = await d.otp.latest(uid);
    if (!r.ok) {
      const status = r.reason === 'locked' ? 429 : 400;
      await d.audit.record('otp.verify.failed', null, { reason: r.reason });
      if (!ch || r.reason === 'no_challenge') return phoneView({ error: errorText(lang, 'no_challenge') }, 400);
      return send(res, status, codePage(lang, uid, maskPhone(ch.phone), { error: errorText(lang, r.reason, r.attemptsLeft) }));
    }
    const ff = await firstFactor(); // creates the account on first verified phone
    if (!ff) return back();
    return afterFactors(ff);
  }

  // KA-03/KA-10: TOTP challenge or first-time enrolment for privileged roles
  if (isPost && action === 'totp') {
    const ff = await firstFactor();
    if (!ff || !needsMfa(ff)) return back();
    const enrolled = await d.totp.isEnrolled(ff.account.sub);
    const r = await d.totp.verify(ff.account.sub, form.totp ?? '', { confirm: !enrolled });
    if (!r.ok) {
      await d.audit.record('totp.failed', ff.account.sub, { reason: r.reason });
      const y = t2(lang).totpErr;
      const msg = r.reason === 'wrong' ? y.wrong(r.attemptsLeft ?? 0) : r.reason === 'locked' ? y.locked : y.invalid;
      return renderTotp(ff, msg, r.reason === 'locked' ? 429 : 400);
    }
    if (!enrolled) await d.audit.record('totp.enrolled', ff.account.sub);
    await setState(d.pool, uid, 'totp', ff.account.sub, { step: r.step });
    await d.audit.record('totp.verified', ff.account.sub);
    return afterFactors(ff);
  }

  if (isPost && action === 'finish') return finishLogin();

  // ---- KA-03 passkey LOGIN (WebAuthn assertion) ----
  if (isPost && action === 'passkey/login/options') {
    if (!d.passkeysEnabled) return send(res, 404, { error: 'feature_disabled', key: 'account.passkeys' });
    await readBody(req).catch(() => undefined);
    return send(res, 200, await d.passkeys.loginOptions(`login:${uid}`));
  }
  if (isPost && action === 'passkey/login/verify') {
    if (!d.passkeysEnabled) return send(res, 404, { error: 'feature_disabled', key: 'account.passkeys' });
    if (!isJson) return send(res, 400, { verified: false });
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8')) as AuthenticationResponseJSON;
      const a = await d.passkeys.loginVerify(`login:${uid}`, body);
      if (!a) { await d.audit.record('passkey.login.failed', null, {}); return send(res, 401, { verified: false }); }
      // possession + user verification counts as multi-factor (acr mfa); without UV it is a single factor
      const amr = [a.backedUp ? 'swk' : 'hwk', ...(a.userVerified ? ['user', 'mfa'] : [])];
      await setState(d.pool, uid, 'passkey_login', a.sub, { amr, uv: a.userVerified });
      await d.audit.record('passkey.login', a.sub, { uv: a.userVerified });
      return send(res, 200, { verified: true, user_verified: a.userVerified });
    } catch {
      await d.audit.record('passkey.login.failed', null, {});
      return send(res, 401, { verified: false });
    }
  }
  if (isPost && action === 'passkey/login/finish') return finishLogin();

  // ---- passkey registration (optional step after phone OTP) ----
  if (isPost && action === 'passkey/options') {
    if (!d.passkeysEnabled) return send(res, 404, { error: 'feature_disabled', key: 'account.passkeys' });
    const a = await otpAccount();
    if (!a) return send(res, 401, { error: 'not_verified' });
    await readBody(req).catch(() => undefined);
    return send(res, 200, await d.passkeys.options(a, `uid:${uid}`));
  }
  if (isPost && action === 'passkey/verify') {
    if (!d.passkeysEnabled) return send(res, 404, { error: 'feature_disabled', key: 'account.passkeys' });
    const a = await otpAccount();
    if (!a || !isJson) return send(res, 401, { error: 'not_verified' });
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8')) as RegistrationResponseJSON;
      const ok = await d.passkeys.verify(a, `uid:${uid}`, body);
      if (ok) await d.audit.record('passkey.registered', a.sub);
      return send(res, ok ? 200 : 400, { verified: ok });
    } catch {
      return send(res, 400, { verified: false });
    }
  }
  void esc; void x;
  return send(res, 404, { error: 'not_found' });
}
