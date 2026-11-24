import { generateSync } from 'otplib';
import { loadSeedUsers, type SeedUser } from './config.js';
type Lang = 'ar' | 'en';
const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/**
 * DEV ONLY quick-pick test users for the Passport sign-in screens (founder request 23 Nov 2026).
 * Everything here is synthetic: seeded phones, the fixed dev OTP 000000 and the documented dev TOTP seeds.
 * Shown only when NODE_ENV is not production AND KX_DEV_TEST_USERS is not "false" (the dev IdP also refuses to start in production).
 */
export const DEV_OTP = '000000';

export function devTestUsersEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const prod = [env.NODE_ENV, env.KX_ENV, env.APP_ENV].some((v) => ['production', 'prod'].includes((v ?? '').toLowerCase()));
  return !prod && (env.KX_DEV_TEST_USERS ?? 'true').toLowerCase() !== 'false';
}

export type DevGroup = 'patients' | 'providers' | 'nurse' | 'ops';
export interface DevUser { phone: string; name: string; group: DevGroup; role: string; sub: string; totp: boolean }

export function groupOf(u: Pick<SeedUser, 'phone' | 'roles'>): DevGroup {
  if (u.roles.includes('ops_admin') || u.roles.includes('super_admin')) return 'ops';
  const p = u.phone.replace(/^\+2010000/, '');
  if (p.startsWith('30')) return 'nurse';
  if (p.startsWith('20')) return 'providers';
  return 'patients';
}
function roleOf(u: SeedUser, g: DevGroup): string {
  if (g === 'ops') return u.roles.includes('super_admin') ? 'Ops super admin' : u.roles.includes('finance') ? 'Ops finance' : u.roles.includes('support') ? 'Ops support' : 'Ops admin';
  if (g === 'providers') return 'Provider staff (Clinic, Pharmacy, Lab)';
  if (g === 'nurse') return 'Nurse edition';
  return 'Patient';
}

let cache: DevUser[] | undefined;
export function devUsers(seed?: SeedUser[]): DevUser[] {
  if (seed) return seed.map(toDev);
  return (cache ??= loadSeedUsers().map(toDev));
}
function toDev(u: SeedUser): DevUser {
  const group = groupOf(u);
  return { phone: u.phone, name: u.name, group, role: roleOf(u, group), sub: u.sub, totp: group === 'ops' };
}
export const isDevPhone = (phone: string | undefined, users = devUsers()): DevUser | undefined => (phone ? users.find((u) => u.phone === phone.replace(/[\s-]/g, '')) : undefined);

/** Current 6-digit code for a base32 secret (same parameters as the verifier). */
export function currentTotp(secret: string, epoch: number, period: number, digits: number): string {
  return generateSync({ secret, strategy: 'totp', period, digits: digits as 6, epoch });
}

const L = {
  en: {
    title: 'Test users (dev only)', hint: 'Local development only. Click a user to sign in: the phone is filled and the dev code 000000 is used. Synthetic data.',
    groups: { patients: 'Patients', providers: 'Provider staff (Clinic, Pharmacy, Lab)', nurse: 'Nurse edition', ops: 'Ops console (needs authenticator code)' },
    codeHint: 'Dev only: the fixed code for seeded test numbers is 000000.', codeFill: 'Fill 000000 and verify', signingAs: (n: string) => `Signing in as ${n} (dev test user)...`,
    totpHint: 'Dev only: the current code for this ops test user.', totpFill: 'Fill current code and verify', totpSeed: 'Dev seed', copy: 'Copy seed', copied: 'Copied',
    totpReplay: 'If it says wrong code, that 30-second code was already used: wait for the next one and press again.',
  },
  ar: {
    title: 'مستخدمو الاختبار (للتطوير فقط)', hint: 'للتطوير المحلي فقط. اضغط على مستخدم لتسجيل الدخول: يُملأ الهاتف ويُستخدم رمز التطوير 000000. بيانات تجريبية.',
    groups: { patients: 'المرضى', providers: 'فريق مقدمي الخدمة (العيادة والصيدلية والمعمل)', nurse: 'نسخة التمريض', ops: 'لوحة العمليات (تحتاج رمز المصادقة)' },
    codeHint: 'للتطوير فقط: الرمز الثابت للأرقام التجريبية هو 000000.', codeFill: 'املأ 000000 وتحقق', signingAs: (n: string) => `تسجيل الدخول باسم ${n} (مستخدم اختبار)...`,
    totpHint: 'للتطوير فقط: الرمز الحالي لمستخدم العمليات التجريبي.', totpFill: 'املأ الرمز الحالي وتحقق', totpSeed: 'مفتاح التطوير', copy: 'نسخ المفتاح', copied: 'تم النسخ',
    totpReplay: 'إذا ظهر أن الرمز خاطئ فقد استُخدم رمز هذه الدقيقة بالفعل: انتظر الرمز التالي واضغط مرة أخرى.',
  },
} as const;

