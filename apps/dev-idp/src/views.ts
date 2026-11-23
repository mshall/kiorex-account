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
${brandAsset('fonts.css')}
:root{--kx-field:#64748B;--kx-err-fg:#8A1F11}
@media (prefers-color-scheme:dark){:root{--kx-field:#7C84B0;--kx-err-fg:#FCA5A5}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;color:var(--kx-text);font-family:var(--kx-font);line-height:1.6;
 background:radial-gradient(1100px 520px at 50% -12%,color-mix(in srgb,var(--kx-primary) 14%,transparent),transparent 70%),var(--kx-bg)}
html[lang=ar] body{line-height:1.85}
.card{width:100%;max-width:440px;background:var(--kx-surface);border:1px solid var(--kx-border);border-radius:var(--kx-radius-xl);padding:32px 28px 24px;box-shadow:var(--kx-shadow-3)}
.brand{display:flex;justify-content:center;margin:0 0 22px}.brand img{height:40px;width:auto;display:block}
.secure{display:flex;align-items:center;justify-content:center;gap:6px;margin:-8px 0 20px;font-size:.8125rem;color:var(--kx-text-subtle)}
.secure svg{flex:none}
h1{font-size:1.5rem;letter-spacing:-.015em;margin:0 0 8px;line-height:1.25;text-align:center;font-weight:600}
p{color:var(--kx-text-muted);margin:0 0 18px;text-align:center}
label{display:block;font-weight:500;margin:14px 0 6px;font-size:.9375rem}
input{width:100%;min-height:48px;padding:10px 14px;border:1px solid var(--kx-field);border-radius:var(--kx-radius-md);font:inherit;background:var(--kx-surface);color:var(--kx-text);transition:border-color var(--kx-dur-fast),box-shadow var(--kx-dur-fast)}
input:focus{outline:none;border-color:var(--kx-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--kx-focus) 35%,transparent)}
button:focus-visible,a:focus-visible{outline:var(--kx-focus-width) solid var(--kx-focus);outline-offset:2px}
.hint{font-size:.8125rem;color:var(--kx-text-subtle);margin-top:6px}
button,.btn{display:block;width:100%;min-height:48px;margin-top:16px;padding:12px;border:1px solid transparent;border-radius:var(--kx-radius-md);font:inherit;font-weight:600;cursor:pointer;background:var(--kx-gradient);color:#fff;text-align:center;text-decoration:none;transition:transform var(--kx-dur-fast) var(--kx-ease-standard),filter var(--kx-dur-fast)}
button:hover,.btn:hover{filter:brightness(1.06)}button:active,.btn:active{transform:scale(.985)}
button.secondary,.btn.secondary{background:transparent;color:var(--kx-link);border-color:var(--kx-border-strong);filter:none}
button.secondary:hover,.btn.secondary:hover{background:var(--kx-primary-soft)}
.error{background:var(--kx-danger-soft);color:var(--kx-err-fg);border:1px solid color-mix(in srgb,var(--kx-danger) 40%,transparent);border-radius:var(--kx-radius-md);padding:10px 14px;margin-bottom:12px;text-align:start}
.ok{background:var(--kx-success-soft);color:var(--kx-success);border-radius:var(--kx-radius-md);padding:10px 14px;margin-top:12px}
.foot{display:flex;justify-content:space-between;gap:12px;margin-top:22px;padding-top:14px;border-top:1px solid var(--kx-hairline);font-size:.78rem;color:var(--kx-text-subtle)}
a{color:var(--kx-link)}
.code{letter-spacing:.5em;text-align:center;font-size:1.5rem;direction:ltr;font-variant-numeric:tabular-nums}
.phone{direction:ltr;text-align:start}
code{font-family:var(--kx-font-mono)}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}`);

const LOCK = `<picture><source srcset="/static/brand/passport-lockup-inverse.svg" media="(prefers-color-scheme: dark)"><img src="/static/brand/passport-lockup.svg" alt="Kiorex Passport"></picture>`;
const SHIELD = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>`;

export function page(lang: Lang, title: string, body: string, opts: { langSwitchHref?: string; script?: string } = {}): string {
  const tx = T[lang];
  const secure = lang === 'ar' ? 'اتصال آمن بحساب كيوريكس باسبورت' : 'Secure sign-in with your Kiorex Passport';
  return `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}" data-theme="auto"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(title)} - Kiorex Passport</title>
<link rel="icon" href="/static/brand/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/static/brand/apple-touch-icon.png"><style>${css()}</style></head><body><main class="card">
<div class="brand">${LOCK}</div><div class="secure">${SHIELD}<span>${esc(secure)}</span></div>
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

export function logoutPage(lang: Lang, formHtml: string, auto = false): string {
  const x = t(lang);
  // oidc-provider renders only the <form id="op.logoutForm"> (with its CSRF input); the confirm / cancel buttons are ours.
  // `auto` (a verified id_token_hint: the user already pressed Sign out inside the app) confirms at once, so "Stay signed in"
  // can never log the user out of the app while the Passport session survives. Without JS the buttons below remain.
  const buttons = `<button autofocus type="submit" form="op.logoutForm" name="logout" value="yes">${x.logoutYes}</button>
<button class="secondary" type="submit" form="op.logoutForm">${x.logoutNo}</button>`;
  if (!auto) return page(lang, x.logoutTitle, `<h1>${x.logoutTitle}</h1>${formHtml}${buttons}`);
  const script = `var f=document.getElementById('op.logoutForm');if(f){var i=document.createElement('input');i.type='hidden';i.name='logout';i.value='yes';f.appendChild(i);f.submit();}`;
  return page(lang, x.logoutTitle, `<h1>${lang === 'ar' ? 'جارٍ تسجيل الخروج…' : 'Signing you out…'}</h1>${formHtml}<noscript>${buttons}</noscript>`).replace('</body>', `<script>${script}</script></body>`);
}
export const loggedOutPage = (lang: Lang) => page(lang, t(lang).loggedOut, `<h1>${t(lang).loggedOut}</h1><a class="btn secondary" href="/account">${lang === 'ar' ? 'العودة إلى كيوريكس باسبورت' : 'Back to Kiorex Passport'}</a>`);
