/**
 * All visible copy of the Kiorly site, Arabic and English side by side. Functional DRAFT wording: it needs a native-Arabic and brand review (Docs/NEEDS_HUMAN.md).
 * It makes no price, fee, legal, certification, compliance or performance claim; every statement describes something the products do. Where a human decision is
 * required the text says so and carries the platform's marker TODO_NEEDS_HUMAN (shown as a visible note in preview builds only).
 */
import type { L10n } from './config';

const t = <T,>(ar: T, en: T): L10n<T> => ({ ar, en });
export const BRAND = t('كيورلي', 'Kiorly');

export const NAV = {
  products: t('المنتجات', 'Products'), connected: t('مع كيوريكس', 'With Kiorex'), workflows: t('كيف تعمل', 'Workflows'), security: t('الأمان', 'Security'), plans: t('الباقات', 'Plans'), faq: t('أسئلة شائعة', 'FAQ'),
  join: t('انضم إلينا', 'Join us'), signIn: t('تسجيل الدخول', 'Sign in'), menu: t('القائمة', 'Menu'), skip: t('انتقل إلى المحتوى', 'Skip to content'), language: t('English', 'العربية'), primary: t('التنقل الرئيسي', 'Main navigation'),
};

export const HERO = {
  title: t('كيورلي: كل ما يحتاجه مقدم الرعاية الصحية في مكان واحد', 'Kiorly: everything a care provider needs, in one place'),
  description: t('كيورلي للعيادات والصيدليات والمعامل والتمريض والمستشفيات والسلاسل. يعمل وحده، أو متصلا بسوق كيوريكس للمرضى. بالعربية والإنجليزية.', 'Kiorly for clinics, pharmacies, labs, nurses, hospitals and chains. Works on its own, or connected to the Kiorex patient marketplace. Arabic and English.'),
  eyebrow: t('منصة مقدمي الرعاية الصحية', 'The platform for care providers'),
  h1: t('أدِر عيادتك أو صيدليتك أو معملك بهدوء، وانضم إلى كيوريكس متى أردت', 'Run your clinic, pharmacy or lab calmly, and connect to Kiorex when you are ready'),
  lead: t('كيورلي نظام واحد لمواعيدك وملفاتك وطلباتك ونتائجك وفريقك. استخدمه بمفرده، أو اربطه بكيوريكس ليجدك المرضى ويحجزوا معك مباشرة.', 'Kiorly is one system for your appointments, records, orders, results and team. Use it on its own, or connect it to Kiorex so patients can find you and book you directly.'),
  cta: t('انضم إلينا', 'Join us'), ctaSecondary: t('شاهد كيف يعمل', 'See how it works'),
  points: t(['يعمل بالعربية والإنجليزية من اليمين إلى اليسار', 'يعمل وحده دون كيوريكس', 'أنت من يقرر الربط بكيوريكس'], ['Arabic and English, right to left and left to right', 'Works on its own, without Kiorex', 'You decide whether to connect to Kiorex']),
  alt: t('واجهة كيورلي كلينيك على الحاسوب وتطبيق كيورلي على الهاتف مع بطاقات حجز ونتيجة تحليل وطلب صيدلية', 'Kiorly Clinic on a laptop and the Kiorly app on a phone, with cards for a booking, a lab result and a pharmacy order'),
};

