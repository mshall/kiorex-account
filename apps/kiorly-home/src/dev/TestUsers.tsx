import { useT } from '../i18n';
import { PRODUCTS, needsOrg, type CardKey } from '../core';
import { PASSPORT_PERSONAS, PASSWORD_PERSONAS, type PasswordPersona } from './personas';

const L = {
  en: { title: 'Test users (dev only)', hint: 'Local development only. Synthetic data.', passport: 'Kiorex Passport (phone, dev code 000000)', passportHint: 'Click a user to start the Passport sign-in with the phone filled in.', password: (p: string) => `${p}: password logins`, passwordHint: 'Click a user to fill the form; then press Sign in.', labHint: 'Lab has no passwords: organisation + e-mail.' },
  ar: { title: 'مستخدمو الاختبار (للتطوير فقط)', hint: 'للتطوير المحلي فقط. بيانات تجريبية.', passport: 'كيوريكس باسبورت (الهاتف، رمز التطوير 000000)', passportHint: 'اضغط على مستخدم لبدء الدخول عبر باسبورت بالهاتف مملوءًا.', password: (p: string) => `${p}: حسابات كلمة المرور`, passwordHint: 'اضغط على مستخدم لملء النموذج ثم اضغط دخول.', labHint: 'المعمل بلا كلمات مرور: المؤسسة والبريد.' },
} as const;

/**
 * DEV ONLY quick-pick, same idea as the Passport and product sign-in screens. Two groups: Passport personas (start the Passport sign-in with
 * login_hint) and the password personas of the CHOSEN tile (fill the form, like the product login pages). Imported dynamically behind
 * `import.meta.env.DEV` in App.tsx, so production bundles contain neither this file nor these logins (scripts/check-no-dev-test-users.mjs).
 */
export default function TestUsers({ tile, onPassport, onFill }: { tile: CardKey; onPassport: (phone: string, tile: CardKey) => void; onFill: (p: PasswordPersona) => void }) {
  const { lang, t: tt } = useT(); const t = L[lang];
  const list = PASSWORD_PERSONAS[tile];
  const groups = [...new Set(list.map((u) => u.group))];
  return (
    <section className="dev" data-dev-test-users aria-labelledby="dev-h">
      <h2 id="dev-h"><span className="tag">DEV</span> {t.title}</h2>
      <p>{t.hint}</p>
      <h3>{t.passport}</h3>
      <p className="dim">{t.passportHint}</p>
      <ul>
        {PASSPORT_PERSONAS.map((u) => (
          <li key={u.phone}><button type="button" className="chip" data-phone={u.phone} onClick={() => onPassport(u.phone, u.tile)}><span className="nm">{u.name}</span><small>{u.phone}</small><small>{u.what}</small></button></li>
        ))}
      </ul>
      <h3>{t.password(tt.tile[tile])} ({list.length})</h3>
      <p className="dim">{needsOrg(tile) ? t.labHint : t.passwordHint}</p>
      {groups.map((g) => (
        <div key={g}>
          <h4>{g}</h4>
          <ul>
            {list.filter((u) => u.group === g).map((u) => (
              <li key={`${u.org}|${u.email}`}><button type="button" className="chip" data-persona={`${PRODUCTS[tile].edition ?? tile}`} data-email={u.email} data-org={u.org || undefined} onClick={() => onFill(u)}><span className="nm">{u.name}</span><small>{u.email}</small><small>{u.role}</small></button></li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
