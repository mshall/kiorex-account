/** Strings of the join form (Arabic and English). Draft wording: needs a native-Arabic review. The consent text is a DRAFT pending counsel (TODO_NEEDS_HUMAN). */
import type { L10n } from './config';

const t = <T,>(ar: T, en: T): L10n<T> => ({ ar, en });
/** Bumped whenever the consent wording changes. Sent with every request and stored with it. */
export const CONSENT_TEXT_VERSION = 'draft-2';

export const FORM = {
  steps: t(['طريقة الانضمام', 'عن عملك', 'التواصل والموقع', 'التراخيص والخطة', 'التفضيلات والموافقة'], ['How to join', 'About your business', 'Contact and location', 'Licences and plan', 'Preferences and consent']),
  stepOf: t('الخطوة {n} من {total}', 'Step {n} of {total}'), progress: t('تقدم النموذج', 'Form progress'),
  next: t('التالي', 'Next'), back: t('رجوع', 'Back'), submit: t('إرسال الطلب', 'Send request'), sending: t('جار الإرسال...', 'Sending...'), optional: t('اختياري', 'optional'), required: t('مطلوب', 'required'),
  errSummary: t('راجع الحقول التالية:', 'Please check these fields:'), errRequired: t('هذا الحقل مطلوب', 'This field is required'), errInvalid: t('القيمة غير صالحة', 'This value is not valid'), errTooLong: t('النص أطول من المسموح', 'This text is too long'),
  errTooShort: t('القيمة أقل من الحد الأدنى', 'This value is below the minimum'), errTooMany: t('عدد الاختيارات أكبر من المسموح', 'Too many choices'), errPhone: t('أدخل رقم هاتف صحيحا، مثل 01001234567', 'Enter a valid phone number, for example 01001234567'),
  errEmail: t('أدخل بريدا إلكترونيا صحيحا', 'Enter a valid e-mail address'), errConsent: t('يجب الموافقة للمتابعة', 'You must agree to continue'), errBranches2: t('السلسلة تتكون من فرعين على الأقل', 'A chain has at least 2 branches'),
  modeTitle: t('كيف تريد الانضمام؟', 'How do you want to join?'),
  modeStandalone: t('بمفردك', 'Standalone'), modeStandaloneText: t('كيورلي وحده لإدارة عملك. بدون ربط بكيوريكس.', 'Kiorly on its own to run your work. No connection to Kiorex.'),
  modeConnected: t('بمفردك ومتصلا بكيوريكس', 'Standalone and connected to Kiorex'), modeConnectedText: t('كيورلي، ويصلك مرضى سوق كيوريكس بعد التحقق.', 'Kiorly, and Kiorex marketplace patients can reach you after verification.'),
  typeTitle: t('نوع مقدم الخدمة', 'Provider type'),
  legalName: t('الاسم القانوني أو اسم المنشأة', 'Legal or business name'), tradeName: t('الاسم التجاري', 'Trade name'), branches: t('عدد الفروع', 'Number of branches'), staffCount: t('عدد الأطباء والعاملين', 'Practitioners and staff'),
  specialties: t('التخصصات', 'Specialties'), services: t('الخدمات أو تخصصات أخرى', 'Services or other specialties'), currentSoftware: t('البرنامج الذي تستخدمه حاليا', 'Software you use today'), currentSoftwareHint: t('مثال: ورق، جداول، اسم برنامج', 'For example paper, spreadsheets or a software name'),
  contactName: t('اسم الشخص المسؤول', 'Contact person'), contactRole: t('صفته', 'Role'), phone: t('رقم الهاتف', 'Phone number'), phoneHint: t('بدون رمز الدولة يُفترض +20', 'Without a country code, +20 is assumed'), email: t('البريد الإلكتروني', 'E-mail'),
  market: t('الدولة', 'Country'), governorate: t('المحافظة', 'Governorate'), city: t('المدينة أو الحي', 'City or district'), choose: t('اختر...', 'Choose...'),
  licenceTitle: t('أرقام التراخيص والسجلات', 'Licence and registration numbers'), licenceNote: t('اختيارية. تكتبها بنفسك ولا نتحقق منها لدى أي جهة، ويمكن إضافتها لاحقا أثناء الانضمام.', 'Optional. You type them yourself; we do not check them with any authority, and they can be added later during onboarding.'),
  facilityLicence: t('ترخيص المنشأة', 'Facility licence'), professionalLicence: t('ترخيص مزاولة المهنة', 'Professional licence'), commercialRegister: t('السجل التجاري', 'Commercial register'), taxCard: t('البطاقة الضريبية', 'Tax card'),
  modules: t('المنتجات التي تهمك', 'Products you are interested in'), goLive: t('متى تريد البدء؟', 'When would you like to start?'),
  language: t('لغة التواصل', 'Preferred language'), contactChannel: t('وسيلة التواصل المفضلة', 'Preferred contact channel'), contactTime: t('أفضل وقت للتواصل', 'Best time to contact you'), note: t('ملاحظة (اختياري)', 'Note (optional)'),
  consent: t('أوافق على أن تحتفظ كيورلي بالبيانات التي أدخلتها وتستخدمها للتواصل معي بخصوص الانضمام إلى كيورلي، وفق سياسة الخصوصية.', 'I agree that Kiorly keeps the details I entered and uses them to contact me about joining Kiorly, under the privacy policy.'),
  consentDraft: t('صياغة مبدئية بانتظار المراجعة القانونية (TODO_NEEDS_HUMAN).', 'Draft wording, pending legal review (TODO_NEEDS_HUMAN).'),
  answers: {
    rooms: t('عدد الغرف', 'Number of rooms'), practiceSetting: t('مكان الممارسة', 'Where you practise'), centralBilling: t('فوترة مركزية للفروع', 'Central billing across branches'), citiesCount: t('عدد المدن', 'Number of cities'),
    beds: t('عدد الأسرة', 'Number of beds'), departments: t('عدد الأقسام', 'Number of departments'), currentHis: t('لدينا نظام مستشفى حاليا', 'We have a hospital system today'), homeVisits: t('أقدم زيارات منزلية', 'I do home visits'),
    practiceModel: t('نموذج العمل', 'Practice model'), homeSampling: t('سحب عينات منزلي', 'Home sample collection'), collectionPoints: t('عدد نقاط الاستلام', 'Collection points'), delivery: t('نقدم توصيلا', 'We offer delivery'),
    open24h: t('نعمل 24 ساعة', 'Open 24 hours'), otherDescription: t('صف نشاطك', 'Describe your activity'),
  } as Record<string, L10n>,
  enums: {
    OWN_CLINIC: t('عيادتي الخاصة', 'My own clinic'), SHARED_CLINIC: t('عيادة مشتركة', 'A shared clinic'), MULTIPLE_PLACES: t('أكثر من مكان', 'More than one place'), SOLO: t('ممرض مستقل', 'Solo'), AGENCY: t('وكالة أو مركز', 'Agency or centre'),
  } as Record<string, L10n>,
  yes: t('نعم', 'Yes'), no: t('لا', 'No'),
  review: t('مراجعة طلبك', 'Review your request'), reviewHint: t('تأكد من البيانات قبل الإرسال. يمكنك الرجوع وتعديلها.', 'Check the details before sending. You can go back and edit them.'),
  sentTitle: t('تم استلام طلبك', 'We received your request'), sentRef: t('رقمك المرجعي', 'Your reference'), copy: t('نسخ الرقم', 'Copy reference'), copied: t('تم النسخ', 'Copied'),
  nextTitle: t('ماذا يحدث بعد ذلك؟', 'What happens next?'),
  next1: t('يراجع فريق كيورلي طلبك.', 'The Kiorly team reviews your request.'), next2: t('نتواصل معك بالوسيلة والوقت اللذين اخترتهما. مدة الرد قيد التحديد (TODO_NEEDS_HUMAN).', 'We contact you by the channel and time you chose. The response time is yet to be set (TODO_NEEDS_HUMAN).'),
  next3: t('نبدأ الانضمام خطوة بخطوة، ونطلب المستندات اللازمة وقتها.', 'We start onboarding step by step and ask for any documents then.'),
  nextConnected: t('الربط بكيوريكس يمر بتحقق واتفاق خاص، ويشرحهما لك فريقنا.', 'Connecting to Kiorex goes through verification and a separate agreement that our team will explain.'),
  another: t('إرسال طلب آخر', 'Send another request'), mockSent: t('نسخة تجريبية: لم يُرسل شيء. هذا رقم تجريبي.', 'Preview: nothing was sent. This is a sample reference.'),
  failed: t('تعذر إرسال الطلب. تحقق من الاتصال وحاول مرة أخرى. بياناتك محفوظة في النموذج.', 'We could not send your request. Check your connection and try again. Your answers are still in the form.'),
  rate: t('طلبات كثيرة من هذا الاتصال. حاول بعد قليل.', 'Too many requests from this connection. Please try again shortly.'),
  conflict: t('تم استخدام هذا الإرسال لطلب مختلف. حدّث الصفحة وحاول مجددا.', 'This submission was used for a different request. Reload the page and try again.'),
  loadingConfig: t('جار تحميل النموذج...', 'Loading the form...'),
  type: t('النوع', 'Type'), mode: t('الوضع', 'Mode'),
};
export type FormText = typeof FORM;