export interface ModuleCopy {
  id: 'clinic' | 'pharmacy' | 'lab' | 'nurse' | 'staff' | 'enterprise'; name: string; tag: string; pitch: string; benefits: string[]; standalone: string[]; connected: string[]; flow: string[]; mock: string;
}
export const MODULES_TITLE = t('منتجات كيورلي', 'The Kiorly products');
export const MODULES_LEAD = t('اختر ما يناسب عملك. كل منتج يعمل مستقلا، ويمكنك الجمع بينها بحساب كيورلي واحد.', 'Pick what fits your work. Every product works on its own, and they combine under one Kiorly account.');
export const MODULES: Record<ModuleCopy['id'], L10n<ModuleCopy>> = {
  clinic: {
    ar: { id: 'clinic', name: 'كيورلي كلينيك', tag: 'للعيادات', pitch: 'جدول المواعيد وملفات المرضى والفواتير وفريق العيادة في مكان واحد.', mock: 'واجهة جدول المواعيد في كيورلي كلينيك',
      benefits: ['جدول يومي وأسبوعي للأطباء والغرف مع تأكيد المواعيد وتذكير المرضى', 'قائمة انتظار تملأ المواعيد الفارغة عند الإلغاء', 'ملف لكل مريض: زيارات وملاحظات وتاريخ مرضي بصلاحيات حسب الدور', 'تسجيل المدفوعات وإصدار الفواتير وتصدير البيانات لمحاسب العيادة'],
      standalone: ['يحجز المرضى بالهاتف أو الاستقبال أو رابط الحجز الخاص بك', 'لا تحتاج إلى حساب كيوريكس', 'بياناتك داخل مساحة العمل الخاصة بعيادتك'],
      connected: ['تظهر العيادة المعتمدة في سوق كيوريكس ويحجز المرضى مواعيدك الحية', 'عربون الحجز عبر كيوريكس باي عند تفعيله', 'العمولة واضحة لك وللطرفين دون مفاجآت'],
      flow: ['المريض يحجز موعدا', 'الاستقبال يؤكد ويظهر الموعد في الجدول', 'الطبيب يفتح الملف ويسجل الزيارة', 'الفاتورة والمتابعة والتذكير التالي'] },
    en: { id: 'clinic', name: 'Kiorly Clinic', tag: 'For clinics', pitch: 'Your schedule, patient records, billing and clinic team in one place.', mock: 'The Kiorly Clinic schedule screen',
      benefits: ['Daily and weekly schedule for doctors and rooms, with confirmations and patient reminders', 'A waiting list that fills open slots when someone cancels', 'A file for every patient: visits, notes and history, with access by role', 'Record payments, issue invoices and export data for the clinic accountant'],
      standalone: ['Patients book by phone, at reception or through your own booking link', 'No Kiorex account needed', 'Your data stays inside your clinic workspace'],
      connected: ['A verified clinic is listed on the Kiorex marketplace and patients book your live slots', 'Booking deposits through Kiorex Pay when it is switched on', 'The commission is visible to you and to Kiorex, with no surprises'],
      flow: ['A patient books an appointment', 'Reception confirms and it appears on the schedule', 'The doctor opens the file and records the visit', 'Invoice, follow-up and the next reminder'] },
  },
  pharmacy: {
    ar: { id: 'pharmacy', name: 'كيورلي فارماسي', tag: 'للصيدليات', pitch: 'طلبات المرضى والمخزون والصرف والتوصيل بلا ورق.', mock: 'واجهة طلبات الصيدلية في كيورلي فارماسي',
      benefits: ['طابور طلبات واضح: جديد وجاهز وفي الطريق ومصروف', 'كتالوج وأسعار ومخزون تحدّثها بنفسك', 'التحقق من الوصفة الإلكترونية قبل الصرف', 'تسجيل الصرف الجزئي والرد الجزئي بوضوح'],
      standalone: ['تدير طلبات الهاتف والحضور والتوصيل التي تخصك', 'تتابع المخزون وتطبع الإيصالات', 'لا حاجة لأي ربط خارجي'],
      connected: ['تصلك طلبات مرضى كيوريكس بعد موافقة المريض', 'تحديثات الحالة تصل المريض تلقائيا: جاهز، في الطريق، تم الصرف', 'تسوية العمولة تظهر لك وللطرف الآخر'],
      flow: ['يصل طلب جديد', 'الصيدلي يراجع الوصفة والمخزون', 'يجهز الطلب ويحدّث الحالة', 'التوصيل أو التسليم وإقفال الطلب'] },
    en: { id: 'pharmacy', name: 'Kiorly Pharmacy', tag: 'For pharmacies', pitch: 'Patient orders, stock, dispensing and delivery without paper.', mock: 'The Kiorly Pharmacy orders screen',
      benefits: ['A clear order queue: new, ready, on the way, dispensed', 'A catalogue, prices and stock that you keep up to date yourself', 'Verify the e-prescription before dispensing', 'Partial dispensing and partial refunds recorded clearly'],
      standalone: ['Manage your own phone, walk-in and delivery orders', 'Track stock and print receipts', 'No outside connection required'],
      connected: ['Receive orders from Kiorex patients, with the patient\'s consent', 'Status updates reach the patient automatically: ready, on the way, dispensed', 'The commission settlement is visible to you and to the other side'],
      flow: ['A new order arrives', 'The pharmacist checks the prescription and stock', 'Prepares the order and updates its status', 'Delivery or pick-up and the order is closed'] },
  },
  lab: {
    ar: { id: 'lab', name: 'كيورلي لاب', tag: 'للمعامل', pitch: 'حجوزات التحاليل وسحب العينات ونشر النتائج بإشراف المريض.', mock: 'واجهة طلبات التحاليل في كيورلي لاب',
      benefits: ['كتالوج التحاليل ومواعيد الحجز والسعة اليومية', 'تتبع العينة من الاستلام حتى النتيجة', 'نشر النتيجة للمريض بموافقته وبصلاحيات واضحة', 'سحب عينات منزلي بالتنسيق مع فريق التمريض'],
      standalone: ['تستقبل حجوزاتك الخاصة وتدير الطلبات والنتائج داخليا', 'تُصدر النتائج للمرضى ولأطبائهم بالطريقة التي تحددها', 'تعمل بلا ربط خارجي'],
      connected: ['حجوزات تحاليل من مرضى كيوريكس بمواعيد من جدولك', 'إشعار المريض عند جاهزية النتيجة', 'تسوية واضحة للعمولة والمطابقة'],
      flow: ['حجز تحليل أو طلب من طبيب', 'استلام العينة أو سحبها من المنزل', 'إدخال النتيجة ومراجعتها', 'نشر النتيجة للمريض'] },
    en: { id: 'lab', name: 'Kiorly Lab', tag: 'For labs', pitch: 'Test bookings, sample collection and results released under the patient\'s control.', mock: 'The Kiorly Lab requests screen',
      benefits: ['A test catalogue, booking slots and daily capacity', 'Track a sample from reception to result', 'Release the result to the patient with their consent and clear permissions', 'Home sample collection coordinated with the nursing team'],
      standalone: ['Take your own bookings and manage requests and results internally', 'Hand results to patients and their doctors the way you choose', 'No outside connection required'],
      connected: ['Test bookings from Kiorex patients into slots from your own schedule', 'The patient is notified when the result is ready', 'Clear commission settlement and reconciliation'],
      flow: ['A test is booked or requested by a doctor', 'The sample is received or collected at home', 'The result is entered and reviewed', 'The result is released to the patient'] },
  },
  nurse: {
    ar: { id: 'nurse', name: 'كيورلي للتمريض', tag: 'للتمريض والرعاية المنزلية', pitch: 'زيارات منزلية منظمة بنطاق ممارسة واضح لكل مهنة.', mock: 'واجهة زيارة منزلية في كيورلي للتمريض',
      benefits: ['نسخة من كيورلي كلينيك للممرضين والأخصائيين مثل العلاج الطبيعي', 'نطاق ممارسة لكل مهنة: لا يظهر إلا ما يحق لها', 'زيارات منزلية بخط سير وتسجيل وصول ونتائج الزيارة', 'للممرض المستقل أو للوكالة التي تدير فريقا'],
      standalone: ['تدير مرضاك وزياراتك وجدولك بنفسك', 'سجل زيارة ومتابعة لكل مريض', 'بلا حاجة إلى ربط'],
      connected: ['يطلب المرضى زيارة منزلية عبر كيوريكس', 'تأكيد الزيارة وخروج الممرض في الطريق يصلان إلى المريض وأسرته', 'الدفع والتسوية تظهر للطرفين'],
      flow: ['طلب زيارة منزلية', 'تعيين الممرض أو الأخصائي', 'الوصول وتنفيذ الزيارة وتسجيلها', 'المتابعة والفاتورة'] },
    en: { id: 'nurse', name: 'Kiorly Nurse', tag: 'For nurses and home care', pitch: 'Organised home visits, with a clear scope of practice for each profession.', mock: 'A Kiorly Nurse home visit screen',
      benefits: ['An edition of Kiorly Clinic for nurses and allied professionals such as physiotherapy', 'A scope of practice per profession: only what the role may do is shown', 'Home visits with a route, arrival check-in and visit outcomes', 'For a solo nurse or an agency running a team'],
      standalone: ['Manage your own patients, visits and schedule', 'A visit and follow-up record for each patient', 'No connection required'],
      connected: ['Patients request a home visit through Kiorex', 'Confirmation and "nurse on the way" reach the patient and their family', 'Payment and settlement are visible to both sides'],
      flow: ['A home visit is requested', 'A nurse or specialist is assigned', 'Arrival, the visit and its record', 'Follow-up and the invoice'] },
  },
  staff: {
    ar: { id: 'staff', name: 'تطبيق كيورلي', tag: 'للفريق على الهاتف', pitch: 'تطبيق واحد للفريق: العيادة والتمريض والصيدلية والمعمل.', mock: 'تطبيق كيورلي على الهاتف',
      benefits: ['يبدأ الفريق يومه بالمهام والمواعيد والطلبات من هاتفه', 'وحدات العيادة والتمريض والصيدلية والمعمل في تطبيق واحد', 'تنبيهات السلامة تصل إلى كل الباقات', 'يعمل بحساب كيورلي نفسه'],
      standalone: ['يعمل مع منتجات كيورلي التي تستخدمها فقط', 'لا يتطلب كيوريكس', 'ميزات التطبيق الإضافية حسب الباقة'],
      connected: ['حجز جديد من كيوريكس يظهر في التطبيق فور وصوله', 'إشعارات الطلبات والنتائج والزيارات للفريق', 'تفاصيل الباقات قيد الاعتماد'],
      flow: ['يسجل الفريق الدخول', 'يرى مهام اليوم', 'ينفذ ويحدّث الحالة', 'تصل التحديثات للجميع'] },
    en: { id: 'staff', name: 'The Kiorly app', tag: 'For your team on the phone', pitch: 'One app for the team: clinic, nursing, pharmacy and lab.', mock: 'The Kiorly app on a phone',
      benefits: ['The team starts the day with tasks, appointments and orders on their phone', 'Clinic, Nurse, Pharmacy and Lab modules in one app', 'Safety alerts reach every plan', 'Signs in with the same Kiorly account'],
      standalone: ['Works with the Kiorly products you use', 'Does not require Kiorex', 'Extra app features depend on the plan'],
      connected: ['A new Kiorex booking shows in the app as it arrives', 'Notifications for orders, results and visits', 'Plan details are pending approval'],
      flow: ['The team signs in', 'Sees the day\'s tasks', 'Acts and updates the status', 'Everyone sees the update'] },
  },
  enterprise: {
    ar: { id: 'enterprise', name: 'المستشفيات والسلاسل', tag: 'للمنشآت متعددة الفروع', pitch: 'فروع متعددة بإدارة واحدة وصلاحيات منضبطة.', mock: 'لوحة فروع المستشفى أو السلسلة',
      benefits: ['إدارة فروع متعددة ومنشآت تحت مؤسسة واحدة', 'أدوار وصلاحيات لكل فرع وقسم', 'أدوات إدارة الهوية لمسؤولي المؤسسة مثل رموز SCIM عبر كيوريكس باسبورت', 'تقارير مجمعة لكل فرع للإدارة'],
      standalone: ['تنفذ المؤسسة على فروعها دون ربط خارجي', 'تحدد أنت إيقاع الانضمام فرعا بعد فرع', 'تواصل معنا لخطة تناسب حجمك'],
      connected: ['إتاحة فروع مختارة في سوق كيوريكس', 'عمولة وتسوية لكل فرع على حدة', 'ربط تدريجي تقرره الإدارة'],
      flow: ['إعداد المؤسسة والفروع', 'دعوة المديرين والفريق', 'تفعيل المنتجات لكل فرع', 'متابعة مجمعة للإدارة'] },
    en: { id: 'enterprise', name: 'Hospitals and chains', tag: 'For multi-site providers', pitch: 'Many branches under one management, with controlled access.', mock: 'A hospital or chain branch overview',
      benefits: ['Manage many branches and facilities under one organisation', 'Roles and permissions per branch and department', 'Identity admin tools for organisation owners, such as SCIM tokens through Kiorex Passport', 'Consolidated views per branch for management'],
      standalone: ['The organisation rolls out on its branches without an outside connection', 'You set the pace of onboarding, branch by branch', 'Talk to us for a plan that fits your size'],
      connected: ['Make selected branches available on the Kiorex marketplace', 'Commission and settlement per branch', 'A gradual connection that management decides'],
      flow: ['Set up the organisation and branches', 'Invite managers and teams', 'Switch on products per branch', 'Consolidated follow-up for management'] },
  },
};
export const MODULE_ORDER: ModuleCopy['id'][] = ['clinic', 'pharmacy', 'lab', 'nurse', 'staff', 'enterprise'];
export const MODULE_UI = {
  benefits: t('ما تحصل عليه', 'What you get'), standalone: t('بمفردك', 'Standalone'), connected: t('متصلا بكيوريكس', 'Connected to Kiorex'), flow: t('يوم عمل نموذجي', 'A typical flow'), join: t('انضم إلى هذا المنتج', 'Join for this product'),
  tabs: t('منتجات كيورلي', 'Kiorly products'),
};

