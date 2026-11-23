import { describe, it, expect } from 'vitest';
import { THEME_BOOT, page } from '../src/views.js';
import { shellHtml } from '../src/account-ui.js';

/** Founder, 24 Nov 2026: LIGHT is the default theme everywhere; only an explicit Dark / System choice (localStorage `kx-theme`) is restored. */
describe('Passport pages: light by default, explicit choice restored before first paint', () => {
  const html = page('en', 'Sign in', '<h1>Hi</h1>');
  it('server-rendered IdP pages start light (never "auto") and ship the boot script + a Light/Dark/System control', () => {
    expect(html).toMatch(/<html [^>]*data-theme="light"/);
    expect(html).toContain(THEME_BOOT);
    expect(html).toContain('id="kx-theme-select"');
    for (const v of ['light', 'dark', 'system']) expect(html).toContain(`<option value="${v}">`);
    expect(page('ar', 'x', '')).toContain('المظهر');
  });
  it('the OS dark preference only applies for the explicit System choice, and the logo no longer follows the OS on its own', () => {
    expect(html).not.toContain('<picture>');
    expect(html).toContain('[data-theme=auto]');
    expect(html).not.toMatch(/@media \(prefers-color-scheme:dark\)\{:root\{/);
  });
  it('the boot script maps stored dark -> dark, stored system -> auto, anything else -> light', () => {
    const run = (stored: string | null) => {
      const el: { dataset: Record<string, string> } = { dataset: {} };
      new Function('localStorage', 'document', THEME_BOOT)({ getItem: () => stored }, { documentElement: el });
      return el.dataset.theme;
    };
    expect(run(null)).toBe('light'); expect(run('purple')).toBe('light'); expect(run('light')).toBe('light');
    expect(run('dark')).toBe('dark'); expect(run('system')).toBe('auto');
  });
  it('the account SPA shell starts light and its boot script follows the same mapping', () => {
    const shell = shellHtml('http://localhost:4400');
    expect(shell).toContain('data-theme="light"');
    expect(shell).toContain("t==='dark'?'dark':t==='system'?'auto':'light'");
  });
});
