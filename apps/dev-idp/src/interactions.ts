import type { IncomingMessage, ServerResponse } from 'node:http';
import type Provider from 'oidc-provider';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import type { Accounts } from './accounts.js';
import type { OtpService } from './otp.js';
import type { Passkeys } from './passkeys.js';
import type { Audit } from './audit.js';
import { maskPhone } from '@kiorex/otp-sender';
import { clientIp, readBody, readForm, redirect, send } from './http.js';
import { codePage, errorText, passkeyPage, phonePage, page, t, esc, type Lang } from './views.js';

export interface InteractionDeps {
  provider: Provider; accounts: Accounts; otp: OtpService; passkeys: Passkeys; audit: Audit;
  passkeysEnabled: boolean; trustProxy: boolean;
}

function pickLang(req: IncomingMessage, url: URL, form: Record<string, string>, uiLocales?: unknown): Lang {
  const v = form.lang ?? url.searchParams.get('lang') ?? String(uiLocales ?? '') ?? '';
  if (v.startsWith('ar')) return 'ar';
  if (v.startsWith('en')) return 'en';
  return String(req.headers['accept-language'] ?? '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

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

  const finishLogin = async () => {
    const c = await d.otp.consume(uid);
    if (!c) return back();
    const account = (await d.accounts.findByPhone(c.phone)) ?? (await d.accounts.create(c.phone, c.locale, c.name));
    await d.audit.record('login.success', account.sub, { amr: ['otp'], client: details.params.client_id });
    await d.provider.interactionFinished(req, res, { login: { accountId: account.sub, amr: ['otp'], remember: true } }, { mergeWithLastSubmission: false });
  };

  const verifiedAccount = async () => {
    const ch = await d.otp.latest(uid);
    if (!ch?.verified_at || ch.consumed_at || ch.locked) return undefined;
    return (await d.accounts.findByPhone(ch.phone)) ?? (await d.accounts.create(ch.phone, ch.locale, ch.name));
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
    const ch = await d.otp.latest(uid);
    if (ch?.verified_at && !ch.consumed_at && !ch.locked) {
      if (d.passkeysEnabled) return send(res, 200, passkeyPage(lang, uid));
      return finishLogin();
    }
    if (ch && !ch.locked && !ch.consumed_at && ch.expires_at.getTime() > Date.now()) {
      return send(res, 200, codePage(lang, uid, maskPhone(ch.phone)));
    }
    return send(res, 200, phonePage(lang, uid));
  }

  if (isPost && action === 'phone') {
    const phone = (form.phone ?? '').replace(/[\s-]/g, '');
    const r = await d.otp.send({ interactionUid: uid, phone, ip, locale: lang, name: form.name });
    if (!r.ok) {
      await d.audit.record('otp.send.denied', null, { reason: r.reason, phone: maskPhone(phone) });
      const status = r.reason === 'invalid_phone' ? 400 : r.reason === 'send_failed' ? 502 : 429;
      return send(res, status, phonePage(lang, uid, { error: errorText(lang, r.reason), phone, name: form.name }),
        r.retryAfterSeconds ? { 'retry-after': String(r.retryAfterSeconds) } : {});
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
    return send(res, 200, phonePage(lang, uid));
  }

  if (isPost && action === 'verify') {
    const r = await d.otp.verify(uid, form.code ?? '');
    const ch = await d.otp.latest(uid);
    if (!r.ok) {
      const status = r.reason === 'locked' ? 429 : 400;
      await d.audit.record('otp.verify.failed', null, { reason: r.reason });
      if (!ch || r.reason === 'no_challenge') return send(res, 400, phonePage(lang, uid, { error: errorText(lang, 'no_challenge') }));
      return send(res, status, codePage(lang, uid, maskPhone(ch.phone), { error: errorText(lang, r.reason, r.attemptsLeft) }));
    }
    await verifiedAccount(); // create account on first verified phone
    if (d.passkeysEnabled) return send(res, 200, passkeyPage(lang, uid));
    return finishLogin();
  }

  if (isPost && action === 'finish') {
    if (!(await verifiedAccount())) return back();
    return finishLogin();
  }

  if (isPost && action === 'passkey/options') {
    if (!d.passkeysEnabled) return send(res, 404, { error: 'feature_disabled', key: 'account.passkeys' });
    const a = await verifiedAccount();
    if (!a) return send(res, 401, { error: 'not_verified' });
    await readBody(req).catch(() => undefined);
    return send(res, 200, await d.passkeys.options(a, `uid:${uid}`));
  }
  if (isPost && action === 'passkey/verify') {
    if (!d.passkeysEnabled) return send(res, 404, { error: 'feature_disabled', key: 'account.passkeys' });
    const a = await verifiedAccount();
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
  void esc;
  return send(res, 404, { error: 'not_found' });
}