export const MODES = {
  title: t('بمفردك أم متصلا بكيوريكس؟', 'On your own, or connected to Kiorex?'),
  lead: t('كيورلي يعمل كاملا بدون كيوريكس. الربط خيار تضيفه حين تريد مرضى جددا وتسوية مالية منظمة.', 'Kiorly works fully without Kiorex. Connecting is an option you add when you want new patients and organised settlements.'),
  standalone: { title: t('بمفردك', 'Standalone'), text: t('كيورلي وحده لإدارة عملك اليومي.', 'Kiorly on its own, to run your daily work.'), points: t(['مواعيدك وملفاتك وطلباتك وفريقك', 'مرضاك الحاليون وقنواتك الخاصة', 'بيانات في مساحة عملك فقط', 'يمكنك الربط لاحقا دون إعادة البدء'], ['Your appointments, records, orders and team', 'Your current patients and your own channels', 'Data in your own workspace only', 'You can connect later without starting over']) },
  connected: { title: t('بمفردك ومتصلا بكيوريكس', 'Standalone and connected to Kiorex'), text: t('كل ما سبق، ويصلك مرضى كيوريكس.', 'Everything on the left, and Kiorex patients can reach you.'), points: t(['ظهور في سوق كيوريكس بعد التحقق واعتماد السوق', 'حجز مباشر على مواعيدك الحية', 'هوية المريض عبر كيوريكس باسبورت', 'عربون الحجز عبر كيوريكس باي عند تفعيله'], ['Listing on the Kiorex marketplace after verification and market go-live', 'Direct booking on your live slots', 'Patient identity through Kiorex Passport', 'Booking deposits through Kiorex Pay when it is switched on']) },
  note: t('الربط بكيوريكس يتطلب التحقق من بياناتك وقبول شروط يحددها فريقنا القانوني. الصياغة قيد المراجعة (TODO_NEEDS_HUMAN).', 'Connecting to Kiorex requires verifying your details and accepting terms that our legal team sets. Wording is under review (TODO_NEEDS_HUMAN).'),
};

