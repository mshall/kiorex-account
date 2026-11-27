/**
 * All visible copy of the Kiorly site, Arabic and English side by side. Functional DRAFT wording: it needs a native-Arabic and brand review
 * (Docs/NEEDS_HUMAN.md). It makes no price, fee, legal, certification or performance claim; every statement describes something the products do.
 */
import type { L10n } from './config';

export interface Feature { title: string; text: string }
export interface ProductCopy { slug: 'clinics' | 'pharmacies' | 'labs'; kind: 'clinic' | 'pharmacy' | 'lab'; name: string; title: string; lead: string; forWho: string; features: Feature[]; extra?: { title: string; text: string } }

const t = <T,>(ar: T, en: T): L10n<T> => ({ ar, en });

export const BRAND = t('كيورلي', 'Kiorly');

export const NAV = {
  clinics: t('العيادات', 'Clinics'), pharmacies: t('الصيدليات', 'Pharmacies'), labs: t('المعامل', 'Labs'),
  how: t('كيف يعمل', 'How it works'), plans: t('الباقات', 'Plans'), onboarding: t('طلب الانضمام', 'Request onboarding'),
  signIn: t('تسجيل الدخول', 'Sign in'), menu: t('القائمة', 'Menu'), skip: t('انتقل إلى المحتوى', 'Skip to content'), language: t('English', 'العربية'), languageName: t('الإنجليزية', 'Arabic'),
  primary: t('التنقل الرئيسي', 'Main navigation'),
};

