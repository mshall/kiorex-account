import { useT } from '../i18n';

const L = {
  en: { title: 'Test users (dev only)', hint: 'Local development only. Click a user to start the sign-in with the phone filled in; the dev code is 000000. Synthetic data.', g: { one: 'One workspace (goes straight in)', many: 'Several workspaces (picker)', none: 'No workspace (Create or join)', nurse: 'Nurse edition' } },
  ar: { title: 'مستخدمو الاختبار (للتطوير فقط)', hint: 'للتطوير المحلي فقط. اضغط على مستخدم لبدء تسجيل الدخول بالهاتف مملوءًا؛ رمز التطوير 000000. بيانات تجريبية.', g: { one: 'مساحة عمل واحدة (دخول مباشر)', many: 'عدة مساحات (قائمة اختيار)', none: 'بدون مساحة (إنشاء أو انضمام)', nurse: 'نسخة التمريض' } },
} as const;

/**
 * DEV ONLY quick-pick (founder request 23 Nov 2026), same idea as the Passport sign-in screens: synthetic personas from TEST_DATA.md.
 * Imported dynamically behind `import.meta.env.DEV` in App.tsx, so production bundles contain neither this file nor these phones
 * (asserted by scripts/check-no-dev-test-users.mjs). Clicking a user starts the normal Passport sign-in with login_hint.
 */
export const DEV_USERS: Array<{ phone: string; name: string; group: 'one' | 'many' | 'none' | 'nurse'; what: string }> = [
  { phone: '+201000002001', name: 'Ahmed Fawzy', group: 'one', what: 'Clinic owner' },
  { phone: '+201000002004', name: 'Mostafa Reda', group: 'one', what: 'Pharmacist' },
  { phone: '+201000002005', name: 'دينا وجدي', group: 'one', what: 'Lab technician' },
  { phone: '+201000003001', name: 'Mona Adel', group: 'nurse', what: 'Solo nurse + agency (Nurse)' },
  { phone: '+201000002031', name: 'Demo Multi-Workspace Owner', group: 'many', what: 'Clinic + Pharmacy + Lab' },
  { phone: '+201000002032', name: 'Demo No-Workspace Newcomer', group: 'none', what: 'No organisation' },
];

export default function TestUsers({ onPick }: { onPick: (phone: string) => void }) {
  const { lang } = useT(); const t = L[lang];
  const groups = ['one', 'many', 'none', 'nurse'] as const;
  return (
    <section className="dev" data-dev-test-users aria-labelledby="dev-h">
      <h2 id="dev-h"><span className="tag">DEV</span> {t.title}</h2>
      <p>{t.hint}</p>
      {groups.map((g) => (
        <div key={g}>
          <h3>{t.g[g]}</h3>
          <ul>
            {DEV_USERS.filter((u) => u.group === g).map((u) => (
              <li key={u.phone}><button type="button" className="chip" data-phone={u.phone} onClick={() => onPick(u.phone)}><span className="nm">{u.name}</span><small>{u.phone}</small><small>{u.what}</small></button></li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
