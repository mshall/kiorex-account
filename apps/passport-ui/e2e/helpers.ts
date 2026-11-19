import { expect, type BrowserContext, type Page } from '@playwright/test';
import { generateSync } from 'otplib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const PORT = Number(process.env.KX_E2E_PORT ?? 4450);
export const ISSUER = `http://localhost:${PORT}`;
const here = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(path.join(here, '../../../config/seed-users.json'), 'utf8')).users as Array<{ phone: string; totpSecret?: string; roles: string[] }>;
export const OPS = seed.find((u) => u.roles.includes('super_admin'))!;

const used = new Set<string>();
export const randomPhone = (): string => {
  for (;;) {
    const p = `+2012${String(Math.floor(Math.random() * 100_000_000)).padStart(8, '0')}`;
    if (!used.has(p)) { used.add(p); return p; }
  }
};

export async function lastMessage(phone: string, template?: string) {
  const r = await fetch(`${ISSUER}/dev/inbox?${new URLSearchParams({ to: phone, ...(template ? { template } : {}) })}`);
  const msgs = (await r.json()).messages as Array<{ template: string; data: Record<string, string> }>;
  return msgs.at(-1);
}
export async function lastCode(phone: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const r = await fetch(`${ISSUER}/dev/inbox?${new URLSearchParams({ to: phone })}`);
    const m = ((await r.json()).messages as Array<{ data: Record<string, string> }>).filter((x) => x.data.code).at(-1);
    if (m) return m.data.code;
    await new Promise((res) => setTimeout(res, 150));
  }
  throw new Error(`no OTP in dev inbox for ${phone}`);
}

/** English UI for role-based selectors; the RTL spec runs without this and checks Arabic. */
export async function useEnglish(target: Page | BrowserContext) {
  await target.addInitScript(() => { try { localStorage.setItem('kx-lang', 'en'); } catch { /* ignore */ } });
}

export const totpNow = (secret: string, offsetSeconds = 0) => generateSync({ secret, strategy: 'totp', epoch: Math.floor(Date.now() / 1000) + offsetSeconds });

export const resetRateLimits = () => fetch(`${ISSUER}/dev/reset-rate-limits`, { method: 'POST' });

/** Drives the real sign-in: Passport -> IdP phone page -> OTP (read from the mock dev inbox) -> [TOTP] -> back to /account. */
export async function signIn(page: Page, phone: string, o: { name?: string; totpSecret?: string; passkeyLogin?: boolean; path?: string } = {}) {
  await resetRateLimits(); // the whole suite signs in from one IP (20 sends/IP/h is a safety control in the real IdP)
  await page.goto(o.path ?? '/account');
  await page.getByRole('button', { name: /^(Sign in|تسجيل الدخول)$/ }).click();
  await page.waitForURL(/\/interaction\//);
  if (o.passkeyLogin) {
    await page.getByRole('button', { name: /passkey|مفتاح مرور/i }).click();
  } else {
    await page.locator('#phone').fill(phone);
    if (o.name) await page.locator('#name').fill(o.name);
    await page.locator('form[action$="/phone"] button[type=submit]').click();
    const code = await lastCode(phone);
    await page.locator('#code').fill(code);
    await page.locator('form[action$="/verify"] button[type=submit]').first().click();
    if (o.totpSecret) {
      await page.locator('#totp').fill(totpNow(o.totpSecret));
      await page.locator('form[action$="/totp"] button[type=submit]').click();
    }
    // optional passkey registration step shown after phone OTP: skip it
    const skip = page.locator('form[action$="/finish"] button');
    if (await skip.isVisible({ timeout: 2000 }).catch(() => false)) await skip.click();
  }
  await page.waitForURL(new RegExp(`${ISSUER.replace(/[/.]/g, '\\$&')}/account(?!/callback)`), { timeout: 20_000 });
  await expect(page.locator('main h1').first()).toBeVisible();
}

/** Software authenticator via the Chrome DevTools Protocol (system Chrome, no downloads). */
export async function addVirtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { cdp, authenticatorId, credentials: async () => (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials };
}

export const nav = (page: Page, name: string | RegExp) => page.getByRole('navigation', { name: /Account sections|أقسام الحساب/ }).getByRole('link', { name, exact: typeof name === 'string' });