export const PRODUCTS: Record<ProductCopy['slug'], L10n<ProductCopy>> = {
  clinics: {
    ar: { slug: 'clinics', kind: 'clinic', name: 'كيورلي كلينيك', title: 'كيورلي كلينيك للعيادات', lead: 'نظام لإدارة العيادة اليومية: المواعيد وملفات المرضى والفواتير وفريق العمل في مكان واحد.', forWho: 'للعيادات والأطباء ومقدمي الرعاية المنزلية.',
      features: [
        { title: 'مواعيد واضحة', text: 'جدول يومي للأطباء والغرف مع تأكيد المواعيد وتذكير المرضى.' },
        { title: 'ملف لكل مريض', text: 'زيارات وملاحظات وتاريخ المريض متاحة لفريق العيادة حسب صلاحياته.' },
        { title: 'فواتير ومدفوعات', text: 'تسجيل المدفوعات وإصدار الفواتير وتصدير البيانات لمحاسب العيادة.' },
        { title: 'فريق بصلاحيات', text: 'أدوار مختلفة للطبيب والاستقبال والإدارة، بحساب كيورلي واحد.' },
        { title: 'إصدار نيرس', text: 'إصدار مخصص للتمريض والعلاج الطبيعي والزيارات المنزلية داخل المنتج نفسه.' },
      ],
      extra: { title: 'اختياري: الظهور على كيوريكس', text: 'يمكن للعيادة أن تعرض مواعيدها المتاحة للمرضى على سوق كيوريكس. تبقى العيادة هي المرجع الوحيد لمواعيدها، وتعمل بدون كيوريكس أيضًا.' } },
    en: { slug: 'clinics', kind: 'clinic', name: 'Kiorly Clinic', title: 'Kiorly Clinic for clinics', lead: 'Run the day of a clinic in one place: appointments, patient records, invoices and your team.', forWho: 'For clinics, doctors and home-care providers.',
      features: [
        { title: 'Clear appointments', text: 'A daily schedule for doctors and rooms, with confirmations and patient reminders.' },
        { title: 'One record per patient', text: 'Visits, notes and history, available to the clinic team according to their role.' },
        { title: 'Invoices and payments', text: 'Track payments, keep invoice records and export data for the clinic accountant.' },
        { title: 'A team with roles', text: 'Different access for doctors, front desk and management, with one Kiorly sign-in.' },
        { title: 'Nurse edition', text: 'An edition for nursing, physiotherapy and home visits inside the same product.' },
      ],
      extra: { title: 'Optional: be bookable on Kiorex', text: 'A clinic can offer its open slots to patients on the Kiorex marketplace. The clinic stays the single source of truth for its appointments, and works without Kiorex too.' } },
  },
  pharmacies: {
    ar: { slug: 'pharmacies', kind: 'pharmacy', name: 'كيورلي فارماسي', title: 'كيورلي فارماسي للصيدليات', lead: 'استقبال الطلبات ومتابعتها وتنظيم عمل الفريق في الصيدلية.', forWho: 'للصيدليات المستقلة وسلاسل الصيدليات.',
      features: [
        { title: 'طلبات منظمة', text: 'استقبال طلبات المرضى ومتابعة حالة كل طلب حتى التسليم.' },
        { title: 'فريق بصلاحيات', text: 'حسابات للصيادلة والموظفين بأدوار مختلفة وحساب كيورلي واحد.' },
        { title: 'تطبيق كيورلي للموظفين', text: 'متابعة الطلبات من الهاتف عبر تطبيق كيورلي.' },
        { title: 'تصدير للمحاسب', text: 'تصدير بيانات الطلبات لتسلّمها لمحاسب الصيدلية.' },
      ] },
    en: { slug: 'pharmacies', kind: 'pharmacy', name: 'Kiorly Pharmacy', title: 'Kiorly Pharmacy for pharmacies', lead: 'Receive and follow orders and organise the pharmacy team.', forWho: 'For independent pharmacies and pharmacy groups.',
      features: [
        { title: 'Orders in order', text: 'Receive patient orders and follow the status of each one through to hand-over.' },
        { title: 'A team with roles', text: 'Accounts for pharmacists and staff with different access, under one Kiorly sign-in.' },
        { title: 'The Kiorly staff app', text: 'Follow orders from your phone in the Kiorly app.' },
        { title: 'Export for the accountant', text: 'Export order data to hand to the pharmacy accountant.' },
      ] },
  },
  labs: {
    ar: { slug: 'labs', kind: 'lab', name: 'كيورلي لاب', title: 'كيورلي لاب للمعامل', lead: 'استقبال طلبات التحاليل ومتابعتها وتنظيم عمل فريق المعمل.', forWho: 'للمعامل الطبية ومراكز الأشعة والتحاليل.',
      features: [
        { title: 'طلبات تحاليل منظمة', text: 'استقبال الطلبات ومتابعة حالة كل طلب من الاستلام إلى النتيجة.' },
        { title: 'فريق بصلاحيات', text: 'حسابات للفنيين والاستقبال والإدارة بأدوار مختلفة وحساب كيورلي واحد.' },
        { title: 'تطبيق كيورلي للموظفين', text: 'متابعة الطلبات من الهاتف عبر تطبيق كيورلي.' },
        { title: 'تصدير للمحاسب', text: 'تصدير بيانات الطلبات لتسلّمها لمحاسب المعمل.' },
      ] },
    en: { slug: 'labs', kind: 'lab', name: 'Kiorly Lab', title: 'Kiorly Lab for laboratories', lead: 'Receive and follow test orders and organise the lab team.', forWho: 'For medical laboratories and diagnostic centres.',
      features: [
        { title: 'Test orders in order', text: 'Receive orders and follow each one from receipt to result.' },
        { title: 'A team with roles', text: 'Accounts for technicians, front desk and management with different access, under one Kiorly sign-in.' },
        { title: 'The Kiorly staff app', text: 'Follow orders from your phone in the Kiorly app.' },
        { title: 'Export for the accountant', text: 'Export order data to hand to the lab accountant.' },
      ] },
  },
};