export const CONNECTED = {
  title: t('ماذا يضيف الربط بكيوريكس؟', 'What does connecting to Kiorex add?'),
  lead: t('كيوريكس هو سوق المرضى. حين تربط عملك بكيورلي مع كيوريكس تحصل على هذه القدرات، وكلها قابلة للإيقاف بقرار منك أو منا.', 'Kiorex is the patient marketplace. When you connect your Kiorly workspace to Kiorex you get these capabilities, each of which can be switched off.'),
  items: t([
    { k: 'discover', title: 'اكتشاف المرضى', text: 'يظهر مقدمو الرعاية الموثقون في البحث ويقارن المرضى بينهم.' },
    { k: 'book', title: 'حجوزات على مواعيدك الحية', text: 'المريض يرى مواعيدك الفعلية، وتُحجز مؤقتا حتى يؤكد، وكيورلي هو السجل الوحيد للمواعيد.' },
    { k: 'passport', title: 'كيوريكس باسبورت', text: 'هوية واحدة للمريض ولفريقك بتحقق بالهاتف ومفاتيح المرور.' },
    { k: 'pay', title: 'كيوريكس باي', text: 'عربون حجز بنظام رصيد مغلق لكل طرف. كيوريكس لا تحتفظ بأموالك ولا توجد محفظة نقدية.' },
    { k: 'growth', title: 'محرك النمو', text: 'صفحات بحث وإحالات وحملات بموافقة المريض، دون بيانات صحية في التحليلات.' },
    { k: 'commission', title: 'عمولة بشفافية للطرفين', text: 'تُحسب وتُعرض لك ولكيوريكس معا بنفس الأرقام. النسب والتفاصيل تحددها الإدارة (TODO_NEEDS_HUMAN).' },
    { k: 'recon', title: 'مطابقة وتسوية', text: 'كشف تسوية وتطابق بين مطالبة العمولة والنسبة المعتمدة قبل أي تحصيل.' },
    { k: 'orders', title: 'الطلبات والتحاليل والصيدلية', text: 'طلبات الصيدلية وحجوزات المعمل والزيارات المنزلية تتحرك بين المنتجات بحالات واضحة.' },
  ], [
    { k: 'discover', title: 'Patient discovery', text: 'Verified providers appear in search and patients compare them.' },
    { k: 'book', title: 'Bookings on your live slots', text: 'Patients see your real availability; a slot is held briefly until they confirm, and Kiorly stays the one record of appointments.' },
    { k: 'passport', title: 'Kiorex Passport', text: 'One identity for the patient and your team, with phone verification and passkeys.' },
    { k: 'pay', title: 'Kiorex Pay', text: 'Booking deposits with a closed-loop credit for each side. Kiorex does not hold your money and there is no cash wallet.' },
    { k: 'growth', title: 'Growth engine', text: 'Search pages, referrals and campaigns with patient consent, and no health data in analytics.' },
    { k: 'commission', title: 'Commission, visible to both sides', text: 'Calculated and shown to you and to Kiorex with the same numbers. Rates and details are set by management (TODO_NEEDS_HUMAN).' },
    { k: 'recon', title: 'Reconciliation and settlement', text: 'A settlement statement, and a match between each commission claim and the approved rate before anything is collected.' },
    { k: 'orders', title: 'Orders, labs and pharmacy', text: 'Pharmacy orders, lab bookings and home visits move between the products through clear statuses.' },
  ]),
  diagramAlt: t('رسم يوضح رحلة المريض من البحث في كيوريكس إلى الحجز في كيورلي ثم التسوية', 'A diagram of the patient journey from search on Kiorex to a booking in Kiorly and then settlement'),
};

