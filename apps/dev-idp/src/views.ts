import { brandAsset } from './config.js';

export type Lang = 'ar' | 'en';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const T = {
  en: {
    title: 'Sign in with Kiorex Passport',
    sub: 'Kiorex Passport: one account for Kiorex and Kiorly. Enter your mobile number and we will send you a code.',
    phone: 'Mobile number', phoneHint: 'International format, e.g. +201000000001',
    name: 'Your name (optional, new accounts)', send: 'Send code',
    codeTitle: 'Enter your code', codeSub: (p: string) => `We sent a 6-digit code to ${p}.`, code: 'Verification code',
    verify: 'Verify', resend: 'Send a new code', change: 'Use a different number',
    passkeyTitle: 'Add a passkey?', passkeySub: 'Sign in faster next time with your fingerprint, face or device PIN. Optional.',
    passkeyAdd: 'Add passkey', passkeySkip: 'Not now', passkeyDone: 'Passkey added.',
    logoutTitle: 'Sign out of Kiorex Passport?', logoutYes: 'Yes, sign out', logoutNo: 'Stay signed in',
    loggedOut: 'You have been signed out.',
    lang: 'العربية', devNote: 'Development identity provider - not for production',
    err: {
      invalid_phone: 'Enter a valid mobile number in international format.',
      phone_rate_limited: 'Too many codes requested for this number. Try again in an hour.',
      ip_rate_limited: 'Too many requests from your network. Try again later.',
      locked: 'Too many wrong attempts. This number is locked for a short while.',
      send_failed: 'We could not send the code. Please try again.',
      expired: 'This code has expired. Request a new one.',
      wrong: (n: number) => `Incorrect code. ${n} attempt(s) left.`,
      invalid: 'Enter the numeric code.', no_challenge: 'Request a code first.',
      passkey: 'Could not add the passkey.',
    },
  },
  ar: {
    title: 'تسجيل الدخول عبر كيوريكس باسبورت',
    sub: 'كيوريكس باسبورت: حساب واحد لكيوريكس وكيورلي. أدخل رقم هاتفك المحمول وسنرسل لك رمزًا.',
    phone: 'رقم الهاتف المحمول', phoneHint: 'بالصيغة الدولية، مثال: ‎+201000000001',
    name: 'اسمك (اختياري للحسابات الجديدة)', send: 'إرسال الرمز',
    codeTitle: 'أدخل الرمز', codeSub: (p: string) => `أرسلنا رمزًا من 6 أرقام إلى ${p}.`, code: 'رمز التحقق',
    verify: 'تحقق', resend: 'إرسال رمز جديد', change: 'استخدام رقم آخر',
    passkeyTitle: 'إضافة مفتاح مرور؟', passkeySub: 'سجّل الدخول أسرع في المرة القادمة ببصمتك أو وجهك أو رمز الجهاز. اختياري.',
    passkeyAdd: 'إضافة مفتاح مرور', passkeySkip: 'ليس الآن', passkeyDone: 'تمت إضافة مفتاح المرور.',
    logoutTitle: 'تسجيل الخروج من كيوريكس باسبورت؟', logoutYes: 'نعم، سجّل الخروج', logoutNo: 'ابقَ مسجّلًا',
    loggedOut: 'تم تسجيل خروجك.',
    lang: 'English', devNote: 'مزوّد هوية للتطوير فقط - ليس للإنتاج',
    err: {
      invalid_phone: 'أدخل رقم هاتف صحيحًا بالصيغة الدولية.',
      phone_rate_limited: 'تم طلب رموز كثيرة لهذا الرقم. حاول مرة أخرى بعد ساعة.',
      ip_rate_limited: 'طلبات كثيرة من شبكتك. حاول لاحقًا.',
      locked: 'محاولات خاطئة كثيرة. تم قفل هذا الرقم لفترة قصيرة.',
      send_failed: 'تعذر إرسال الرمز. حاول مرة أخرى.',
      expired: 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.',
      wrong: (n: number) => `الرمز غير صحيح. تبقّت ${n} محاولة.`,
      invalid: 'أدخل الرمز الرقمي.', no_challenge: 'اطلب رمزًا أولًا.',
      passkey: 'تعذرت إضافة مفتاح المرور.',
    },
  },
} as const;
export const t = (lang: Lang) => T[lang];

export function errorText(lang: Lang, reason?: string, attemptsLeft?: number): string {
  if (!reason) return '';
  const e = T[lang].err as Record<string, unknown>;
  const v = e[reason];
  return typeof v === 'function' ? (v as (n: number) => string)(attemptsLeft ?? 0) : String(v ?? reason);
}