export const HOME = {
  title: t('كيورلي: برنامج للعيادات والصيدليات والمعامل', 'Kiorly: software for clinics, pharmacies and labs'),
  description: t('كيورلي منتجات لإدارة العيادات والصيدليات والمعامل بحساب واحد، بالعربية والإنجليزية.', 'Kiorly is software for clinics, pharmacies and laboratories, with one account, in Arabic and English.'),
  h1: t('أدِر عيادتك أو صيدليتك أو معملك من مكان واحد', 'Run your clinic, pharmacy or lab from one place'),
  lead: t('كيورلي مجموعة منتجات لمقدمي الرعاية الصحية: حساب واحد وفريق بصلاحيات وتطبيق للموظفين، بالعربية والإنجليزية.', 'Kiorly is a set of products for healthcare providers: one account, a team with roles and a staff app, in Arabic and English.'),
  productsTitle: t('منتجات كيورلي', 'Kiorly products'),
  learnMore: t('اعرف المزيد', 'Learn more'),
  oneAccountTitle: t('حساب واحد لكل المنتجات', 'One account for every product'),
  oneAccountText: t('تسجّل الدخول مرة واحدة من كيورلي هوم، ثم تختار مساحة العمل: العيادة أو الصيدلية أو المعمل.', 'Sign in once at Kiorly Home, then pick your workspace: clinic, pharmacy or lab.'),
  bilingualTitle: t('بالعربية والإنجليزية', 'In Arabic and English'),
  bilingualText: t('كل شاشة متاحة بالعربية من اليمين إلى اليسار وبالإنجليزية.', 'Every screen is available in Arabic, right to left, and in English.'),
  teamTitle: t('فريق بصلاحيات', 'A team with roles'),
  teamText: t('كل عضو في الفريق يرى ما يخص دوره فقط.', 'Each team member sees only what their role needs.'),
  ctaTitle: t('جاهز للبدء؟', 'Ready to start?'),
  ctaText: t('أرسل طلب الانضمام وسيتواصل معك فريق كيورلي.', 'Send an onboarding request and the Kiorly team will get in touch.'),
};

export const HOW = {
  title: t('كيف يعمل كيورلي', 'How Kiorly works'), description: t('من طلب الانضمام إلى أول يوم عمل على كيورلي.', 'From the onboarding request to your first working day on Kiorly.'),
  lead: t('أربع خطوات من الطلب إلى التشغيل.', 'Four steps from request to go-live.'),
  steps: t(
    [
      { title: 'أرسل طلب الانضمام', text: 'اختر نوع منشأتك واترك بيانات التواصل.' },
      { title: 'نراجع الطلب ونتواصل معك', text: 'يتواصل معك فريق كيورلي لفهم احتياج المنشأة وتجهيز الحساب.' },
      { title: 'ننشئ مساحة العمل ونضيف الفريق', text: 'تُنشأ المنشأة ويُدعى أعضاء الفريق بأدوارهم، ويدخل كل منهم بحساب كيورلي.' },
      { title: 'ابدأ العمل', text: 'استخدم المنتج من المتصفح أو من تطبيق كيورلي للموظفين.' },
    ],
    [
      { title: 'Send an onboarding request', text: 'Choose your type of business and leave your contact details.' },
      { title: 'We review and get in touch', text: 'The Kiorly team contacts you to understand what your business needs and prepare the account.' },
      { title: 'We set up the workspace and your team', text: 'Your organisation is created and team members are invited with their roles; each signs in with a Kiorly account.' },
      { title: 'Start working', text: 'Use the product in the browser or in the Kiorly staff app.' },
    ]),
  accountTitle: t('حساب كيورلي', 'Your Kiorly account'), accountText: t('الدخول يتم عبر كيورلي هوم بحساب كيوريكس باسبورت. لا حاجة لكلمة مرور منفصلة لكل منتج.', 'You sign in at Kiorly Home with a Kiorex Passport account. There is no separate password for each product.'),
};

