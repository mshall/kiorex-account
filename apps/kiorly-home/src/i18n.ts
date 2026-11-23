import { createContext, useContext } from 'react';

export type Lang = 'ar' | 'en';
const en = {
  appName: 'Kiorly', skip: 'Skip to content', language: 'العربية', theme: 'Theme', themeLight: 'Light', themeDark: 'Dark', themeAuto: 'System',
  tagline: 'One sign-in for Clinic, Nurse, Pharmacy and Lab', langToggle: 'Language',
  signInTitle: 'Sign in', signInLede: 'Choose your workplace product', switchNote: 'Switching workspace: choose the product you want to open.',
  nurseHint: 'Nurses, aides and dispatchers sign in with their Kiorly Clinic account; you land on today\'s home visits.',
  method: 'Sign-in method', methodPassport: 'Kiorex Passport', methodPassword: 'Password',
  signInBtn: 'Sign in with Kiorex Passport', passportHint: 'Uses your verified phone number. Your owner links it to your staff account.',
  email: 'Email', password: 'Password', org: 'Lab organisation', orgHint: 'e.g. demo-lab', submit: 'Sign in', submitting: 'Signing in...',
  invalid: 'Wrong email or password', invalidLab: 'Unknown organisation or email', rateLimited: 'Too many attempts. Wait a minute and try again.', network: 'Cannot reach the server. Check your connection.',
  notAllowed: 'This sign-in is not available from here. Use the product\'s own login.', passwordDisabled: (p: string) => `${p} signs in with Kiorex Passport only. Use the Passport button.`, serverError: 'Something went wrong. Try again.',
  patientNote: 'Looking for patient booking? That stays on Kiorex.', patientLink: 'Go to Kiorex', newHere: 'New to this product?', createWorkspace: (p: string) => `Create a ${p} workspace`,
  callbackWorking: 'Signing you in...', callbackFailed: 'We could not complete the sign-in.', tryAgain: 'Try again',
  hintTitle: (p: string) => `Your account has a ${p} workspace`, hintLede: (chosen: string, p: string) => `You chose ${chosen}, but this account belongs to ${p}. You can open either.`, hintOpen: (p: string) => `Open ${p}`, hintContinue: (p: string) => `Continue to ${p}`,
  editionOf: 'Edition of Kiorly Clinic',
  opening: (p: string) => `Opening ${p}...`, openingFallback: 'Nothing happened?', openNow: 'Open now',
  signedInAs: (n: string) => `Signed in as ${n}`, signOut: 'Sign out', signingOut: 'Signing you out...',
  product: { clinic: 'Kiorly Clinic by Kiorex', nurse: 'Kiorly Nurse by Kiorex', pharmacy: 'Kiorly Pharmacy by Kiorex', lab: 'Kiorly Lab by Kiorex' },
  short: { clinic: 'Kiorly Clinic', nurse: 'Kiorly Nurse', pharmacy: 'Kiorly Pharmacy', lab: 'Kiorly Lab' },
  tile: { clinic: 'Clinic', nurse: 'Nurse', pharmacy: 'Pharmacy', lab: 'Lab' },
  paneHeadline: 'One sign-in for your whole workplace', paneSub: 'Open the product your team works in, with a single secure account.',
  hl: { clinic: 'Appointments, records and billing', nurse: 'Home visits and field care', pharmacy: 'Dispensing, stock and sales', lab: 'Orders, results and reports' },
  paneTrust: 'Secure sign-in with Kiorex Passport', byKiorex: 'by Kiorex',
};
const ar: typeof en = {
  appName: 'كيورلي', skip: 'تخطي إلى المحتوى', language: 'English', theme: 'المظهر', themeLight: 'فاتح', themeDark: 'داكن', themeAuto: 'النظام',
  tagline: 'تسجيل دخول واحد للعيادة والتمريض والصيدلية والمعمل', langToggle: 'اللغة',
  signInTitle: 'تسجيل الدخول', signInLede: 'اختر منتج مكان عملك', switchNote: 'تبديل مساحة العمل: اختر المنتج الذي تريد فتحه.',
  nurseHint: 'يسجّل الممرضون والمساعدون والمنسّقون الدخول بحساب كيورلي كلينك، وتصل مباشرةً إلى زيارات اليوم المنزلية.',
  method: 'طريقة الدخول', methodPassport: 'كيوريكس باسبورت', methodPassword: 'كلمة المرور',
  signInBtn: 'الدخول عبر كيوريكس باسبورت', passportHint: 'يستخدم رقم هاتفك الموثّق. يربطه المالك بحساب الموظف الخاص بك.',
  email: 'البريد الإلكتروني', password: 'كلمة المرور', org: 'مؤسسة المعمل', orgHint: 'مثال: demo-lab', submit: 'دخول', submitting: 'جارٍ الدخول...',
  invalid: 'البريد أو كلمة المرور غير صحيحة', invalidLab: 'مؤسسة أو بريد غير معروف', rateLimited: 'محاولات كثيرة. انتظر دقيقة ثم حاول مرة أخرى.', network: 'تعذّر الوصول إلى الخادم. تحقق من الاتصال.',
  notAllowed: 'هذا الدخول غير متاح من هنا. استخدم صفحة دخول المنتج نفسه.', passwordDisabled: (p: string) => `${p} يعمل بالدخول عبر كيوريكس باسبورت فقط. استخدم زر باسبورت.`, serverError: 'حدث خطأ ما. حاول مرة أخرى.',
  patientNote: 'تبحث عن حجز المرضى؟ هذا يبقى على كيوريكس.', patientLink: 'الذهاب إلى كيوريكس', newHere: 'جديد على هذا المنتج؟', createWorkspace: (p: string) => `إنشاء مساحة عمل ${p}`,
  callbackWorking: 'جارٍ تسجيل دخولك...', callbackFailed: 'تعذّر إكمال تسجيل الدخول.', tryAgain: 'حاول مرة أخرى',
  hintTitle: (p: string) => `حسابك لديه مساحة عمل ${p}`, hintLede: (chosen: string, p: string) => `اخترت ${chosen}، لكن هذا الحساب ينتمي إلى ${p}. يمكنك فتح أيٍّ منهما.`, hintOpen: (p: string) => `فتح ${p}`, hintContinue: (p: string) => `المتابعة إلى ${p}`,
  editionOf: 'نسخة من كيورلي للعيادات',
  opening: (p: string) => `جارٍ فتح ${p}...`, openingFallback: 'لم يحدث شيء؟', openNow: 'افتح الآن',
  signedInAs: (n: string) => `مسجّل الدخول باسم ${n}`, signOut: 'تسجيل الخروج', signingOut: 'جارٍ تسجيل خروجك...',
  product: { clinic: 'كيورلي للعيادات من كيوريكس', nurse: 'كيورلي للتمريض من كيوريكس', pharmacy: 'كيورلي للصيدليات من كيوريكس', lab: 'كيورلي لاب من كيوريكس' },
  short: { clinic: 'كيورلي للعيادات', nurse: 'كيورلي للتمريض', pharmacy: 'كيورلي للصيدليات', lab: 'كيورلي لاب' },
  tile: { clinic: 'العيادة', nurse: 'التمريض', pharmacy: 'الصيدلية', lab: 'المعمل' },
  paneHeadline: 'تسجيل دخول واحد لكل مكان عملك', paneSub: 'افتح المنتج الذي يعمل به فريقك بحساب واحد آمن.',
  hl: { clinic: 'المواعيد والملفات والفواتير', nurse: 'الزيارات المنزلية والرعاية الميدانية', pharmacy: 'الصرف والمخزون والمبيعات', lab: 'الطلبات والنتائج والتقارير' },
  paneTrust: 'تسجيل دخول آمن عبر كيوريكس باسبورت', byKiorex: 'من كيوريكس',
};
export const DICT = { en, ar };
export type Dict = typeof en;
export const LangCtx = createContext<{ lang: Lang; t: Dict }>({ lang: 'en', t: en });
export const useT = () => useContext(LangCtx);
export const initialLang = (): Lang => { try { const s = localStorage.getItem('kh.lang'); if (s === 'ar' || s === 'en') return s; } catch { /* ignore */ } return typeof navigator !== 'undefined' && navigator.language?.startsWith('ar') ? 'ar' : 'en'; };