let cssCache: string | undefined;
const css = () => (cssCache ??= `${brandAsset('tokens.css')}
:root{--kx-err-bg:#FDECEA;--kx-err-fg:#8A1F11;--kx-err-bd:#F5C2BC;--kx-ok-bg:#E7F6EE;--kx-ok-fg:#14532D;--kx-field:#64748B}
@media (prefers-color-scheme:dark){:root{--kx-err-bg:#3B1219;--kx-err-fg:#FCA5A5;--kx-err-bd:#7F1D1D;--kx-ok-bg:#0B2F1E;--kx-ok-fg:#86EFAC;--kx-field:#7C84B0}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--kx-ground);color:var(--kx-text);font-family:var(--kx-font);padding:16px;line-height:1.6}
html[lang=ar] body{font-family:"IBM Plex Sans Arabic",var(--kx-font);line-height:1.8}
.card{width:100%;max-width:420px;background:var(--kx-surface);border:1px solid var(--kx-border);border-radius:var(--kx-radius);padding:28px 24px;box-shadow:0 10px 30px rgba(55,48,163,.08)}
@media (prefers-color-scheme:dark){.card{box-shadow:none}}
.brand{display:flex;align-items:center;gap:10px;margin-bottom:18px}
.brand img{height:30px;width:auto;background:#fff;border-radius:8px;padding:2px 4px}.wordmark{letter-spacing:.28em;font-weight:600;color:var(--kx-ink);direction:ltr}.passport{font-size:.75rem;color:var(--kx-text-muted);letter-spacing:.12em;text-transform:uppercase;margin-inline-start:auto}.wordmark b{color:var(--kx-ink-2);font-weight:600}
h1{font-size:1.35rem;margin:0 0 6px;line-height:1.3}p{color:var(--kx-text-muted);line-height:1.6;margin:0 0 16px}
label{display:block;font-weight:600;margin:12px 0 6px}
input{width:100%;min-height:44px;padding:10px 12px;border:1px solid var(--kx-field);border-radius:10px;font:inherit;background:var(--kx-surface);color:var(--kx-text)}
input:focus,button:focus-visible,a:focus-visible{outline:3px solid var(--kx-pulse);outline-offset:2px}
.hint{font-size:.875rem;color:var(--kx-text-muted)}
button,.btn{display:block;width:100%;min-height:44px;margin-top:16px;padding:12px;border:1px solid transparent;border-radius:10px;font:inherit;font-weight:600;cursor:pointer;background:var(--kx-gradient);color:#fff;text-align:center;text-decoration:none}
button.secondary,.btn.secondary{background:transparent;color:var(--kx-ink-2);border-color:var(--kx-field)}
.error{background:var(--kx-err-bg);color:var(--kx-err-fg);border:1px solid var(--kx-err-bd);border-radius:10px;padding:10px 12px;margin-bottom:12px}
.ok{background:var(--kx-ok-bg);color:var(--kx-ok-fg);border-radius:10px;padding:10px 12px;margin-top:12px}
.foot{display:flex;justify-content:space-between;gap:12px;margin-top:18px;font-size:.8rem;color:var(--kx-text-muted)}
a{color:var(--kx-ink-2)}
.code{letter-spacing:.5em;text-align:center;font-size:1.4rem;direction:ltr}
.phone{direction:ltr;text-align:start}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}`);

export function page(lang: Lang, title: string, body: string, opts: { langSwitchHref?: string; script?: string } = {}): string {
  const tx = T[lang];
  return `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} - Kiorex Passport</title>
<link rel="icon" href="/static/brand/kiorex-mark.svg"><style>${css()}</style></head><body><main class="card">
<div class="brand"><img src="/static/brand/kiorex-mark.svg" alt="Kiorex"><span class="wordmark" aria-hidden="true">KIORE<b>X</b></span><span class="passport">Passport</span></div>
${body}
<div class="foot"><span>${esc(tx.devNote)}</span>${opts.langSwitchHref ? `<a href="${esc(opts.langSwitchHref)}" hreflang="${lang === 'ar' ? 'en' : 'ar'}">${esc(tx.lang)}</a>` : ''}</div>
</main>${opts.script ? `<script src="/static/simplewebauthn-browser.js"></script><script>${opts.script}</script>` : ''}</body></html>`;
}

