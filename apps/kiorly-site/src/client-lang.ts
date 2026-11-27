/** Root page only: send Arabic browsers to /ar/ and everyone else to /en/. Without JavaScript (and for crawlers) the page shows both links. */
const preferred = (navigator.languages?.[0] ?? navigator.language ?? 'en').toLowerCase();
const saved = (() => { try { return localStorage.getItem('kiorly-lang'); } catch { return null; } })();
const lang = saved === 'ar' || saved === 'en' ? saved : preferred.startsWith('ar') ? 'ar' : 'en';
location.replace(`/${lang}/`);
