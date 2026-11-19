import type { Pool } from './db.js';
import type { IdpConfig } from './config.js';
import type { Accounts } from './accounts.js';
import type { Audit } from './audit.js';
import type { Events } from './events.js';
import type { Notifier } from './notify.js';
import type { SigningKey } from './keys.js';
import type { LogoutDispatcher } from './logout.js';

/** Shared dependencies for the KA-06/08/09/10/11 service modules. */
export interface Ctx {
  pool: Pool; cfg: IdpConfig; accounts: Accounts; audit: Audit; events: Events; notifier: Notifier;
  key: SigningKey; issuer: string; dispatcher: LogoutDispatcher; now: () => number; // epoch seconds
  /** Wired by the app after the API deps exist: revokes every session of a subject (back-channel logout included). */
  hooks: { revokeSessions: (sub: string) => Promise<void> };
}

export class HttpError extends Error {
  constructor(public readonly status: number, public readonly code: string, public readonly extra: Record<string, unknown> = {}) { super(code); }
}

export const nowDate = (c: Pick<Ctx, 'now'>): Date => new Date(c.now() * 1000);