export const PLANS = {
  title: t('الباقات', 'Plans'), description: t('باقات كيورلي للعيادات والصيدليات والمعامل.', 'Kiorly plans for clinics, pharmacies and laboratories.'),
  lead: t('تعرض هذه الصفحة الباقات كما يضبطها فريق كيورلي.', 'This page lists the plans as the Kiorly team sets them up.'),
  pricingNote: t('الأسعار تُحدَّد من لوحة عمليات كيورلي ولا تُنشر في هذه الصفحة.', 'Pricing is set in Kiorly Ops and is not published on this page.'),
  emptyTitle: t('الباقات قيد الإعداد', 'Plans are being set up'),
  emptyText: t('لم تُنشر باقات بعد. أرسل طلب الانضمام وسنشرح لك المتاح لمنشأتك.', 'No plans are listed yet. Send an onboarding request and we will explain what is available for your business.'),
  includes: t('تشمل', 'Includes'),
};

export const ONBOARDING = {
  title: t('طلب الانضمام', 'Request onboarding'), description: t('أرسل بيانات منشأتك لينضم فريقك إلى كيورلي.', 'Send your business details so your team can join Kiorly.'),
  lead: t('اترك بياناتك وسيتواصل معك فريق كيورلي.', 'Leave your details and the Kiorly team will get in touch.'),
  kind: t('نوع المنشأة', 'Type of business'), kindChoose: t('اختر', 'Choose'),
  kinds: t({ clinic: 'عيادة', pharmacy: 'صيدلية', lab: 'معمل' }, { clinic: 'Clinic', pharmacy: 'Pharmacy', lab: 'Lab' }),
  organisation: t('اسم المنشأة', 'Business name'), contactName: t('اسم المسؤول عن التواصل', 'Contact person'), phone: t('رقم الهاتف', 'Phone number'),
  phoneHint: t('مع رمز الدولة، مثل 201000000000+', 'With the country code, for example +201000000000'), email: t('البريد الإلكتروني (اختياري)', 'E-mail (optional)'), city: t('المدينة (اختياري)', 'City (optional)'),
  message: t('رسالة (اختياري)', 'Message (optional)'),
  consent: t('أوافق على أن يستخدم فريق كيورلي البيانات التي أرسلتها للتواصل معي بخصوص طلب الانضمام.', 'I agree that the Kiorly team may use the details I submitted to contact me about this onboarding request.'),
  consentDraft: t('صياغة مبدئية بانتظار المراجعة القانونية', 'Draft wording, pending legal review'),
  submit: t('إرسال الطلب', 'Send request'),
  required: t('هذا الحقل مطلوب.', 'This field is required.'), invalid: t('القيمة غير صحيحة.', 'This value is not valid.'),
  sending: t('جارٍ الإرسال...', 'Sending...'), sent: t('تم إرسال طلبك. سنتواصل معك.', 'Your request was sent. We will be in touch.'),
  mockSent: t('وضع تجريبي: لم يُرسل الطلب إلى أي جهة.', 'Test mode: nothing was sent anywhere.'), failed: t('تعذّر إرسال الطلب. حاول مرة أخرى بعد قليل.', 'The request could not be sent. Please try again shortly.'),
  mockBanner: t('وضع تجريبي: هذا النموذج لا يرسل البيانات.', 'Test mode: this form does not send your details.'),
  noscript: t('يحتاج هذا النموذج إلى تفعيل جافاسكربت.', 'This form needs JavaScript to be enabled.'),
};

export const COMMON = {
  previewBanner: t('نسخة تجريبية: الصياغة قيد المراجعة.', 'Preview build: copy under review.'),
  footerLine: t('منتجات كيورلي: كيورلي كلينيك وكيورلي فارماسي وكيورلي لاب، من كيوريكس.', 'Kiorly Clinic, Kiorly Pharmacy and Kiorly Lab, by Kiorex.'),
  contact: t('تواصل', 'Contact'), products: t('المنتجات', 'Products'), company: t('كيورلي', 'Kiorly'),
  notFoundTitle: t('الصفحة غير موجودة', 'Page not found'), notFoundText: t('هذه الصفحة غير موجودة.', 'This page does not exist.'), backHome: t('العودة إلى الرئيسية', 'Back to the home page'),
  chooser: t('اختر اللغة', 'Choose your language'),
};