export const FLOWS = {
  title: t('كيف تعمل الرحلات بين المنتجات', 'How the journeys move between products'),
  lead: t('أربع رحلات شائعة. كل خطوة تظهر حالتها لكل طرف مشارك.', 'Four common journeys. Every step shows its status to each party involved.'),
  items: t([
    { id: 'booking', title: 'من البحث إلى الزيارة', steps: ['المريض يبحث في كيوريكس', 'يختار موعدا من جدول العيادة الحي', 'يؤكد ويدفع العربون إن كان مفعلا', 'العيادة تستقبله وتسجل الزيارة', 'تُسجل العمولة ويراها الطرفان'] },
    { id: 'rx', title: 'من الوصفة إلى الصيدلية', steps: ['الطبيب يكتب وصفة إلكترونية', 'المريض يختار صيدلية بموافقته', 'الصيدلية تتحقق وتجهز الطلب', 'التوصيل أو الاستلام وتحديث الحالة', 'تسوية الطلب والعمولة'] },
    { id: 'lab', title: 'من الطلب إلى نتيجة التحليل', steps: ['حجز التحليل أو طلب من الطبيب', 'سحب العينة في المعمل أو المنزل', 'المعمل يدخل النتيجة ويراجعها', 'المريض يستلم النتيجة بموافقته', 'إشعار للطبيب إن شاركها المريض'] },
    { id: 'home', title: 'الزيارة المنزلية', steps: ['المريض يطلب زيارة منزلية', 'تعيين ممرض أو أخصائي بنطاق مناسب', 'الممرض في الطريق والأسرة تُبلَّغ', 'تسجيل الزيارة ونتيجتها', 'المتابعة والتسوية'] },
  ], [
    { id: 'booking', title: 'From search to visit', steps: ['The patient searches on Kiorex', 'Picks a slot from the clinic\'s live schedule', 'Confirms, and pays the deposit if it is switched on', 'The clinic receives them and records the visit', 'The commission is recorded and both sides can see it'] },
    { id: 'rx', title: 'From prescription to pharmacy', steps: ['The doctor writes an e-prescription', 'The patient chooses a pharmacy, with their consent', 'The pharmacy verifies and prepares the order', 'Delivery or pick-up, and the status updates', 'The order and the commission are settled'] },
    { id: 'lab', title: 'From request to lab result', steps: ['A test is booked or a doctor requests it', 'The sample is taken at the lab or at home', 'The lab enters and reviews the result', 'The patient receives it, under their consent', 'The doctor is notified if the patient shares it'] },
    { id: 'home', title: 'The home visit', steps: ['The patient requests a home visit', 'A nurse or specialist with the right scope is assigned', 'The nurse is on the way and the family is told', 'The visit and its outcome are recorded', 'Follow-up and settlement'] },
  ]),
  stepLabel: t('الخطوة', 'Step'),
};