export const err = (msg: string) => (msg ? `<div class="error" role="alert">${esc(msg)}</div>` : '');

const X2 = {
  en: {
    pkLogin: 'Sign in with a passkey', pkFail: 'Passkey sign-in failed. Use your phone number instead.',
    fedWith: (n: string) => `Continue with ${n}`, fedLink: 'Your provider account is not linked yet. Verify your mobile number once to link it to Kiorex Passport.',
    totpTitle: 'Two-step verification', totpSub: 'Enter the 6-digit code from your authenticator app.', totpCode: 'Authenticator code', totpGo: 'Verify',
    totpEnrolTitle: 'Set up your authenticator', totpEnrolSub: 'Your role requires two-step verification. Add this key to an authenticator app, then enter the code it shows.', totpKey: 'Setup key',
    totpErr: { wrong: (n: number) => `Incorrect code. ${n} attempt(s) left.`, locked: 'Too many wrong attempts. Try again in a few minutes.', invalid: 'Enter the 6-digit code.' },
  },
  ar: {
    pkLogin: 'تسجيل الدخول بمفتاح مرور', pkFail: 'فشل الدخول بمفتاح المرور. استخدم رقم هاتفك.',
    fedWith: (n: string) => `المتابعة عبر ${n}`, fedLink: 'حساب مزوّد الخدمة غير مرتبط بعد. تحقق من رقم هاتفك مرة واحدة لربطه بكيوريكس باسبورت.',
    totpTitle: 'التحقق بخطوتين', totpSub: 'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة.', totpCode: 'رمز المصادقة', totpGo: 'تحقق',
    totpEnrolTitle: 'إعداد تطبيق المصادقة', totpEnrolSub: 'دورك يتطلب التحقق بخطوتين. أضف هذا المفتاح إلى تطبيق مصادقة ثم أدخل الرمز الظاهر.', totpKey: 'مفتاح الإعداد',
    totpErr: { wrong: (n: number) => `الرمز غير صحيح. تبقّت ${n} محاولة.`, locked: 'محاولات خاطئة كثيرة. حاول بعد دقائق.', invalid: 'أدخل الرمز المكوّن من 6 أرقام.' },
  },
} as const;
export const t2 = (lang: Lang) => X2[lang];

export function phonePage(lang: Lang, uid: string, o: { error?: string; phone?: string; name?: string; passkeyLogin?: boolean; federation?: Array<{ id: string; name: string }>; fedLinkNotice?: boolean } = {}): string {
  const x = t(lang); const y = t2(lang);
  const fed = (o.federation ?? []).map((u) => `<a class="btn secondary" data-federate="${esc(u.id)}" href="/interaction/${esc(uid)}/federate/${esc(u.id)}">${esc(y.fedWith(u.name))}</a>`).join('');
  const pk = o.passkeyLogin
    ? `<button id="pk-login" class="secondary" type="button">${y.pkLogin}</button><div id="pk-msg" role="status"></div>
<form id="pk-finish" method="post" action="/interaction/${esc(uid)}/passkey/login/finish"></form>` : '';
  const script = o.passkeyLogin ? `
const out=document.getElementById('pk-msg');
document.getElementById('pk-login').addEventListener('click',async()=>{
  try{
    const o=await (await fetch('/interaction/${uid}/passkey/login/options',{method:'POST'})).json();
    const a=await SimpleWebAuthnBrowser.startAuthentication({optionsJSON:o});
    const r=await fetch('/interaction/${uid}/passkey/login/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(a)});
    if(!r.ok)throw new Error('verify');
    document.getElementById('pk-finish').submit();
  }catch(e){out.textContent=${JSON.stringify(y.pkFail)};out.className='error';}
});` : undefined;
  return page(lang, x.title, `<h1>${x.title}</h1><p>${x.sub}</p>${o.fedLinkNotice ? `<div class="ok" role="status">${y.fedLink}</div>` : ''}${err(o.error ?? '')}
<form method="post" action="/interaction/${esc(uid)}/phone">
<input type="hidden" name="lang" value="${lang}">
<label for="phone">${x.phone}</label><input id="phone" class="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required dir="ltr" aria-describedby="phone-hint" value="${esc(o.phone ?? '')}" placeholder="+201000000001">
<div class="hint" id="phone-hint">${x.phoneHint}</div>
<label for="name">${x.name}</label><input id="name" name="name" autocomplete="name" value="${esc(o.name ?? '')}">
<button type="submit">${x.send}</button></form>${pk}${fed}`,
  { langSwitchHref: `/interaction/${uid}?lang=${lang === 'ar' ? 'en' : 'ar'}`, script });
}