export const DEV_CSS = `
.dev{margin-top:22px;border:1px dashed var(--kx-coral-500,#E8735E);border-radius:var(--kx-radius-lg,14px);padding:14px 14px 10px;background:color-mix(in srgb,var(--kx-surface) 94%,var(--kx-coral-500,#E8735E))}
.dev h2{margin:0 0 4px;font-size:1rem;display:flex;align-items:center;gap:8px}.dev h2 .tag{font-size:.7rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--kx-coral-950,#261826);background:var(--kx-coral-500,#E8735E);border-radius:999px;padding:1px 8px}
.dev p{font-size:.8125rem;margin:0 0 10px;text-align:start}.dev h3{font-size:.8125rem;margin:12px 0 6px;color:var(--kx-text-muted)}
.dev ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.dev button.chip{margin:0;min-height:48px;display:flex;flex-direction:column;align-items:flex-start;gap:0;text-align:start;padding:8px 12px;background:var(--kx-surface);color:var(--kx-text);border:1px solid var(--kx-border-strong);font-weight:500;width:100%}
.dev button.chip:hover{background:var(--kx-primary-soft);filter:none}.dev button.chip small{font-weight:400;color:var(--kx-text-muted);direction:ltr;unicode-bidi:plaintext}
.dev button.chip .nm{unicode-bidi:plaintext}.dev .seed{direction:ltr;word-break:break-all}
.dev button.plain{margin-top:8px}`;

export function devPanel(lang: Lang, users: DevUser[]): string {
  const x = L[lang];
  const order: DevGroup[] = ['patients', 'providers', 'nurse', 'ops'];
  const groups = order.map((g) => {
    const list = users.filter((u) => u.group === g);
    if (!list.length) return '';
    return `<h3>${esc(x.groups[g])}</h3><ul>${list.map((u) => `<li><button type="button" class="chip" data-dev-phone="${esc(u.phone)}"><span class="nm">${esc(u.name)}</span><small>${esc(u.role)}</small><small>${esc(u.phone)}</small></button></li>`).join('')}</ul>`;
  }).join('');
  return `<section class="dev" data-dev-test-users aria-labelledby="dev-h"><h2 id="dev-h"><span class="tag">DEV</span>${esc(x.title)}</h2><p>${esc(x.hint)}</p>${groups}</section>
<script>document.querySelectorAll('[data-dev-phone]').forEach(function(b){b.addEventListener('click',function(){var f=document.getElementById('phone').form;document.getElementById('phone').value=b.getAttribute('data-dev-phone');var h=document.createElement('input');h.type='hidden';h.name='dev_auto';h.value='1';f.appendChild(h);f.submit();});});</script>`;
}

/** Code page helper: the fixed dev OTP, one click. `auto` submits at once (arrived through a quick-pick). */
export function devCodePanel(lang: Lang, o: { auto: boolean; name?: string; uid: string }): string {
  const x = L[lang];
  const script = `(function(){var c=document.getElementById('code');var f=c.form;function go(){c.value=${JSON.stringify(DEV_OTP)};var h=document.createElement('input');h.type='hidden';h.name='dev_auto';h.value='1';f.appendChild(h);f.submit();}document.getElementById('dev-fill').addEventListener('click',go);${o.auto ? 'go();' : ''}})();`;
  return `<section class="dev" data-dev-test-users aria-live="polite"><h2><span class="tag">DEV</span>${esc(x.title)}</h2>${o.auto && o.name ? `<p role="status">${esc(x.signingAs(o.name))}</p>` : ''}<p>${esc(x.codeHint)}</p><button type="button" class="secondary plain" id="dev-fill">${esc(x.codeFill)}</button></section><script>${script}</script>`;
}

export function devTotpPanel(lang: Lang, o: { code: string; secret: string }): string {
  const x = L[lang];
  const script = `(function(){var t=document.getElementById('totp');var f=t.form;document.getElementById('dev-fill').addEventListener('click',function(){t.value=${JSON.stringify(o.code)};var h=document.createElement('input');h.type='hidden';h.name='dev_auto';h.value='1';f.appendChild(h);f.submit();});var cp=document.getElementById('dev-copy');cp.addEventListener('click',function(){var s=document.getElementById('dev-seed').textContent;(navigator.clipboard?navigator.clipboard.writeText(s):Promise.reject()).catch(function(){}).then(function(){cp.textContent=${JSON.stringify(x.copied)};});});})();`;
  return `<section class="dev" data-dev-test-users><h2><span class="tag">DEV</span>${esc(x.title)}</h2><p>${esc(x.totpHint)} <code id="dev-code">${esc(o.code)}</code></p>
<p>${esc(x.totpSeed)}: <bdi class="seed" dir="ltr"><code id="dev-seed">${esc(o.secret)}</code></bdi></p><p class="hint">${esc(x.totpReplay)}</p>
<button type="button" class="secondary plain" id="dev-fill">${esc(x.totpFill)}</button><button type="button" class="secondary plain" id="dev-copy">${esc(x.copy)}</button></section><script>${script}</script>`;
}

/** Arrived with an OIDC `login_hint` that is a seeded dev phone (patient app quick-pick): submit the phone form once. */
export function devAutoPhoneScript(uid: string): string {
  return `<script>(function(){var k='kxdev-'+${JSON.stringify(uid)};try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,'1');}catch(e){return;}var p=document.getElementById('phone');if(!p||!p.value)return;var f=p.form;var h=document.createElement('input');h.type='hidden';h.name='dev_auto';h.value='1';f.appendChild(h);f.submit();})();</script>`;
}