export const SECURITY = {
  title: t('الأمان والخصوصية', 'Security and privacy'),
  lead: t('بيانات الرعاية الصحية حساسة. هذه ما يفعله النظام اليوم، دون وعود لا نستطيع إثباتها.', 'Care data is sensitive. This is what the system does today, with no promise we cannot prove.'),
  items: t([
    { k: 'lock', title: 'تشفير الحقول الحساسة', text: 'الحقول الحساسة مثل أرقام الهوية وبيانات التواصل في الطلبات مشفرة داخل قاعدة البيانات.' },
    { k: 'roles', title: 'صلاحيات حسب الدور', text: 'كل عضو في الفريق يرى ما يخص دوره فقط، والأدوار الإدارية تتطلب تحققا إضافيا.' },
    { k: 'audit', title: 'سجل تدقيق', text: 'تغييرات الحالة والإسناد والتصدير تُسجل بمن فعلها ومتى، دون بيانات شخصية داخل السجل.' },
    { k: 'consent', title: 'موافقة المريض', text: 'مشاركة السجلات والنتائج ورسائل التسويق تتطلب موافقة صريحة يمكن سحبها.' },
    { k: 'sign', title: 'ربط موقّع بين الأنظمة', text: 'الاتصال بين كيورلي وكيوريكس موقّع بمفاتيح سرية ومحدود المعدل، وكل منتج له قاعدة بياناته الخاصة.' },
    { k: 'phi', title: 'لا بيانات صحية في التحليلات', text: 'لا نرسل بيانات صحية أو هويات مرضى إلى منصات الإعلانات أو التحليلات.' },
  ], [
    { k: 'lock', title: 'Sensitive fields are encrypted', text: 'Sensitive fields such as identity numbers and contact details in requests are encrypted inside the database.' },
    { k: 'roles', title: 'Access by role', text: 'Each team member sees only what their role needs, and administrative roles need an extra verification step.' },
    { k: 'audit', title: 'An audit trail', text: 'Status changes, assignment and exports are recorded with who did them and when, with no personal data in the log.' },
    { k: 'consent', title: 'Patient consent', text: 'Sharing records, results and marketing messages needs explicit consent that can be withdrawn.' },
    { k: 'sign', title: 'Signed connections between systems', text: 'The connection between Kiorly and Kiorex is signed with secret keys and rate limited, and each product has its own database.' },
    { k: 'phi', title: 'No health data in analytics', text: 'We do not send health data or patient identities to advertising or analytics platforms.' },
  ]),
  note: t('شهادات الامتثال وموقع استضافة البيانات وسياسة الاحتفاظ: يحددها المؤسس والمستشار القانوني قبل النشر (TODO_NEEDS_HUMAN).', 'Compliance certificates, where data is hosted and the retention policy: to be set by the founder and counsel before launch (TODO_NEEDS_HUMAN).'),
};