/** KA-10: TOTP challenge, or first-time enrolment (secret shown) for privileged roles. */
export function totpPage(lang: Lang, uid: string, o: { error?: string; enrol?: { secret: string; uri: string } } = {}): string {
  const y = t2(lang);
  const head = o.enrol
    ? `<h1>${y.totpEnrolTitle}</h1><p>${y.totpEnrolSub}</p><p>${y.totpKey}: <bdi dir="ltr" id="totp-secret"><code>${esc(o.enrol.secret)}</code></bdi></p><p class="hint"><bdi dir="ltr">${esc(o.enrol.uri)}</bdi></p>`
    : `<h1>${y.totpTitle}</h1><p>${y.totpSub}</p>`;
  return page(lang, y.totpTitle, `${head}${err(o.error ?? '')}
<form method="post" action="/interaction/${esc(uid)}/totp"><input type="hidden" name="lang" value="${lang}">
<label for="totp">${y.totpCode}</label><input id="totp" class="code" name="totp" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" required autofocus>
<button type="submit">${y.totpGo}</button></form>`, { langSwitchHref: `/interaction/${uid}?lang=${lang === 'ar' ? 'en' : 'ar'}` });
}

export function codePage(lang: Lang, uid: string, maskedPhone: string, o: { error?: string } = {}): string {
  const x = t(lang);
  return page(lang, x.codeTitle, `<h1>${x.codeTitle}</h1><p>${x.codeSub(`<bdi dir="ltr">${esc(maskedPhone)}</bdi>`)}</p>${err(o.error ?? '')}
<form method="post" action="/interaction/${esc(uid)}/verify"><input type="hidden" name="lang" value="${lang}">
<label for="code">${x.code}</label><input id="code" class="code" name="code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="10" required autofocus>
<button type="submit">${x.verify}</button></form>
<form method="post" action="/interaction/${esc(uid)}/resend"><input type="hidden" name="lang" value="${lang}"><button class="secondary" type="submit">${x.resend}</button></form>
<form method="post" action="/interaction/${esc(uid)}/change"><input type="hidden" name="lang" value="${lang}"><button class="secondary" type="submit">${x.change}</button></form>`,
  { langSwitchHref: `/interaction/${uid}?lang=${lang === 'ar' ? 'en' : 'ar'}` });
}

export function passkeyPage(lang: Lang, uid: string): string {
  const x = t(lang);
  const script = `
const out=document.getElementById('pk-msg');
document.getElementById('pk-add').addEventListener('click',async()=>{
  try{
    const o=await (await fetch('/interaction/${uid}/passkey/options',{method:'POST'})).json();
    const att=await SimpleWebAuthnBrowser.startRegistration({optionsJSON:o});
    const r=await fetch('/interaction/${uid}/passkey/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(att)});
    if(!r.ok)throw new Error('verify');
    out.textContent=${JSON.stringify(x.passkeyDone)};out.className='ok';
    setTimeout(()=>document.getElementById('finish').submit(),600);
  }catch(e){out.textContent=${JSON.stringify(x.err.passkey)};out.className='error';}
});`;
  return page(lang, x.passkeyTitle, `<h1>${x.passkeyTitle}</h1><p>${x.passkeySub}</p><div id="pk-msg" role="status"></div>
<button id="pk-add" type="button">${x.passkeyAdd}</button>
<form id="finish" method="post" action="/interaction/${esc(uid)}/finish"><button class="secondary" type="submit">${x.passkeySkip}</button></form>`, { script });
}

export function logoutPage(lang: Lang, formHtml: string): string {
  const x = t(lang);
  // oidc-provider renders only the <form id="op.logoutForm"> (with its CSRF input); the confirm / cancel buttons are ours.
  return page(lang, x.logoutTitle, `<h1>${x.logoutTitle}</h1>${formHtml}
<button autofocus type="submit" form="op.logoutForm" name="logout" value="yes">${x.logoutYes}</button>
<button class="secondary" type="submit" form="op.logoutForm">${x.logoutNo}</button>`);
}
export const loggedOutPage = (lang: Lang) => page(lang, t(lang).loggedOut, `<h1>${t(lang).loggedOut}</h1><a class="btn secondary" href="/account">${lang === 'ar' ? 'العودة إلى كيوريكس باسبورت' : 'Back to Kiorex Passport'}</a>`);
