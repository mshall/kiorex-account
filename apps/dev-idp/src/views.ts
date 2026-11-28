import { brandAsset } from './config.js';

export type Lang = 'ar' | 'en';
export type Mode = 'login' | 'register';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** Page-level switches set once at start-up: a hosted (public) deployment never shows development notes; legal links come from the environment (never invented here). */
const env = { hosted: false, termsUrl: '', privacyUrl: '' };
export function configureViews(o: { hosted?: boolean; termsUrl?: string; privacyUrl?: string }): void {
  if (o.hosted !== undefined) env.hosted = o.hosted;
  const ok = (u?: string) => (u && /^https:\/\//i.test(u) ? u : '');
  if (o.termsUrl !== undefined) env.termsUrl = ok(o.termsUrl);
  if (o.privacyUrl !== undefined) env.privacyUrl = ok(o.privacyUrl);
}

const T = {
  en: {
    title: 'Sign in with Kiorex Passport',
    sub: 'Enter your mobile number and we will send you a code.',
    loginTitle: 'Welcome back', loginSub: 'Enter your mobile number and we will send you a code. No password needed.',
    registerTitle: 'Create your account', registerSub: 'One Kiorex Passport account for Kiorex and Kiorly. We verify your mobile number with a code.',
    tabLogin: 'Sign in', tabRegister: 'Create account', tabs: 'Sign in or create an account',
    ctxLogin: (p: string) => `Signing in to ${p}`, ctxRegister: (p: string) => `Creating your account for ${p}`,
    phone: 'Mobile number', phoneHint: 'International format, e.g. +201000000001',
    name: 'Your name', nameOpt: 'optional', send: 'Send code',
    consent: (terms: string, privacy: string) => `I agree to the ${terms} and the ${privacy}.`, termsLabel: 'Terms of Use', privacyLabel: 'Privacy Notice',
    staffNote: 'Creating a Passport account does not give access to a clinic, pharmacy or lab. Your organisation adds you, and you keep this one account.',
    or: 'or',
    codeTitle: 'Enter your code', codeSub: (p: string) => `We sent a 6-digit code to ${p}.`, code: 'Verification code',
    verify: 'Verify', resend: 'Send a new code', resendIn: 'Send a new code in', change: 'Use a different number',
    dupTitle: 'You already have an account', dupSub: (p: string) => `${p} is already registered with Kiorex Passport. Sign in to continue.`, dupGo: 'Sign in',
    newTitle: 'No account for this number yet', newSub: (p: string) => `${p} is verified. Create your account to continue, it takes a few seconds.`, newGo: 'Create account',
    back: 'Go back',
    passkeyTitle: 'Add a passkey?', passkeySub: 'Sign in faster next time with your fingerprint, face or device PIN. Optional.',
    passkeyAdd: 'Add passkey', passkeySkip: 'Not now', passkeyDone: 'Passkey added.',
    logoutTitle: 'Sign out of Kiorex Passport?', logoutYes: 'Yes, sign out', logoutNo: 'Stay signed in',
    loggedOut: 'You have been signed out.', backToPassport: 'Back to Kiorex Passport',
    expiredTitle: 'Session expired', expiredSub: 'Start again from the app.',
    lang: 'العربية', langName: 'Switch to Arabic', theme: 'Theme', themeL: 'Light', themeD: 'Dark', themeS: 'System',
    devNote: 'Development identity provider - not for production',
    secure: 'Secure sign-in with Kiorex Passport',
    stageTag: 'Kiorex Passport', stageTitle: 'One account. One secure sign-in.',
    stagePoints: ['Sign in with your mobile number, no password to remember', 'One account for Kiorex and Kiorly', 'Passkey and two-step verification when you want more protection'],
    stageNote: 'Your number is only used to verify you. Apps see it only after you sign in to them.',
    err: {
      invalid_phone: 'Enter a valid mobile number in international format.',
      phone_rate_limited: 'Too many codes requested for this number. Try again in an hour.',
      ip_rate_limited: 'Too many requests from your network. Try again later.',
      locked: 'Too many wrong attempts. This number is locked for a short while.',
      send_failed: 'We could not send the code. Please try again.',
      expired: 'This code has expired. Request a new one.',
      wrong: (n: number) => `Incorrect code. ${n} attempt(s) left.`,
      invalid: 'Enter the numeric code.', no_challenge: 'Request a code first.',
      consent_required: 'Please accept the Terms of Use and the Privacy Notice to create an account.',
      passkey: 'Could not add the passkey.',
    },
  },
  ar: {
    title: 'تسجيل الدخول عبر كيوريكس باسبورت',
    sub: 'أدخل رقم هاتفك المحمول وسنرسل لك رمزًا.',
    loginTitle: 'أهلًا بعودتك', loginSub: 'أدخل رقم هاتفك المحمول وسنرسل لك رمزًا. لا حاجة لكلمة مرور.',
    registerTitle: 'أنشئ حسابك', registerSub: 'حساب كيوريكس باسبورت واحد لكيوريكس وكيورلي. نتحقق من رقم هاتفك برمز.',
    tabLogin: 'تسجيل الدخول', tabRegister: 'إنشاء حساب', tabs: 'تسجيل الدخول أو إنشاء حساب',
    ctxLogin: (p: string) => `تسجيل الدخول إلى ${p}`, ctxRegister: (p: string) => `إنشاء حسابك في ${p}`,
    phone: 'رقم الهاتف المحمول', phoneHint: 'بالصيغة الدولية، مثال: ‎+201000000001',
    name: 'اسمك', nameOpt: 'اختياري', send: 'إرسال الرمز',
    consent: (terms: string, privacy: string) => `أوافق على ${terms} و${privacy}.`, termsLabel: 'شروط الاستخدام', privacyLabel: 'إشعار الخصوصية',
    staffNote: 'إنشاء حساب باسبورت لا يمنحك صلاحية الوصول إلى عيادة أو صيدلية أو معمل. تضيفك جهتك، وتحتفظ بهذا الحساب الواحد.',
    or: 'أو',
    codeTitle: 'أدخل الرمز', codeSub: (p: string) => `أرسلنا رمزًا من 6 أرقام إلى ${p}.`, code: 'رمز التحقق',
    verify: 'تحقق', resend: 'إرسال رمز جديد', resendIn: 'إرسال رمز جديد خلال', change: 'استخدام رقم آخر',
    dupTitle: 'لديك حساب بالفعل', dupSub: (p: string) => `${p} مسجّل بالفعل في كيوريكس باسبورت. سجّل الدخول للمتابعة.`, dupGo: 'تسجيل الدخول',
    newTitle: 'لا يوجد حساب لهذا الرقم بعد', newSub: (p: string) => `تم التحقق من ${p}. أنشئ حسابك للمتابعة، يستغرق ثوانٍ.`, newGo: 'إنشاء حساب',
    back: 'رجوع',
    passkeyTitle: 'إضافة مفتاح مرور؟', passkeySub: 'سجّل الدخول أسرع في المرة القادمة ببصمتك أو وجهك أو رمز الجهاز. اختياري.',
    passkeyAdd: 'إضافة مفتاح مرور', passkeySkip: 'ليس الآن', passkeyDone: 'تمت إضافة مفتاح المرور.',
    logoutTitle: 'تسجيل الخروج من كيوريكس باسبورت؟', logoutYes: 'نعم، سجّل الخروج', logoutNo: 'ابقَ مسجّلًا',
    loggedOut: 'تم تسجيل خروجك.', backToPassport: 'العودة إلى كيوريكس باسبورت',
    expiredTitle: 'انتهت الجلسة', expiredSub: 'ابدأ من جديد من التطبيق.',
    lang: 'English', langName: 'التبديل إلى الإنجليزية', theme: 'المظهر', themeL: 'فاتح', themeD: 'داكن', themeS: 'حسب النظام',
    devNote: 'مزوّد هوية للتطوير فقط - ليس للإنتاج',
    secure: 'تسجيل دخول آمن عبر كيوريكس باسبورت',
    stageTag: 'كيوريكس باسبورت', stageTitle: 'حساب واحد. دخول آمن واحد.',
    stagePoints: ['ادخل برقم هاتفك المحمول دون كلمة مرور', 'حساب واحد لكيوريكس وكيورلي', 'مفتاح مرور وتحقق بخطوتين عندما تريد حماية أكبر'],
    stageNote: 'نستخدم رقمك للتحقق منك فقط. لا يراه أي تطبيق إلا بعد أن تسجّل الدخول إليه.',
    err: {
      invalid_phone: 'أدخل رقم هاتف صحيحًا بالصيغة الدولية.',
      phone_rate_limited: 'تم طلب رموز كثيرة لهذا الرقم. حاول مرة أخرى بعد ساعة.',
      ip_rate_limited: 'طلبات كثيرة من شبكتك. حاول لاحقًا.',
      locked: 'محاولات خاطئة كثيرة. تم قفل هذا الرقم لفترة قصيرة.',
      send_failed: 'تعذر إرسال الرمز. حاول مرة أخرى.',
      expired: 'انتهت صلاحية الرمز. اطلب رمزًا جديدًا.',
      wrong: (n: number) => `الرمز غير صحيح. تبقّت ${n} محاولة.`,
      invalid: 'أدخل الرمز الرقمي.', no_challenge: 'اطلب رمزًا أولًا.',
      consent_required: 'يرجى الموافقة على شروط الاستخدام وإشعار الخصوصية لإنشاء الحساب.',
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

/** Product names shown in "Signing in to ..." (the client registry id is never shown). Unknown client: the Passport itself. */
const PRODUCTS: Record<string, { en: string; ar: string; audience: 'patient' | 'staff' | 'ops' }> = {
  'kiorex-web': { en: 'Kiorex', ar: 'كيوريكس', audience: 'patient' },
  'kiorex-mobile': { en: 'Kiorex', ar: 'كيوريكس', audience: 'patient' },
  'kiorex-widget': { en: 'Kiorex booking', ar: 'حجز كيوريكس', audience: 'patient' },
  'kiorex-ops': { en: 'Kiorex Ops', ar: 'عمليات كيوريكس', audience: 'ops' },
  'kiorex-passport-web': { en: 'Kiorex Passport', ar: 'كيوريكس باسبورت', audience: 'patient' },
  kiorly: { en: 'Kiorly', ar: 'كيورلي', audience: 'staff' },
  'kiorly-team': { en: 'Kiorly', ar: 'كيورلي', audience: 'staff' },
  'kiorly-home': { en: 'Kiorly', ar: 'كيورلي', audience: 'staff' },
  'kiorly-clinic': { en: 'Kiorly Clinic', ar: 'كيورلي كلينك', audience: 'staff' },
  'kiorly-pharmacy-web': { en: 'Kiorly Pharmacy', ar: 'كيورلي صيدلية', audience: 'staff' },
  'kiorly-lab-web': { en: 'Kiorly Lab', ar: 'كيورلي معمل', audience: 'staff' },
};
export function productFor(clientId: string | undefined, lang: Lang): { name: string; audience: 'patient' | 'staff' | 'ops' } {
  const p = clientId ? PRODUCTS[clientId] : undefined;
  return p ? { name: p[lang], audience: p.audience } : { name: T[lang].stageTag, audience: 'patient' };
}

/** Page context: which product the person is signing in to and which tab is active. */
export interface Ctx { product: string; audience: 'patient' | 'staff' | 'ops'; mode: Mode }

let cssCache: string | undefined;
const css = () => (cssCache ??= `${brandAsset('tokens.css')}
${brandAsset('fonts.css')}
:root{--kx-field:#64748B;--kx-err-fg:#8A1F11;--kx-ring:color-mix(in srgb,var(--kx-focus) 35%,transparent)}
/* LIGHT is the default; dark applies only for an explicit Dark choice (data-theme=dark) or the explicit System choice (data-theme=auto) */
:root[data-theme=dark]{--kx-field:#7C84B0;--kx-err-fg:#FCA5A5}
@media (prefers-color-scheme:dark){:root[data-theme=auto]{--kx-field:#7C84B0;--kx-err-fg:#FCA5A5}}
/* Arabic: the Arabic companion must come BEFORE the metric fallback, which is a local Arial/Inter and would otherwise draw the Arabic letters itself */
html:root{--kx-font-ar:"IBM Plex Sans Arabic","Plus Jakarta Sans","Plex Arabic Fallback",system-ui,-apple-system,"Segoe UI",sans-serif}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;min-height:100dvh;color:var(--kx-text);font-family:var(--kx-font);line-height:1.6;background:var(--kx-bg);display:grid;grid-template-columns:minmax(0,1fr);grid-template-rows:auto 1fr}
html[lang=ar] body{line-height:1.85}
@media (min-width:960px){body{grid-template-columns:minmax(0,5fr) minmax(0,6fr);grid-template-rows:1fr}}
/* ---- brand stage (calm animated panel; always dark; decorative except the lockup) ---- */
.stage{position:relative;overflow:hidden;color:#fff;background:linear-gradient(155deg,#17154f 0%,#2a2380 46%,#064974 100%);padding:16px 20px;display:flex;flex-direction:column;justify-content:space-between;gap:24px}
.stage .orb{position:absolute;border-radius:50%;filter:blur(60px);opacity:.5;pointer-events:none;will-change:transform}
.stage .o1{width:420px;height:420px;left:-120px;top:-140px;background:#4F46E5;animation:kx-drift 22s ease-in-out infinite alternate}
.stage .o2{width:360px;height:360px;right:-110px;bottom:-120px;background:#0369A1;animation:kx-drift 26s ease-in-out -8s infinite alternate-reverse}
.stage .o3{width:220px;height:220px;right:18%;top:32%;background:#E8735E;opacity:.22;animation:kx-drift 30s ease-in-out -14s infinite alternate}
@keyframes kx-drift{to{transform:translate3d(46px,38px,0) scale(1.12)}}
.stage>*:not(.orb){position:relative;z-index:1}
.lockup{display:flex;align-items:center;gap:14px;direction:ltr}
.lockup svg{width:52px;height:auto;flex:none;overflow:visible}
.wordmark{font-weight:600;letter-spacing:.3em;font-size:1.15rem;color:#F4F6FC;line-height:1}
.wordmark b{font-weight:600;color:#7DD3FC}
.wordmark small{display:block;margin-top:6px;font-size:.62rem;letter-spacing:.32em;font-weight:500;color:#D5D9F5;text-transform:uppercase}
html[lang=ar] .wordmark small{letter-spacing:.04em;text-transform:none;font-size:.78rem}
.mk-bar{transform-box:fill-box;transform-origin:center;animation:kx-grow .7s cubic-bezier(.34,1.4,.64,1) both}
@keyframes kx-grow{from{transform:scaleY(.05);opacity:0}to{transform:scaleY(1);opacity:1}}
.mk-pulse{stroke-dasharray:100;stroke-dashoffset:100;animation:kx-draw 1.1s .55s cubic-bezier(.4,0,.2,1) forwards}
@keyframes kx-draw{to{stroke-dashoffset:0}}
.stage-copy,.stage-foot{display:none}
@media (min-width:960px){
 .stage{padding:48px 56px;position:sticky;top:0;height:100vh;height:100dvh}
 .lockup svg{width:84px}.wordmark{font-size:1.7rem}
 .stage-copy{display:block;max-width:30rem}
 .stage-copy h2{font-size:clamp(1.9rem,3.1vw,2.9rem);line-height:1.12;letter-spacing:-.025em;margin:0 0 28px;font-weight:700;text-wrap:balance}
 html[lang=ar] .stage-copy h2{line-height:1.4;letter-spacing:0}
 .stage-copy ul{list-style:none;margin:0;padding:0;display:grid;gap:16px}
 .stage-copy li{display:flex;gap:12px;align-items:flex-start;color:#E4E7FB;font-size:1.02rem;transform:translateY(14px);animation:kx-rise .6s ease-out forwards}
 .stage-copy li:nth-child(1){animation-delay:.5s}.stage-copy li:nth-child(2){animation-delay:.65s}.stage-copy li:nth-child(3){animation-delay:.8s}
 .stage-copy li i{flex:none;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.14);display:grid;place-items:center;margin-top:1px}
 .stage-copy li svg{width:14px;height:14px}
 .stage-foot{display:block;font-size:.8125rem;color:#D5D9F5;max-width:30rem}
}
@keyframes kx-rise{to{transform:none}}
/* ---- form side ---- */
.main{display:flex;flex-direction:column;min-width:0;padding:12px 16px 24px;background:radial-gradient(900px 420px at 50% -10%,color-mix(in srgb,var(--kx-primary) 10%,transparent),transparent 70%),var(--kx-bg)}
.bar{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px}
.bar .end{display:flex;align-items:center;gap:8px;margin-inline-start:auto}
.back{display:inline-flex;align-items:center;gap:6px;width:auto;min-height:44px;margin:0;padding:6px 14px 6px 10px;border:1px solid transparent;border-radius:var(--kx-radius-full);background:transparent;color:var(--kx-text-muted);font:inherit;font-weight:500;font-size:.9375rem;cursor:pointer;box-shadow:none;transition:background var(--kx-dur-fast),color var(--kx-dur-fast),transform var(--kx-dur-fast)}
html[dir=rtl] .back{padding:6px 10px 6px 14px}
.back:hover{background:var(--kx-primary-soft)!important;color:var(--kx-text);filter:none;box-shadow:none!important}
.back svg{width:18px;height:18px;transition:transform var(--kx-dur-base) var(--kx-ease-standard)}
html[dir=rtl] .back svg{transform:scaleX(-1)}
.back:hover svg{transform:translateX(-2px)}html[dir=rtl] .back:hover svg{transform:scaleX(-1) translateX(-2px)}
.pill{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border:1px solid var(--kx-border);border-radius:var(--kx-radius-full);background:var(--kx-surface);color:var(--kx-text-muted);font-size:.8125rem;font-weight:500;text-decoration:none;transition:border-color var(--kx-dur-fast),color var(--kx-dur-fast)}
.pill:hover{border-color:var(--kx-border-strong);color:var(--kx-text)}
.pill svg{width:15px;height:15px;flex:none}
.theme-sel{position:relative;display:inline-flex;align-items:center;margin:0;font-weight:500}
.theme-sel select{appearance:none;-webkit-appearance:none;width:auto;min-height:44px;margin:0;padding:0 14px;border-radius:var(--kx-radius-full);font:inherit;font-size:.8125rem;font-weight:500;color:var(--kx-text-muted);background:var(--kx-surface);border:1px solid var(--kx-border);cursor:pointer;text-align:center}
.theme-sel select:hover{border-color:var(--kx-border-strong)}
.theme-sel span{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.center{flex:1;display:flex;align-items:center;justify-content:center;padding:16px 0}
.card{width:100%;max-width:440px;background:var(--kx-surface);border:1px solid var(--kx-border);border-radius:var(--kx-radius-xl);padding:26px 22px 22px;box-shadow:var(--kx-shadow-3);animation:kx-card .5s var(--kx-ease-decelerate) both}
@keyframes kx-card{from{transform:translateY(14px)}to{transform:none}}
@media (min-width:960px){.card{padding:36px 36px 30px;max-width:460px;box-shadow:var(--kx-shadow-4)}.main{padding:20px 40px 32px}}
.ctx{display:flex;align-items:center;gap:8px;width:fit-content;margin:0 0 14px;padding:6px 12px;border-radius:var(--kx-radius-full);background:var(--kx-primary-soft);color:var(--kx-text);font-size:.8125rem;font-weight:600}
.ctx i{width:8px;height:8px;border-radius:50%;background:var(--kx-accent);animation:kx-ping 2.2s ease-out infinite}
@keyframes kx-ping{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--kx-accent) 55%,transparent)}70%,100%{box-shadow:0 0 0 8px transparent}}
.secure{display:flex;align-items:center;justify-content:center;gap:6px;margin:20px 0 0;font-size:.8125rem;color:var(--kx-text-subtle)}
.secure svg{flex:none}
h1{font-size:1.625rem;letter-spacing:-.02em;margin:0 0 8px;line-height:1.25;font-weight:700;text-wrap:balance}
html[lang=ar] h1{letter-spacing:0;line-height:1.5}
p{color:var(--kx-text-muted);margin:0 0 18px}
.tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;padding:4px;margin:0 0 20px;background:var(--kx-bg-subtle);border-radius:var(--kx-radius-md);border:1px solid var(--kx-border)}
.tabs a{display:flex;align-items:center;justify-content:center;min-height:44px;border-radius:calc(var(--kx-radius-md) - 3px);color:var(--kx-text-muted);font-weight:600;font-size:.9375rem;text-decoration:none;transition:background var(--kx-dur-base),color var(--kx-dur-base),box-shadow var(--kx-dur-base)}
.tabs a[aria-current=page]{background:var(--kx-surface);color:var(--kx-text);box-shadow:var(--kx-shadow-2)}
.tabs a:hover:not([aria-current=page]){color:var(--kx-text)}
.mode-login [data-only=register],.mode-register [data-only=login]{display:none!important}
label{display:block;font-weight:500;margin:14px 0 6px;font-size:.9375rem}
label small{font-weight:400;color:var(--kx-text-subtle);margin-inline-start:6px}
input{width:100%;min-height:48px;padding:10px 14px;border:1px solid var(--kx-field);border-radius:var(--kx-radius-md);font:inherit;background:var(--kx-surface);color:var(--kx-text);transition:border-color var(--kx-dur-fast),box-shadow var(--kx-dur-fast)}
input:focus{outline:none;border-color:var(--kx-primary);box-shadow:0 0 0 3px var(--kx-ring)}
button:focus-visible,a:focus-visible,select:focus-visible{outline:var(--kx-focus-width) solid var(--kx-focus);outline-offset:2px}
.hint{font-size:.8125rem;color:var(--kx-text-subtle);margin-top:6px}
button,.btn{display:block;width:100%;min-height:48px;margin-top:16px;padding:12px;border:1px solid transparent;border-radius:var(--kx-radius-md);font:inherit;font-weight:600;cursor:pointer;background:var(--kx-gradient);color:#fff;text-align:center;text-decoration:none;position:relative;transition:transform var(--kx-dur-fast) var(--kx-ease-standard),filter var(--kx-dur-fast),box-shadow var(--kx-dur-base)}
button:hover:not(:disabled),.btn:hover{filter:brightness(1.07);box-shadow:0 6px 18px color-mix(in srgb,var(--kx-primary) 32%,transparent)}
button:active:not(:disabled),.btn:active{transform:scale(.985)}
button.secondary,.btn.secondary{background:transparent;color:var(--kx-link);border-color:var(--kx-border-strong);filter:none;box-shadow:none}
button.secondary:hover:not(:disabled),.btn.secondary:hover{background:var(--kx-primary-soft);box-shadow:none;filter:none}
button.quiet{background:transparent;color:var(--kx-link);border-color:transparent;margin-top:8px;min-height:44px;font-weight:500;box-shadow:none;filter:none}
button.quiet:hover:not(:disabled){background:var(--kx-primary-soft);box-shadow:none;filter:none}
button:disabled{cursor:not-allowed;opacity:.65}
button[aria-busy=true]{color:transparent!important;pointer-events:none}
button[aria-busy=true]::after{content:"";position:absolute;inset:0;margin:auto;width:20px;height:20px;border-radius:50%;border:2.5px solid rgba(255,255,255,.45);border-top-color:#fff;animation:kx-spin .7s linear infinite}
button.secondary[aria-busy=true]::after,button.quiet[aria-busy=true]::after{border-color:color-mix(in srgb,var(--kx-link) 30%,transparent);border-top-color:var(--kx-link)}
@keyframes kx-spin{to{transform:rotate(360deg)}}
.error{background:var(--kx-danger-soft);color:var(--kx-err-fg);border:1px solid color-mix(in srgb,var(--kx-danger) 40%,transparent);border-radius:var(--kx-radius-md);padding:10px 14px;margin:0 0 12px;text-align:start;animation:kx-shake .4s}
@keyframes kx-shake{20%{transform:translateX(-5px)}40%{transform:translateX(5px)}60%{transform:translateX(-3px)}80%{transform:translateX(3px)}}
.ok{background:var(--kx-success-soft);color:var(--kx-success);border-radius:var(--kx-radius-md);padding:10px 14px;margin-top:12px}
.note{background:var(--kx-info-soft);color:var(--kx-text);border-radius:var(--kx-radius-md);padding:10px 14px;margin:14px 0 0;font-size:.875rem}
.divider{display:flex;align-items:center;gap:12px;margin:18px 0 2px;color:var(--kx-text-subtle);font-size:.8125rem}
.divider::before,.divider::after{content:"";flex:1;height:1px;background:var(--kx-hairline)}
.check{display:flex;gap:12px;align-items:flex-start;margin:16px 0 0;font-weight:400;font-size:.9rem;line-height:1.5;color:var(--kx-text-muted);cursor:pointer}
.check input{width:22px;height:22px;min-height:22px;flex:none;margin:1px 0 0;padding:0;accent-color:var(--kx-primary)}
.check a{font-weight:600}
a{color:var(--kx-link)}
.code{letter-spacing:.5em;text-align:center;font-size:1.5rem;direction:ltr;font-variant-numeric:tabular-nums}
.phone{direction:ltr;text-align:start}
html[dir=rtl] .phone{text-align:right}
code{font-family:var(--kx-font-mono)}
/* ---- one-time code: ONE real input (paste, autofill, screen readers) drawn as cells when scripting is available ---- */
.otp{position:relative;direction:ltr}
.otp .cells{display:none}
.js .otp .cells{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;pointer-events:none}
.js .otp .cells i{display:grid;place-items:center;height:56px;border:1px solid var(--kx-field);border-radius:var(--kx-radius-md);background:var(--kx-surface);font-style:normal;font-size:1.5rem;font-weight:600;font-variant-numeric:tabular-nums;transition:border-color var(--kx-dur-fast),box-shadow var(--kx-dur-fast)}
.js .otp:focus-within .cells i.on{border-color:var(--kx-primary);box-shadow:0 0 0 3px var(--kx-ring)}
.js .otp .cells i.pop{animation:kx-pop .22s cubic-bezier(.34,1.4,.64,1)}
@keyframes kx-pop{from{transform:scale(.86)}to{transform:none}}
.js .otp.err .cells i{border-color:var(--kx-danger)}
.js .otp input{position:absolute;inset:0;width:100%;height:100%;min-height:0;opacity:.001;letter-spacing:0;font-size:16px;padding:0;caret-color:transparent;z-index:2}
/* ---- result badges ---- */
.badge{width:64px;height:64px;margin:0 auto 14px;border-radius:50%;display:grid;place-items:center;background:var(--kx-success-soft);color:var(--kx-success)}
.badge.info{background:var(--kx-primary-soft);color:var(--kx-primary)}
.badge svg{width:30px;height:30px}
.badge path{stroke-dasharray:30;stroke-dashoffset:30;animation:kx-draw-s .6s .15s ease-out forwards}
@keyframes kx-draw-s{to{stroke-dashoffset:0}}
.center-t{text-align:center}.center-t p{text-align:center}
.foot{margin-top:10px;font-size:.78rem;color:var(--kx-text-subtle);text-align:center}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important;animation:none!important}.mk-pulse{stroke-dashoffset:0}.stage-copy li{transform:none}.badge path{stroke-dashoffset:0}}`);

/** The Kiorex mark, geometry verbatim from the founder's logo spec (viewBox 20 20 110 90), drawn on load: bars grow in, the coral pulse is traced. */
const BAR_H = [22, 20, 17.5, 13.5]; const BAR_Y1 = [26, 33, 40, 47]; const BAR_Y2 = [82, 77, 72.5, 69.5];
const bars = (xs: number[], fill: string, reverse: boolean, from: number) => xs.map((x, i) => {
  const k = reverse ? 3 - i : i; const d = ((from + i) * 0.06).toFixed(2);
  return `<rect class="mk-bar" style="animation-delay:${d}s" x="${x}" y="${BAR_Y1[k]}" width="3.6" height="${BAR_H[k]}" rx="1.8" fill="${fill}"/><rect class="mk-bar" style="animation-delay:${d}s" x="${x}" y="${BAR_Y2[k]}" width="3.6" height="${BAR_H[k]}" rx="1.8" fill="${fill}"/>`;
}).join('');
const MARK = `<svg viewBox="20 20 110 90" role="img" aria-label="Kiorex">${bars([37, 45, 53, 61], '#6366F1', false, 0)}<polyline class="mk-pulse" pathLength="100" points="24,65 64,65 68,61 72.5,51 77,79 81.5,57 85,65 126,65" fill="none" stroke="#E8735E" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>${bars([85.4, 93.4, 101.4, 109.4], '#38BDF8', true, 4)}</svg>`;

const SHIELD = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>`;
const CHEV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`;
const GLOBE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>`;
const TICK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const USER = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M5 20c1-4 4-5.5 7-5.5s6 1.5 7 5.5"/></svg>`;
export const BADGE_OK = `<div class="badge" aria-hidden="true">${TICK}</div>`;
export const BADGE_USER = `<div class="badge info" aria-hidden="true">${USER}</div>`;

/** Applied before first paint: LIGHT unless the user explicitly chose Dark or System (localStorage `kx-theme`, shared with the account pages on this origin). */
export const THEME_BOOT = `try{var t=localStorage.getItem('kx-theme');document.documentElement.dataset.theme=t==='dark'?'dark':t==='system'?'auto':'light';}catch(e){}document.documentElement.className+=' js';`;
const THEME_WIRE = `(function(){var s=document.getElementById('kx-theme-select');if(!s)return;var t='light';try{var v=localStorage.getItem('kx-theme');if(v==='dark'||v==='system')t=v}catch(e){}s.value=t;s.addEventListener('change',function(){var v=s.value;document.documentElement.dataset.theme=v==='dark'?'dark':v==='system'?'auto':'light';try{localStorage.setItem('kx-theme',v)}catch(e){}})})();`;

/** Progressive enhancement for every Passport page: Western digits, one-time-code cells, mode tabs, resend countdown, busy buttons, browser Back = in-flow Back. */
const ENHANCE = `(function(){
var W=function(s){return String(s).replace(/[\\u0660-\\u0669]/g,function(c){return c.charCodeAt(0)-1632}).replace(/[\\u06F0-\\u06F9]/g,function(c){return c.charCodeAt(0)-1776})};
var ph=document.getElementById('phone');if(ph)ph.addEventListener('input',function(){var v=W(ph.value);if(v!==ph.value)ph.value=v});
document.querySelectorAll('.otp').forEach(function(o){var inp=o.querySelector('input'),cells=o.querySelectorAll('.cells i'),n=cells.length,f=inp.form,btn=f&&f.querySelector('button[type=submit]');
 function draw(pop){var v=W(inp.value).replace(/\\D/g,'').slice(0,n);if(v!==inp.value)inp.value=v;cells.forEach(function(c,k){var had=c.textContent;c.textContent=v[k]||'';c.classList.toggle('on',k===Math.min(v.length,n-1));if(pop&&v[k]&&!had)c.classList.add('pop');else c.classList.remove('pop')});o.classList.remove('err');if(v.length===n&&pop&&btn)btn.focus()}
 inp.addEventListener('input',function(){draw(true)});inp.addEventListener('focus',function(){draw(false)});inp.addEventListener('paste',function(){setTimeout(function(){draw(true)},0)});
 if(o.dataset.err)o.classList.add('err');draw(false)});
var flow=document.getElementById('flow');
if(flow){var tabs=flow.querySelectorAll('.tabs a');tabs.forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var m=a.dataset.mode;flow.classList.remove('mode-login','mode-register');flow.classList.add('mode-'+m);tabs.forEach(function(x){if(x===a)x.setAttribute('aria-current','page');else x.removeAttribute('aria-current')});
 var mi=document.getElementById('mode');if(mi)mi.value=m;var c=document.getElementById('consent');if(c)c.required=m==='register';
 var er=flow.querySelector('.error');if(er)er.remove();try{var u=new URL(location.href);u.searchParams.set('intent',m);history.replaceState(null,'',u)}catch(_){}
 var fl=document.getElementById('phone');if(fl)fl.focus()})})}
document.querySelectorAll('[data-resend]').forEach(function(b){var n=Number(b.dataset.resend)||30,l=b.dataset.label,orig=b.textContent;b.disabled=true;function tick(){if(n<=0){b.disabled=false;b.textContent=orig;return}b.textContent=l+' '+Math.floor(n/60)+':'+('0'+(n%60)).slice(-2);n--;setTimeout(tick,1000)}tick()});
document.querySelectorAll('form').forEach(function(f){f.addEventListener('submit',function(){var b=f.querySelector('button[type=submit]');if(!b)return;setTimeout(function(){b.setAttribute('aria-busy','true')},0)})});
window.addEventListener('pageshow',function(e){if(e.persisted)document.querySelectorAll('button[aria-busy]').forEach(function(b){b.removeAttribute('aria-busy')})});
var hb=document.querySelector('[data-history-back]');if(hb)hb.addEventListener('click',function(){if(history.length>1)history.back();else location.href='/account'});
var bf=document.getElementById('kx-back');if(bf&&document.body.dataset.step==='in'){try{history.pushState({kx:1},'',location.href);window.addEventListener('popstate',function(){bf.requestSubmit()})}catch(_){}}
})();`;

export interface PageOpts {
  langSwitchHref?: string; script?: string;
  /** Go back: a server step (`action` under /interaction/<uid>/, works without scripting), or the browser history for pages outside an interaction. Action `back` also maps the browser Back button to it. */
  back?: { uid: string; action: 'back' | 'cancel' } | 'history';
  ctx?: Ctx;
}

const ctxChip = (lang: Lang, c?: Ctx) => {
  if (!c) return '';
  const x = T[lang];
  return `<div class="ctx"><i aria-hidden="true"></i><span data-only="login">${esc(x.ctxLogin(c.product))}</span><span data-only="register">${esc(x.ctxRegister(c.product))}</span></div>`;
};

export function page(lang: Lang, title: string, body: string, opts: PageOpts = {}): string {
  const tx = T[lang];
  const wordmark = `<span class="wordmark" dir="ltr">KIORE<b>X</b><small>${lang === 'ar' ? 'باسبورت' : 'Passport'}</small></span>`;
  const check = `<i aria-hidden="true">${TICK}</i>`;
  const stage = `<aside class="stage" aria-label="${esc(tx.stageTag)}"><span class="orb o1"></span><span class="orb o2"></span><span class="orb o3"></span>
<div class="lockup">${MARK}${wordmark}</div>
<div class="stage-copy"><h2>${esc(tx.stageTitle)}</h2><ul>${tx.stagePoints.map((p) => `<li>${check}<span>${esc(p)}</span></li>`).join('')}</ul></div>
<div class="stage-foot">${esc(tx.stageNote)}</div></aside>`;
  const back = opts.back === 'history'
    ? `<button type="button" class="back" data-history-back>${CHEV}<span>${esc(tx.back)}</span></button>`
    : opts.back ? `<button type="submit" class="back" form="kx-back">${CHEV}<span>${esc(tx.back)}</span></button>` : '<span></span>';
  const backForm = opts.back && opts.back !== 'history' ? `<form id="kx-back" method="post" action="/interaction/${esc(opts.back.uid)}/${opts.back.action}" hidden><input type="hidden" name="lang" value="${lang}"></form>` : '';
  const langLink = opts.langSwitchHref ? `<a class="pill" href="${esc(opts.langSwitchHref)}" hreflang="${lang === 'ar' ? 'en' : 'ar'}" lang="${lang === 'ar' ? 'en' : 'ar'}">${GLOBE}<span>${esc(tx.lang)}</span></a>` : '';
  const themeSelect = `<label class="theme-sel" for="kx-theme-select"><span>${tx.theme}</span><select id="kx-theme-select" aria-label="${tx.theme}"><option value="light">${tx.themeL}</option><option value="dark">${tx.themeD}</option><option value="system">${tx.themeS}</option></select></label>`;
  const inFlow = !!opts.back && opts.back !== 'history' && opts.back.action === 'back';
  return `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${esc(title)} - Kiorex Passport</title><script>${THEME_BOOT}</script>
<link rel="icon" href="/static/brand/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/static/brand/apple-touch-icon.png"><style>${css()}</style></head><body data-step="${inFlow ? 'in' : 'first'}">
${stage}
<div class="main"><div class="bar">${back}<div class="end">${langLink}${themeSelect}</div></div>
<main class="center"><div class="card mode-${opts.ctx?.mode ?? 'login'}" id="${opts.ctx ? 'flow' : 'card'}">
${ctxChip(lang, opts.ctx)}${body}
<div class="secure">${SHIELD}<span>${esc(tx.secure)}</span></div>
${env.hosted ? '' : `<div class="foot">${esc(tx.devNote)}</div>`}
</div></main>${backForm}</div>
<script>${THEME_WIRE}</script><script>${ENHANCE}</script>${opts.script ? `<script src="/static/simplewebauthn-browser.js"></script><script>${opts.script}</script>` : ''}</body></html>`;
}

export const err = (msg: string) => (msg ? `<div class="error" role="alert">${esc(msg)}</div>` : '');

const X2 = {
  en: {
    pkLogin: 'Sign in with a passkey', pkFail: 'Passkey sign-in failed. Use your phone number instead.',
    fedWith: (n: string) => `Continue with ${n}`, fedLink: 'Your provider account is not linked yet. Verify your mobile number once to link it to Kiorex Passport.',
    totpTitle: 'Two-step verification', totpSub: 'Enter the 6-digit code from your authenticator app.', totpCode: 'Authenticator code', totpGo: 'Verify',
    totpEnrolTitle: 'Set up your authenticator', totpEnrolSub: 'Two-step verification is required for your account. Add this key to an authenticator app (for example Google Authenticator, Microsoft Authenticator or Authy), then enter the 6-digit code it shows.', totpKey: 'Setup key',
    totpSkip: 'Skip for now', totpOptionalSub: 'You turned on two-step verification. Enter the code to sign in with it, or skip.',
    totpErr: { wrong: (n: number) => `Incorrect code. ${n} attempt(s) left.`, locked: 'Too many wrong attempts. Try again in a few minutes.', invalid: 'Enter the 6-digit code.' },
  },
  ar: {
    pkLogin: 'تسجيل الدخول بمفتاح مرور', pkFail: 'فشل الدخول بمفتاح المرور. استخدم رقم هاتفك.',
    fedWith: (n: string) => `المتابعة عبر ${n}`, fedLink: 'حساب مزوّد الخدمة غير مرتبط بعد. تحقق من رقم هاتفك مرة واحدة لربطه بكيوريكس باسبورت.',
    totpTitle: 'التحقق بخطوتين', totpSub: 'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة.', totpCode: 'رمز المصادقة', totpGo: 'تحقق',
    totpEnrolTitle: 'إعداد تطبيق المصادقة', totpEnrolSub: 'التحقق بخطوتين مطلوب لحسابك. أضف هذا المفتاح إلى تطبيق مصادقة (مثل Google Authenticator أو Microsoft Authenticator أو Authy) ثم أدخل الرمز المكوّن من 6 أرقام الذي يظهر.', totpKey: 'مفتاح الإعداد',
    totpSkip: 'تخطَّ الآن', totpOptionalSub: 'لقد فعّلت التحقق بخطوتين. أدخل الرمز لتسجيل الدخول به أو تخطَّ.',
    totpErr: { wrong: (n: number) => `الرمز غير صحيح. تبقّت ${n} محاولة.`, locked: 'محاولات خاطئة كثيرة. حاول بعد دقائق.', invalid: 'أدخل الرمز المكوّن من 6 أرقام.' },
  },
} as const;
export const t2 = (lang: Lang) => X2[lang];

const langHref = (uid: string, lang: Lang, mode?: Mode) => `/interaction/${uid}?lang=${lang === 'ar' ? 'en' : 'ar'}${mode ? `&intent=${mode}` : ''}`;
const cells = '<div class="cells" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>';

export function phonePage(lang: Lang, uid: string, o: { error?: string; phone?: string; name?: string; passkeyLogin?: boolean; federation?: Array<{ id: string; name: string }>; fedLinkNotice?: boolean; ctx?: Ctx; allowRegister?: boolean; consent?: boolean } = {}): string {
  const x = t(lang); const y = t2(lang);
  const ctx: Ctx = o.ctx ?? { product: x.stageTag, audience: 'patient', mode: 'login' };
  const reg = o.allowRegister !== false; const mode: Mode = reg ? ctx.mode : 'login';
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
  const link = (url: string, label: string) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : `<strong>${esc(label)}</strong>`);
  const consent = `<label class="check" data-only="register" for="consent"><input type="checkbox" id="consent" name="consent" value="1"${o.consent ? ' checked' : ''}${mode === 'register' ? ' required' : ''}><span>${x.consent(link(env.termsUrl, x.termsLabel), link(env.privacyUrl, x.privacyLabel))}</span></label>`;
  const tabs = reg ? `<nav class="tabs" aria-label="${esc(x.tabs)}"><a href="/interaction/${esc(uid)}?intent=login&amp;lang=${lang}" data-mode="login"${mode === 'login' ? ' aria-current="page"' : ''}>${x.tabLogin}</a><a href="/interaction/${esc(uid)}?intent=register&amp;lang=${lang}" data-mode="register"${mode === 'register' ? ' aria-current="page"' : ''}>${x.tabRegister}</a></nav>` : '';
  const heads = reg
    ? `<div data-only="login"><h1>${x.loginTitle}</h1><p>${x.loginSub}</p></div><div data-only="register"><h1>${x.registerTitle}</h1><p>${x.registerSub}</p></div>`
    : `<h1>${x.loginTitle}</h1><p>${x.loginSub}</p>`;
  const alt = o.passkeyLogin || fed ? `<div class="divider" data-only="login"><span>${x.or}</span></div><div data-only="login">${pk}${fed}</div>` : '';
  return page(lang, mode === 'register' ? x.registerTitle : x.title, `${tabs}${heads}${o.fedLinkNotice ? `<div class="ok" role="status">${y.fedLink}</div>` : ''}${err(o.error ?? '')}
<form method="post" action="/interaction/${esc(uid)}/phone">
<input type="hidden" name="lang" value="${lang}"><input type="hidden" name="mode" id="mode" value="${reg ? mode : 'login'}">
<label for="phone">${x.phone}</label><input id="phone" class="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required dir="ltr" aria-describedby="phone-hint" value="${esc(o.phone ?? '')}" placeholder="+201000000001">
<div class="hint" id="phone-hint">${x.phoneHint}</div>
<div data-only="register"><label for="name">${x.name}<small>${x.nameOpt}</small></label><input id="name" name="name" autocomplete="name" maxlength="80" value="${esc(o.name ?? '')}"></div>
${reg ? consent : ''}
${reg && ctx.audience === 'staff' ? `<div class="note" data-only="register">${esc(x.staffNote)}</div>` : ''}
<button type="submit">${x.send}</button></form>${alt}`,
  { langSwitchHref: langHref(uid, lang, reg ? mode : undefined), script, back: { uid, action: 'cancel' }, ctx: reg ? ctx : { ...ctx, mode: 'login' } });
}

/** KA-10: TOTP challenge, or first-time enrolment (secret shown) for privileged roles. */
export function totpPage(lang: Lang, uid: string, o: { error?: string; enrol?: { secret: string; uri: string }; skippable?: boolean } = {}): string {
  const y = t2(lang);
  const head = o.enrol
    ? `<h1>${y.totpEnrolTitle}</h1><p>${y.totpEnrolSub}</p><p>${y.totpKey}: <bdi dir="ltr" id="totp-secret"><code>${esc(o.enrol.secret)}</code></bdi></p><p class="hint"><bdi dir="ltr">${esc(o.enrol.uri)}</bdi></p>`
    : `<h1>${y.totpTitle}</h1><p>${o.skippable ? y.totpOptionalSub : y.totpSub}</p>`;
  return page(lang, y.totpTitle, `${head}${err(o.error ?? '')}
<form method="post" action="/interaction/${esc(uid)}/totp"><input type="hidden" name="lang" value="${lang}">
<label for="totp">${y.totpCode}</label><div class="otp"${o.error ? ' data-err="1"' : ''}>${cells}<input id="totp" class="code" name="totp" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="6" required autofocus></div>
<button type="submit">${y.totpGo}</button></form>${o.skippable ? `\n<form method="post" action="/interaction/${esc(uid)}/totp/skip"><input type="hidden" name="lang" value="${lang}"><button type="submit" class="secondary" id="totp-skip">${y.totpSkip}</button></form>` : ''}`,
  { langSwitchHref: langHref(uid, lang), back: { uid, action: 'back' } });
}

export function codePage(lang: Lang, uid: string, maskedPhone: string, o: { error?: string } = {}): string {
  const x = t(lang);
  return page(lang, x.codeTitle, `<h1>${x.codeTitle}</h1><p>${x.codeSub(`<bdi dir="ltr">${esc(maskedPhone)}</bdi>`)}</p>${err(o.error ?? '')}
<form method="post" action="/interaction/${esc(uid)}/verify"><input type="hidden" name="lang" value="${lang}">
<label for="code">${x.code}</label><div class="otp"${o.error ? ' data-err="1"' : ''}>${cells}<input id="code" class="code" name="code" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="10" required autofocus></div>
<button type="submit">${x.verify}</button></form>
<form method="post" action="/interaction/${esc(uid)}/resend"><input type="hidden" name="lang" value="${lang}"><button class="quiet" type="submit" data-resend="30" data-label="${esc(x.resendIn)}">${x.resend}</button></form>
<form method="post" action="/interaction/${esc(uid)}/change"><input type="hidden" name="lang" value="${lang}"><button class="quiet" type="submit">${x.change}</button></form>`,
  { langSwitchHref: langHref(uid, lang), back: { uid, action: 'back' } });
}

/** After a verified code: the number already has an account (register tab), or has none yet (sign-in tab). Shown only AFTER verification, so no account is revealed to someone who does not hold the number. */
export function noticePage(lang: Lang, uid: string, kind: 'dup' | 'new', maskedPhone: string, o: { name?: string; error?: string } = {}): string {
  const x = t(lang); const ph = `<bdi dir="ltr">${esc(maskedPhone)}</bdi>`;
  const change = `<form method="post" action="/interaction/${esc(uid)}/change"><input type="hidden" name="lang" value="${lang}"><button class="quiet" type="submit">${x.change}</button></form>`;
  const link = (url: string, label: string) => (url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : `<strong>${esc(label)}</strong>`);
  if (kind === 'dup') {
    return page(lang, x.dupTitle, `<div class="center-t">${BADGE_USER}<h1>${x.dupTitle}</h1><p>${x.dupSub(ph)}</p></div>
<form method="post" action="/interaction/${esc(uid)}/continue"><input type="hidden" name="lang" value="${lang}"><button type="submit" id="dup-signin">${x.dupGo}</button></form>${change}`,
    { langSwitchHref: langHref(uid, lang), back: { uid, action: 'back' } });
  }
  return page(lang, x.newTitle, `<div class="center-t">${BADGE_OK}<h1>${x.newTitle}</h1><p>${x.newSub(ph)}</p></div>${err(o.error ?? '')}
<form method="post" action="/interaction/${esc(uid)}/create"><input type="hidden" name="lang" value="${lang}">
<label for="name">${x.name}<small>${x.nameOpt}</small></label><input id="name" name="name" autocomplete="name" maxlength="80" value="${esc(o.name ?? '')}">
<label class="check" for="consent"><input type="checkbox" id="consent" name="consent" value="1" required><span>${x.consent(link(env.termsUrl, x.termsLabel), link(env.privacyUrl, x.privacyLabel))}</span></label>
<button type="submit" id="create-account">${x.newGo}</button></form>${change}`,
  { langSwitchHref: langHref(uid, lang), back: { uid, action: 'back' } });
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
<form id="finish" method="post" action="/interaction/${esc(uid)}/finish"><button class="secondary" type="submit">${x.passkeySkip}</button></form>`, { script, back: { uid, action: 'back' } });
}

export const expiredPage = (lang: Lang) => page(lang, t(lang).expiredTitle, `<div class="center-t"><h1>${t(lang).expiredTitle}</h1><p>${t(lang).expiredSub}</p></div>`, { back: 'history' });

export function logoutPage(lang: Lang, formHtml: string, auto = false): string {
  const x = t(lang);
  // oidc-provider renders only the <form id="op.logoutForm"> (with its CSRF input); the confirm / cancel buttons are ours.
  // `auto` (a verified id_token_hint: the user already pressed Sign out inside the app) confirms at once, so "Stay signed in"
  // can never log the user out of the app while the Passport session survives. Without JS the buttons below remain.
  const buttons = `<button autofocus type="submit" form="op.logoutForm" name="logout" value="yes">${x.logoutYes}</button>
<button class="secondary" type="submit" form="op.logoutForm">${x.logoutNo}</button>`;
  if (!auto) return page(lang, x.logoutTitle, `<h1>${x.logoutTitle}</h1>${formHtml}${buttons}`, { back: 'history' });
  const script = `var f=document.getElementById('op.logoutForm');if(f){var i=document.createElement('input');i.type='hidden';i.name='logout';i.value='yes';f.appendChild(i);f.submit();}`;
  return page(lang, x.logoutTitle, `<h1>${lang === 'ar' ? 'جارٍ تسجيل الخروج…' : 'Signing you out…'}</h1>${formHtml}<noscript>${buttons}</noscript>`, { back: 'history' }).replace('</body>', `<script>${script}</script></body>`);
}
export const loggedOutPage = (lang: Lang) => page(lang, t(lang).loggedOut, `<div class="center-t">${BADGE_OK}<h1>${t(lang).loggedOut}</h1></div><a class="btn secondary" href="/account">${t(lang).backToPassport}</a>`);