export const PLANS = {
  title: t('الباقات', 'Plans'),
  lead: t('باقات كل منتج من منتجات كيورلي كما يحددها فريق كيورلي. ما لم يُحدد له سعر بعد نقول ذلك صراحة.', 'The plans of each Kiorly product, as set by the Kiorly team. Where a price is not set yet, we say so.'),
  /** shown until the live plans arrive, and kept when they cannot be read */
  fallback: t('الباقات قيد الإعداد. انضم إلينا وسيشرح فريقنا الخيارات المتاحة.', 'Plans are being finalised. Join us and our team will explain the options.'),
  contact: t('اسأل عن الباقة المناسبة', 'Ask about the right plan'),
  ask: t('اسأل عن هذه الباقة', 'Ask about this plan'),
  tabs: t('منتجات الباقات', 'Products'),
  modules: t({ clinic: 'العيادة', pharmacy: 'الصيدلية', lab: 'المعمل' }, { clinic: 'Clinic', pharmacy: 'Pharmacy', lab: 'Lab' }),
  tbd: t('الأسعار تعلن قريبا', 'Pricing to be announced'),
  includes: t('تشمل', 'Includes'),
  free: t('مجانا', 'Free'),
  unavailable: t('باقات هذا المنتج قيد الإعداد.', 'The plans of this product are being finalised.'),
  noPlans: t('لا توجد باقات معروضة لهذا المنتج الآن.', 'No plans are listed for this product right now.'),
  marketNote: t('الأسعار بعملة {currency} لسوق {market}.', 'Prices are in {currency} for the {market} market.'),
  perMonth: t('شهريا', 'month'), perYear: t('سنويا', 'year'), perClinic: t('لكل عيادة', 'per clinic'), perClinician: t('لكل طبيب', 'per clinician'),
  included: t('الأطباء المشمولون', 'Clinicians included'), extra: t('طبيب إضافي', 'Extra clinician'),
};

