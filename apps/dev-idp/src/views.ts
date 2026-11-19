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
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--kx-ground);color:var(--kx-text);font-family:var(--kx-font);padding:16px}
.card{width:100%;max-width:420px;background:var(--kx-surface);border:1px solid var(--kx-border);border-radius:var(--kx-radius);padding:28px 24px;box-shadow:0 10px 30px rgba(55,48,163,.08)}
.brand{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
.brand img{height:34px}.wordmark{letter-spacing:.28em;font-weight:600;color:var(--kx-ink)}.passport{font-size:.75rem;color:var(--kx-text-muted);letter-spacing:.12em;text-transform:uppercase;margin-inline-start:auto}.wordmark b{color:var(--kx-ink-2)}
h1{font-size:1.35rem;margin:0 0 6px}p{color:var(--kx-text-muted);line-height:1.5;margin:0 0 16px}
label{display:block;font-weight:500;margin:12px 0 6px}
input{width:100%;padding:12px;border:1px solid var(--kx-border);border-radius:10px;font:inherit;background:var(--kx-surface);color:var(--kx-text)}
input:focus,button:focus-visible,a:focus-visible{outline:3px solid var(--kx-pulse);outline-offset:1px}
.hint{font-size:.85rem;color:var(--kx-text-muted)}
button,.btn{display:block;width:100%;margin-top:16px;padding:12px;border:0;border-radius:10px;font:inherit;font-weight:600;cursor:pointer;background:var(--kx-gradient);color:#fff;text-align:center;text-decoration:none}
button.secondary{background:transparent;color:var(--kx-ink-2);border:1px solid var(--kx-border)}
.error{background:#FDECEA;color:#8A1F11;border:1px solid #F5C2BC;border-radius:10px;padding:10px 12px;margin-bottom:12px}
.ok{background:#E7F6EE;color:#14532D;border-radius:10px;padding:10px 12px;margin-top:12px}
.foot{display:flex;justify-content:space-between;margin-top:18px;font-size:.8rem;color:var(--kx-text-muted)}
a{color:var(--kx-ink-2)}
.code{letter-spacing:.5em;text-align:center;font-size:1.4rem;direction:ltr}
.phone{direction:ltr;text-align:start}`);

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

export function phonePage(lang: Lang, uid: string, o: { error?: string; phone?: string; name?: string } = {}): string {
  const x = t(lang);
  return page(lang, x.title, `<h1>${x.title}</h1><p>${x.sub}</p>${err(o.error ?? '')}
<form method="post" action="/interaction/${esc(uid)}/phone">
<input type="hidden" name="lang" value="${lang}">
<label for="phone">${x.phone}</label><input id="phone" class="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(o.phone ?? '')}" placeholder="+201000000001">
<div class="hint">${x.phoneHint}</div>
<label for="name">${x.name}</label><input id="name" name="name" autocomplete="name" value="${esc(o.name ?? '')}">
<button type="submit">${x.send}</button></form>`, { langSwitchHref: `/interaction/${uid}?lang=${lang === 'ar' ? 'en' : 'ar'}` });
}

export function codePage(lang: Lang, uid: string, maskedPhone: string, o: { error?: string } = {}): string {
  const x = t(lang);
  return page(lang, x.codeTitle, `<h1>${x.codeTitle}</h1><p>${x.codeSub(`<bdi dir="ltr">${esc(maskedPhone)}</bdi>`)}</p>${err(o.error ?? '')}
<form method="post" action="/interaction/${esc(uid)}/verify"><input type="hidden" name="lang" value="${lang}">
<label for="code">${x.code}</label><input id="code" class="code" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" required autofocus>
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
  const inner = formHtml
    .replace(/(<button[^>]*name="logout"[^>]*>)[^<]*(<\/button>)/, `$1${x.logoutYes}$2`)
    .replace(/(<button(?![^>]*name="logout")[^>]*>)[^<]*(<\/button>)/, `$1${x.logoutNo}$2`);
  return page(lang, x.logoutTitle, `<h1>${x.logoutTitle}</h1>${inner}`);
}
export const loggedOutPage = (lang: Lang) => page(lang, t(lang).loggedOut, `<h1>${t(lang).loggedOut}</h1>`);
