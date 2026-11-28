import type { IncomingMessage, ServerResponse } from 'node:http';
import type Provider from 'oidc-provider';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Account, Accounts } from './accounts.js';
import type { OtpService } from './otp.js';
import type { Passkeys } from './passkeys.js';
import type { Audit } from './audit.js';
import { maskPhone } from '@kiorex/otp-sender';
import { clientIp, readBody, readForm, redirect, send } from './http.js';
import { codePage, errorText, expiredPage, noticePage, passkeyPage, phonePage, productFor, totpPage, t, t2, esc, type Ctx, type Lang, type Mode } from './views.js';
import type { Pool } from './db.js';
import type { IdpConfig } from './config.js';
import type { Totp } from './totp.js';
import type { MfaPolicy } from './mfa-policy.js';
import type { Federation, FederatedResult } from './federation.js';
import { HttpError } from './services.js';
import { clearStates, delState, getState, setState } from './istate.js';

export interface InteractionDeps {
  provider: Provider; accounts: Accounts; otp: OtpService; passkeys: Passkeys; audit: Audit;
  passkeysEnabled: boolean; trustProxy: boolean;
  pool: Pool; cfg: IdpConfig; totp: Totp; mfaPolicy: MfaPolicy; federation: Federation;
}

function pickLang(req: IncomingMessage, url: URL, form: Record<string, string>, uiLocales?: unknown): Lang {
  const v = form.lang ?? url.searchParams.get('lang') ?? String(uiLocales ?? '') ?? '';
  if (v.startsWith('ar')) return 'ar';
  if (v.startsWith('en')) return 'en';
  return String(req.headers['accept-language'] ?? '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

/** Arabic-Indic and Persian digits typed on a phone keypad become 0-9 (Western digits everywhere). */
const westernDigits = (v: string): string => v.replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace(/[\u06F0-\u06F9]/g, (c) => String(c.charCodeAt(0) - 0x6f0));
const CONSENT_VERSION = 'draft-1';
/** Where the product's home is, derived ONLY from its registered URIs (never from the request). The widget popup and native apps get the OAuth access_denied answer instead. */
const HOME_PATH: Record<string, string | null> = { 'kiorex-passport-web': '/account', 'kiorex-widget': null };

/** Go back to the app: the validated `return_to` (same origin as one of the client's registered redirect or post-logout URIs, http(s) only), else the product home (origin of a registered http(s) redirect URI). Undefined: answer the app with access_denied. */
export function backTarget(clientId: string, registered: { redirectUris: string[]; postLogoutRedirectUris: string[] }, returnTo: unknown, requestRedirectUri?: string): string | undefined {
  // a native app (custom-scheme redirect URI) is answered with the OAuth access_denied error: a web page cannot take the person back into it
  const reqOrigin = (() => { try { const o = new URL(requestRedirectUri ?? registered.redirectUris[0] ?? ''); return o.protocol === 'http:' || o.protocol === 'https:' ? o.origin : undefined; } catch { return undefined; } })();
  if (!reqOrigin) return undefined;
  const origins = new Map<string, string>();
  for (const u of [...registered.redirectUris, ...registered.postLogoutRedirectUris]) {
    try { const o = new URL(u); if (o.protocol === 'http:' || o.protocol === 'https:') origins.set(o.origin, o.origin); } catch { /* native scheme */ }
  }
  if (typeof returnTo === 'string' && returnTo.length > 0 && returnTo.length <= 2048) {
    try {
      const r = new URL(returnTo);
      if ((r.protocol === 'http:' || r.protocol === 'https:') && !r.username && !r.password && origins.has(r.origin)) return r.toString();
    } catch { /* not a URL: ignore */ }
  }
  const home = HOME_PATH[clientId];
  if (home === null) return undefined;
  return `${reqOrigin}${home ?? '/'}`;
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
    return send(res, 400, expiredPage(pickLang(req, url, {}, undefined)));
  }
  if (details.uid !== uid) return send(res, 400, { error: 'interaction_mismatch' });

  const isPost = req.method === 'POST';
  const isJson = String(req.headers['content-type'] ?? '').includes('application/json');
  const form = isPost && !action.startsWith('passkey') ? await readForm(req) : {};
  const lang = pickLang(req, url, form, details.params.ui_locales);
  const ip = clientIp(req, d.trustProxy);
  const back = () => redirect(res, `/interaction/${uid}?lang=${lang}`);
  const acrCfg = d.cfg.stepUp.acr;

  const clientId = String(details.params.client_id ?? '');
  const product = productFor(clientId, lang);
  const allowRegister = product.audience !== 'ops'; // operations staff are provisioned by administrators, never self-registered
  const modeOf = (v: unknown): Mode | undefined => (v === 'register' && allowRegister ? 'register' : v === 'login' || v === 'register' ? 'login' : undefined);
  const intentMode: Mode = modeOf(String(url.searchParams.get('intent') ?? details.params.intent ?? '').toLowerCase()) ?? 'login';
  const ctxOf = (mode: Mode): Ctx => ({ product: product.name, audience: product.audience, mode });

  /**
   * The sign-in / create-account tab chosen on the phone page ('signup' state). After the code is verified (so nothing is revealed to someone who does not hold the number):
   * create-account for a number that already has an account asks "sign in instead" ('dup'); sign-in for a number without an account asks to create one ('new').
   * No tab chosen (older clients, API tests): the former behaviour, the account is created on the first verified number.
   */
  const gate = async (): Promise<'dup' | 'new' | undefined> => {
    const ch = await d.otp.latest(uid);
    if (!ch?.verified_at || ch.consumed_at || ch.locked) return undefined;
    const sg = await getState(d.pool, uid, 'signup');
    if (!sg || (await getState(d.pool, uid, 'signup_ack'))) return undefined;
    const exists = !!(await d.accounts.findByPhone(ch.phone));
    if (sg.data.mode === 'register' && exists) return 'dup';
    if (sg.data.mode === 'login' && !exists) return 'new';
    return undefined;
  };

  const otpAccount = async (): Promise<Account | undefined> => {
    const ch = await d.otp.latest(uid);
    if (!ch?.verified_at || ch.consumed_at || ch.locked) return undefined;
    if (await gate()) return undefined;
    const found = await d.accounts.findByPhone(ch.phone);
    if (found) return found;
    const sg = await getState(d.pool, uid, 'signup');
    const name = typeof sg?.data.name === 'string' && sg.data.name ? sg.data.name : ch.name;
    const created = await d.accounts.create(ch.phone, ch.locale, name);
    if (sg) await setState(d.pool, uid, 'signup_ack', '', {}); // the account exists now because of THIS registration: later steps must not call it a duplicate
    if (sg) await d.audit.record('account.registered', created.sub, { client: clientId, consent: 'terms+privacy', consent_version: sg.data.consent_version ?? CONSENT_VERSION });
    return created;
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
  /** Mandatory second factor: baseline roles (config) or the ops-managed MFA policy (roles, organisation type, organisation). Optional otherwise. */
  const needsMfa = async (ff: FirstFactor) => (await d.mfaPolicy.requirement(ff.account)).required;

  const renderTotp = async (ff: FirstFactor, error?: string, status = 200) => {
    const enrol = (await d.totp.isEnrolled(ff.account.sub)) ? undefined : await d.totp.enrolStart(ff.account);
    // a voluntarily enrolled person (factor not mandatory) may skip; a mandatory factor can never be skipped
    return send(res, status, totpPage(lang, uid, { error, enrol, skippable: !(await needsMfa(ff)) }));
  };

  const finishLogin = async () => {
    const ff = await firstFactor();
    if (!ff) return back();
    const totpDone = await secondFactorDone(ff);
    if ((await needsMfa(ff)) && !totpDone) return back(); // privileged roles must pass TOTP (KA-03/KA-10) before any token is issued
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
    if (!(await secondFactorDone(ff))) {
      if (await needsMfa(ff)) return renderTotp(ff);
      // optional: an enrolled person is offered the authenticator code (the MFA claim is issued only when it is used); skipping keeps the basic level
      if ((await d.totp.isEnrolled(ff.account.sub)) && !(await getState(d.pool, uid, 'totp_skip'))) return renderTotp(ff);
    }
    if (ff.method === 'otp' && d.passkeysEnabled) return send(res, 200, passkeyPage(lang, uid));
    return finishLogin();
  };

  const codeView = (phone: string, o: { error?: string; status?: number; headers?: Record<string, string> } = {}) => {
    return send(res, o.status ?? 200, codePage(lang, uid, maskPhone(phone), { error: o.error }), o.headers ?? {});
  };

  const phoneView = async (o: { error?: string; phone?: string; name?: string; mode?: Mode } = {}, status = 200) => {
    const fedPending = await getState(d.pool, uid, 'fed_pending');
    const { mode, ...rest } = o;
    return send(res, status, phonePage(lang, uid, { ...rest, passkeyLogin: d.passkeysEnabled, federation: d.federation.available(), fedLinkNotice: !!fedPending, ctx: ctxOf(mode ?? intentMode), allowRegister }));
  };

  const noticeView = async (kind: 'dup' | 'new', o: { error?: string; name?: string; status?: number } = {}) => {
    const ch = await d.otp.latest(uid);
    if (!ch) return phoneView();
    return send(res, o.status ?? 200, noticePage(lang, uid, kind, maskPhone(ch.phone), { error: o.error, name: o.name ?? ch.name ?? undefined }));
  };

  /** Go back from the first step: the app that sent the person (validated return_to, else the product home, else the OAuth access_denied answer). Nothing typed here is carried along. */
  const cancelToApp = async () => {
    await d.otp.abandon(uid).catch(() => undefined);
    await clearStates(d.pool, uid);
    const client = await d.provider.Client.find(clientId);
    const target = client ? backTarget(clientId, { redirectUris: [...(client.redirectUris ?? [])], postLogoutRedirectUris: [...(client.postLogoutRedirectUris ?? [])] }, details.params.return_to, String(details.params.redirect_uri ?? '')) : undefined;
    if (target) return redirect(res, target);
    return void (await d.provider.interactionFinished(req, res, { error: 'access_denied', error_description: 'The user went back before signing in.' }, { mergeWithLastSubmission: false }));
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
    const g = await gate();
    if (g) return noticeView(g);
    const ff = await firstFactor();
    if (ff) return afterFactors(ff);
    const ch = await d.otp.latest(uid);
    if (ch && !ch.locked && !ch.consumed_at && ch.expires_at.getTime() > Date.now()) {
      return codeView(ch.phone);
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
    const phone = westernDigits(form.phone ?? '').replace(/[\s-]/g, '');
    const mode = modeOf(form.mode);
    if (mode === 'register' && form.consent !== '1') return phoneView({ error: errorText(lang, 'consent_required'), phone, name: form.name, mode }, 400);
    const r = await d.otp.send({ interactionUid: uid, phone, ip, locale: lang, name: form.name });
    if (!r.ok) {
      await d.audit.record('otp.send.denied', null, { reason: r.reason, phone: maskPhone(phone) });
      const status = r.reason === 'invalid_phone' ? 400 : r.reason === 'send_failed' ? 502 : 429;
      if (r.retryAfterSeconds) res.setHeader('retry-after', String(r.retryAfterSeconds));
      return phoneView({ error: errorText(lang, r.reason), phone, name: form.name, mode }, status);
    }
    await d.audit.record('otp.sent', null, { phone: maskPhone(phone) });
    await delState(d.pool, uid, 'signup', 'signup_ack');
    if (mode) await setState(d.pool, uid, 'signup', '', { mode, consent: mode === 'register', consent_version: CONSENT_VERSION, name: (form.name ?? '').trim().slice(0, 80) || null });
    return codeView(phone);
  }

  if (isPost && action === 'resend') {
    const ch = await d.otp.latest(uid);
    if (!ch) return back();
    const r = await d.otp.send({ interactionUid: uid, phone: ch.phone, ip, locale: lang, name: ch.name });
    if (!r.ok) {
      return codeView(ch.phone, { error: errorText(lang, r.reason), status: 429, headers: r.retryAfterSeconds ? { 'retry-after': String(r.retryAfterSeconds) } : {} });
    }
    return codeView(ch.phone);
  }

  if (isPost && action === 'change') {
    await d.otp.abandon(uid).catch(() => undefined);
    await delState(d.pool, uid, 'totp', 'totp_skip', 'signup_ack', 'passkey_login', 'fed_login');
    const sg = await getState(d.pool, uid, 'signup');
    return phoneView({ mode: sg?.data.mode === 'register' ? 'register' : undefined });
  }

  // Go back: one step at a time (phone <- code <- second factor), from the first step to the app. Decided from the server state, never from what the page claims.
  if (isPost && (action === 'back' || action === 'cancel')) {
    const ch = await d.otp.latest(uid);
    const live = !!ch && !ch.consumed_at && !ch.locked && ch.expires_at.getTime() > Date.now();
    const sg = await getState(d.pool, uid, 'signup');
    const hasFactorState = !!(await getState(d.pool, uid, 'passkey_login')) || !!(await getState(d.pool, uid, 'fed_login'));
    if (action === 'cancel' || (!live && !hasFactorState)) return cancelToApp();
    if (live && ch!.verified_at) { // second factor, notice or passkey offer -> the code step
      await delState(d.pool, uid, 'totp', 'totp_skip', 'signup_ack', 'passkey_login', 'fed_login');
      await d.otp.unverify(uid);
      return codeView(ch!.phone);
    }
    // code step (or a factor that has no code) -> the phone step, nothing typed is kept
    await d.otp.abandon(uid).catch(() => undefined);
    await delState(d.pool, uid, 'totp', 'totp_skip', 'signup_ack', 'passkey_login', 'fed_login');
    return phoneView({ mode: sg?.data.mode === 'register' ? 'register' : undefined });
  }

  // after a verified code: "you already have an account, sign in" / "no account yet, create one"
  if (isPost && action === 'continue') {
    if ((await gate()) !== 'dup') return back();
    await setState(d.pool, uid, 'signup_ack', '', {});
    const ff = await firstFactor();
    if (!ff) return back();
    return afterFactors(ff);
  }
  if (isPost && action === 'create') {
    if ((await gate()) !== 'new') return back();
    if (form.consent !== '1') return noticeView('new', { error: errorText(lang, 'consent_required'), name: form.name, status: 400 });
    await setState(d.pool, uid, 'signup', '', { mode: 'register', consent: true, consent_version: CONSENT_VERSION, name: (form.name ?? '').trim().slice(0, 80) || null });
    await setState(d.pool, uid, 'signup_ack', '', {});
    const ff = await firstFactor();
    if (!ff) return back();
    return afterFactors(ff);
  }

  if (isPost && action === 'verify') {
    const r = await d.otp.verify(uid, westernDigits(form.code ?? ''));
    const ch = await d.otp.latest(uid);
    if (!r.ok) {
      const status = r.reason === 'locked' ? 429 : 400;
      await d.audit.record('otp.verify.failed', null, { reason: r.reason });
      if (!ch || r.reason === 'no_challenge') return phoneView({ error: errorText(lang, 'no_challenge') }, 400);
      return codeView(ch.phone, { error: errorText(lang, r.reason, r.attemptsLeft), status });
    }
    const g = await gate();
    if (g) return noticeView(g);
    const ff = await firstFactor(); // creates the account on first verified phone
    if (!ff) return back();
    return afterFactors(ff);
  }

  // KA-03/KA-10: TOTP challenge or first-time enrolment for privileged roles
  if (isPost && action === 'totp') {
    const ff = await firstFactor();
    if (!ff) return back();
    const enrolledAlready = await d.totp.isEnrolled(ff.account.sub);
    if (!(await needsMfa(ff)) && !enrolledAlready) return back(); // optional factors are enrolled in the account page, not in the sign-in
    const enrolled = await d.totp.isEnrolled(ff.account.sub);
    const r = await d.totp.verify(ff.account.sub, westernDigits(form.totp ?? ''), { confirm: !enrolled });
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

  // optional second factor: skip (never for a mandatory one)
  if (isPost && action === 'totp/skip') {
    const ff = await firstFactor();
    if (!ff) return back();
    if (await needsMfa(ff)) return renderTotp(ff, undefined, 403);
    await setState(d.pool, uid, 'totp_skip', ff.account.sub);
    await d.audit.record('totp.skipped', ff.account.sub);
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