export const FAQ = {
  title: t('أسئلة شائعة', 'Frequently asked questions'),
  items: t([
    { q: 'هل أحتاج إلى كيوريكس لاستخدام كيورلي؟', a: 'لا. كيورلي يعمل كاملا بمفرده. الربط بكيوريكس خيار تضيفه حين تريد.' },
    { q: 'هل أستطيع الربط بكيوريكس لاحقا؟', a: 'نعم. تبدأ بمفردك ثم تطلب الربط، وبياناتك تبقى كما هي. الربط يمر بمراجعة وتحقق.' },
    { q: 'ماذا يحدث لبياناتي ومرضاي؟', a: 'بياناتك داخل مساحة عملك. مشاركة أي سجل مع كيوريكس أو غيره تتطلب موافقة المريض، ويمكنك التحكم في ما يُتاح.' },
    { q: 'كم تبلغ الرسوم والعمولة؟', a: 'لا نعرض أسعارا هنا. الباقات والعمولة تحددها الإدارة وتُعرض عليك قبل أي التزام (TODO_NEEDS_HUMAN).' },
    { q: 'هل يعمل بالعربية؟', a: 'نعم. كل الواجهات بالعربية والإنجليزية مع دعم الكتابة من اليمين إلى اليسار.' },
    { q: 'هل أحتاج أجهزة خاصة؟', a: 'لا. يعمل على الحاسوب والهاتف من المتصفح، ويمكن لفريقك استخدام تطبيق كيورلي على الهاتف.' },
    { q: 'هل يمكن نقل بياناتي من برنامجي الحالي؟', a: 'اذكر برنامجك الحالي في النموذج وسنراجع معك خيارات النقل. لا نعد بتوقيت قبل مراجعة حالتك.' },
    { q: 'ما الذي يحدث بعد إرسال الطلب؟', a: 'تحصل على رقم مرجعي، ثم يراجع فريقنا طلبك ويتواصل معك بالوسيلة التي اخترتها، ثم نبدأ الانضمام خطوة بخطوة.' },
    { q: 'هل بياناتي في النموذج آمنة؟', a: 'بيانات التواصل وأرقام التراخيص مشفرة، ولا نتحقق من أرقام التراخيص لدى أي جهة. الصياغة القانونية للموافقة قيد المراجعة.' },
  ], [
    { q: 'Do I need Kiorex to use Kiorly?', a: 'No. Kiorly works fully on its own. Connecting to Kiorex is an option you add when you want it.' },
    { q: 'Can I connect to Kiorex later?', a: 'Yes. You start standalone and ask to connect later; your data stays as it is. Connecting goes through a review and verification.' },
    { q: 'What happens to my data and my patients?', a: 'Your data lives in your own workspace. Sharing any record with Kiorex or anyone else needs the patient\'s consent, and you control what is made available.' },
    { q: 'How much are the fees and the commission?', a: 'We show no prices here. Plans and commission are set by management and shown to you before any commitment (TODO_NEEDS_HUMAN).' },
    { q: 'Does it work in Arabic?', a: 'Yes. Every screen is in Arabic and English, with right-to-left support.' },
    { q: 'Do I need special equipment?', a: 'No. It runs in a browser on a computer or a phone, and your team can use the Kiorly app on their phones.' },
    { q: 'Can I move my data from my current software?', a: 'Tell us your current software in the form and we will review the options with you. We promise no timing before reviewing your case.' },
    { q: 'What happens after I send the request?', a: 'You get a reference number, our team reviews your request and contacts you through the channel you chose, and we then start onboarding step by step.' },
    { q: 'Is the data I enter in the form safe?', a: 'Contact details and licence numbers are encrypted, and we do not check licence numbers with any authority. The legal wording of the consent is under review.' },
  ]),
};

export const JOIN = {
  title: t('انضم إلى كيورلي', 'Join Kiorly'),
  lead: t('أخبرنا عن عملك في خمس خطوات قصيرة. لا يستغرق الأمر أكثر من بضع دقائق.', 'Tell us about your work in five short steps. It takes only a few minutes.'),
  choose: t('كيف تريد الانضمام؟', 'How do you want to join?'),
  noscript: t('نموذج الانضمام يحتاج إلى جافاسكربت. فعّله أو راسلنا مباشرة.', 'The join form needs JavaScript. Please enable it, or contact us directly.'),
  mockBanner: t('نسخة تجريبية: النموذج يتحقق من البيانات لكنه لا يرسل شيئا.', 'Preview: the form validates your answers but sends nothing.'),
};

export const FOOT = {
  line: t('كيورلي من كيوريكس', 'Kiorly by Kiorex'), blurb: t('منتجات كيورلي: كيورلي كلينيك وكيورلي فارماسي وكيورلي لاب وكيورلي للتمريض، من كيوريكس.', 'Kiorly Clinic, Kiorly Pharmacy, Kiorly Lab and Kiorly Nurse, by Kiorex.'),
  contact: t('تواصل', 'Contact'), sections: t('الأقسام', 'Sections'), preview: t('نسخة تجريبية: الصياغة قيد المراجعة.', 'Preview build: copy under review.'),
  needs: t('محتوى مبدئي', 'Draft content'),
};
export const COMMON = {
  notFoundTitle: t('الصفحة غير موجودة', 'Page not found'), notFoundText: t('هذه الصفحة غير موجودة.', 'This page does not exist.'), backHome: t('العودة إلى الرئيسية', 'Back to the home page'),
  chooser: t('اختر اللغة', 'Choose your language'), previewBanner: FOOT.preview,
};
