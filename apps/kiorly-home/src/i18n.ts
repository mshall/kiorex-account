import { createContext, useContext } from 'react';

export type Lang = 'ar' | 'en';
const en = {
  appName: 'Kiorly', skip: 'Skip to content', language: 'العربية', theme: 'Theme', themeLight: 'Light', themeDark: 'Dark', themeAuto: 'Auto',
  signInTitle: 'Sign in to Kiorly', signInLede: 'One sign-in for Kiorly Clinic, Nurse, Pharmacy and Lab. You use Kiorex Passport: a code to your phone, or a passkey.',
  signInBtn: 'Sign in with Kiorex Passport', signInNote: 'After you sign in we show the workspaces you belong to. Each product stays a separate app.',
  patientNote: 'Looking for patient booking? That stays on Kiorex.', patientLink: 'Go to Kiorex',
  callbackWorking: 'Signing you in...', callbackFailed: 'We could not complete the sign-in.', tryAgain: 'Try again',
  loading: 'Loading your workspaces...', loadFailed: 'We could not load your workspaces.',
  pickerTitle: 'Choose a workspace', pickerLede: 'Pick where you want to work. You can switch at any time.', lastUsed: 'Last used', open: 'Open',
  editionOf: 'Edition of Kiorly Clinic', orgs: (n: number) => (n === 1 ? '1 organisation' : `${n} organisations`), asRole: (r: string) => `as ${r}`,
  opening: (p: string) => `Opening ${p}...`, openingFallback: 'Nothing happened?', openNow: 'Open now',
  emptyTitle: 'You do not have a workspace yet', emptyLede: 'Create your own, or join one that invited you. Each link opens that product\'s own sign-up.',
  createOrJoin: 'Create or join', joinHint: 'Invited to a team? Open the invitation we sent you, then come back here.',
  missingTitle: (p: string) => `No ${p} workspace on this account`, missingLede: 'You are signed in, but this account is not part of that product yet.', chooseOther: 'Choose another workspace',
  signedInAs: (n: string) => `Signed in as ${n}`, signOut: 'Sign out', signingOut: 'Signing you out...',
  product: { clinic: 'Kiorly Clinic by Kiorex', nurse: 'Kiorly Nurse by Kiorex', pharmacy: 'Kiorly Pharmacy by Kiorex', lab: 'Kiorly Lab by Kiorex' },
  short: { clinic: 'Kiorly Clinic', nurse: 'Kiorly Nurse', pharmacy: 'Kiorly Pharmacy', lab: 'Kiorly Lab' },
  blurb: { clinic: 'Appointments, records, billing and your team.', nurse: 'Home visits, routes and care plans for nurses and agencies.', pharmacy: 'Dispensing, inventory and prescriptions.', lab: 'Orders, results and quality control.' },
};
const ar: typeof en = {
  appName: 'كيورلي', skip: 'تخطي إلى المحتوى', language: 'English', theme: 'المظهر', themeLight: 'فاتح', themeDark: 'داكن', themeAuto: 'تلقائي',
  signInTitle: 'تسجيل الدخول إلى كيورلي', signInLede: 'تسجيل دخول واحد لكيورلي للعيادات والتمريض والصيدليات والمعامل. تستخدم كيوريكس باسبورت: رمز على هاتفك أو مفتاح مرور.',
  signInBtn: 'تسجيل الدخول بكيوريكس باسبورت', signInNote: 'بعد تسجيل الدخول نعرض لك مساحات العمل التي تنتمي إليها. كل منتج يظل تطبيقًا منفصلًا.',
  patientNote: 'تبحث عن حجز المرضى؟ هذا يبقى على كيوريكس.', patientLink: 'الذهاب إلى كيوريكس',
  callbackWorking: 'جارٍ تسجيل دخولك...', callbackFailed: 'تعذّر إكمال تسجيل الدخول.', tryAgain: 'حاول مرة أخرى',
  loading: 'جارٍ تحميل مساحات عملك...', loadFailed: 'تعذّر تحميل مساحات عملك.',
  pickerTitle: 'اختر مساحة العمل', pickerLede: 'اختر أين تريد العمل. يمكنك التبديل في أي وقت.', lastUsed: 'آخر استخدام', open: 'فتح',
  editionOf: 'نسخة من كيورلي للعيادات', orgs: (n: number) => (n === 1 ? 'منظمة واحدة' : `${n} منظمات`), asRole: (r: string) => `بصفة ${r}`,
  opening: (p: string) => `جارٍ فتح ${p}...`, openingFallback: 'لم يحدث شيء؟', openNow: 'افتح الآن',
  emptyTitle: 'ليست لديك مساحة عمل بعد', emptyLede: 'أنشئ مساحتك، أو انضم إلى مساحة دعتك إليها. كل رابط يفتح صفحة التسجيل الخاصة بالمنتج.',
  createOrJoin: 'إنشاء أو انضمام', joinHint: 'تمت دعوتك إلى فريق؟ افتح الدعوة التي وصلتك ثم عد إلى هنا.',
  missingTitle: (p: string) => `لا توجد مساحة ${p} في هذا الحساب`, missingLede: 'تم تسجيل دخولك، لكن هذا الحساب ليس ضمن ذلك المنتج بعد.', chooseOther: 'اختر مساحة أخرى',
  signedInAs: (n: string) => `مسجّل الدخول باسم ${n}`, signOut: 'تسجيل الخروج', signingOut: 'جارٍ تسجيل خروجك...',
  product: { clinic: 'كيورلي للعيادات من كيوريكس', nurse: 'كيورلي للتمريض من كيوريكس', pharmacy: 'كيورلي للصيدليات من كيوريكس', lab: 'كيورلي لاب من كيوريكس' },
  short: { clinic: 'كيورلي للعيادات', nurse: 'كيورلي للتمريض', pharmacy: 'كيورلي للصيدليات', lab: 'كيورلي لاب' },
  blurb: { clinic: 'المواعيد والسجلات والفواتير وفريقك.', nurse: 'الزيارات المنزلية والمسارات وخطط الرعاية للممرضين والوكالات.', pharmacy: 'الصرف والمخزون والوصفات.', lab: 'الطلبات والنتائج وضبط الجودة.' },
};
export const DICT = { en, ar };
export type Dict = typeof en;
export const LangCtx = createContext<{ lang: Lang; t: Dict }>({ lang: 'en', t: en });
export const useT = () => useContext(LangCtx);
export const initialLang = (): Lang => { try { const s = localStorage.getItem('kh.lang'); if (s === 'ar' || s === 'en') return s; } catch { /* ignore */ } return typeof navigator !== 'undefined' && navigator.language?.startsWith('ar') ? 'ar' : 'en'; };
