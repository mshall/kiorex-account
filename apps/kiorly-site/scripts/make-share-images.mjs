// Regenerates the link-preview (WhatsApp, Telegram, iMessage, X) image and the PNG icons of the Kiorly site from the vendored brand SVGs.
// Run: node scripts/make-share-images.mjs   (needs Playwright's Chromium). Output: assets/share/*.png (committed, copied to dist/assets/share by the build).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path'; import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url)); const brand = path.resolve(here, '../../kiorly-home/public/brand'); const out = path.resolve(here, '../assets/share');
const svg = (f) => readFileSync(path.join(brand, f), 'utf8');
const font = (f) => `data:font/ttf;base64,${readFileSync(path.join(brand, 'fonts', f)).toString('base64')}`;
const og = `<html><head><style>
@font-face{font-family:J;src:url(${font('Jost_600SemiBold.ttf')});font-weight:600}@font-face{font-family:J;src:url(${font('Jost_400Regular.ttf')});font-weight:400}
@font-face{font-family:A;src:url(${font('IBMPlexSansArabic_600SemiBold.ttf')});font-weight:600}
body{margin:0;width:1200px;height:630px;background:linear-gradient(135deg,#EEF2FF 0%,#FFFFFF 55%,#FDECE8 100%);font-family:J;position:relative;overflow:hidden}
.ring{position:absolute;right:-180px;top:-180px;width:560px;height:560px;border-radius:50%;border:70px solid #3730A311}
.ring2{position:absolute;left:-140px;bottom:-200px;width:460px;height:460px;border-radius:50%;background:#0369A10f}
.c{position:absolute;left:80px;top:80px;right:80px;bottom:80px;display:flex;flex-direction:column;justify-content:space-between}
.logo svg{height:104px;width:auto}h1{font-size:62px;line-height:1.08;color:#1E1B4B;margin:0;font-weight:600;letter-spacing:-1px}
p{margin:18px 0 0;font-size:30px;color:#475569}.ar{font-family:A;font-weight:600;font-size:34px;color:#3730A3;direction:rtl;margin-top:14px;display:block;width:fit-content}
.bar{height:8px;width:180px;background:#E8735E;border-radius:8px}.by{font-size:24px;color:#64748B}</style></head><body><div class="ring"></div><div class="ring2"></div><div class="c">
<div class="logo">${svg('kiorly-lockup.svg')}</div>
<div><h1>Clinics, pharmacies and labs<br>on one connected system</h1><div class="ar">عيادات وصيدليات ومعامل في نظام واحد متصل</div><p>Works on its own, or connected to Kiorex patients.</p></div>
<div style="display:flex;align-items:center;gap:20px"><div class="bar"></div><div class="by">kiorly.com · by Kiorex</div></div></div></body></html>`;
const icon = (s, pad) => `<html><body style="margin:0;width:${s}px;height:${s}px;background:#fff;display:flex;align-items:center;justify-content:center"><div style="width:${s - 2 * pad}px;height:${s - 2 * pad}px;display:flex">${svg('favicon.svg').replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`;
const b = await chromium.launch(); const shot = async (html, w, h, file, scale = 1) => { const jpg = file.endsWith('.jpg'); const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale }); await p.setContent(html); await p.waitForTimeout(400); writeFileSync(path.join(out, file), await p.screenshot(jpg ? { type: 'jpeg', quality: 86 } : { type: 'png' })); await p.close(); };
await shot(og, 1200, 630, 'og-image.jpg');
await shot(icon(180, 24), 180, 180, 'apple-touch-icon.png'); await shot(icon(192, 24), 192, 192, 'icon-192.png'); await shot(icon(512, 64), 512, 512, 'icon-512.png'); await shot(icon(32, 2), 32, 32, 'favicon-32.png');
await b.close(); console.log('share images written to', out);
