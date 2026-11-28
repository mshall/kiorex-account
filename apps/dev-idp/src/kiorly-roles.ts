import type { Account } from './accounts.js';
import { HttpError, type Ctx } from './services.js';

/**
 * Kiorly-only Passport roles (founder decision 28 Nov 2026, ADR-062 in the workspace; option A of the role split paper).
 *
 *   kiorly_ops    read, review and onboarding actions on Kiorly data in the Kiorly admin
 *   kiorly_admin  changes within the Kiorly scope (never the Kiorly market launch or a price approval: those stay super_admin)
 *
 * Rules (code, not settings):
 *  - Only a `super_admin` (with a fresh MFA step-up) grants or revokes them; every grant and revoke is written to the hash-chained audit log with the reason.
 *  - SEPARATE ACCOUNTS: the same sign-in never holds both Kiorex roles and Kiorly roles. A grant is refused when the account holds any role other than `patient`
 *    (the plain account every sign-in starts as); the grant REPLACES `patient` with the Kiorly role, and a revoke puts `patient` back. Nobody grants themselves.
 *  - One Kiorly role per account (a grant of the other level switches it).
 *  - MFA is mandatory like ops_admin: both roles are in config/idp.json `mfaPolicy.requiredForRoles` (the baseline, not editable in the console).
 *  - Every session of the person is revoked on a grant or revoke, so a token never carries the old role set.
 */
export const KIORLY_ROLES = ['kiorly_ops', 'kiorly_admin'] as const;
export type KiorlyRole = (typeof KIORLY_ROLES)[number];
export const isKiorlyRole = (r: unknown): r is KiorlyRole => typeof r === 'string' && (KIORLY_ROLES as readonly string[]).includes(r);
/** The only role an account may hold when a Kiorly role is granted to it. */
export const GRANTABLE_FROM = 'patient';

/** Pure (unit tested): what the roles of an account become, or why not. */
export function planGrant(current: readonly string[], role: KiorlyRole): { roles: string[] } | { conflicting: string[] } {
  const conflicting = current.filter((r) => r !== GRANTABLE_FROM && !isKiorlyRole(r));
  if (conflicting.length) return { conflicting };
  return { roles: [role] };
}
export const planRevoke = (): string[] => [GRANTABLE_FROM];

export const normalisePhone = (v: unknown): string | undefined => {
  const s = String(v ?? '').replace(/[\s\-()]/g, '');
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : undefined;
};
const mask = (phone: string | null) => (phone ? `${phone.slice(0, 4)}${'*'.repeat(Math.max(0, phone.length - 7))}${phone.slice(-3)}` : null);

export class KiorlyRoles {
  constructor(private readonly c: Ctx) {}

  private requireSuper(actor: Account): void {
    if (!actor.roles.includes('super_admin')) throw new HttpError(403, 'super_admin_required');
  }

  private async find(input: Record<string, unknown>): Promise<Account> {
    let a: Account | undefined;
    if (typeof input.sub === 'string' && input.sub) a = await this.c.accounts.findBySub(input.sub);
    else {
      const phone = normalisePhone(input.phone);
      if (!phone) throw new HttpError(400, 'invalid_target', { detail: 'phone (E.164) or sub required' });
      a = await this.c.accounts.findByPhone(phone);
    }
    if (!a) throw new HttpError(404, 'account_not_found', { detail: 'the person must have signed in to Passport once' });
    if (a.kind !== 'person') throw new HttpError(409, 'account_not_eligible');
    return a;
  }

  async list(): Promise<{ holders: Array<{ sub: string; name: string | null; phone: string | null; role: string; test: boolean }>; history: Array<{ at: string; type: string; actor: string | null; actor_name: string | null; target: string | null; target_name: string | null; role: string | null; note: string | null }> }> {
    const h = await this.c.pool.query(
      `SELECT sub, name, phone, roles, data_class FROM accounts WHERE status='active' AND (roles ? 'kiorly_ops' OR roles ? 'kiorly_admin') ORDER BY created_at DESC LIMIT 200`);
    const ev = await this.c.pool.query(
      `SELECT e.at, e.type, e.sub, e.data, a.name AS actor_name, t.name AS target_name FROM audit_events e
         LEFT JOIN accounts a ON a.sub = e.sub LEFT JOIN accounts t ON t.sub = e.data->>'target'
        WHERE e.type IN ('kiorly.role.granted','kiorly.role.revoked') ORDER BY e.seq DESC LIMIT 50`);
    return {
      holders: h.rows.map((r) => ({ sub: r.sub, name: r.name, phone: mask(r.phone), role: (r.roles as string[]).find(isKiorlyRole) ?? '', test: r.data_class !== 'REAL' })),
      history: ev.rows.map((r) => ({ at: new Date(r.at).toISOString(), type: r.type, actor: r.sub, actor_name: r.actor_name ?? null, target: r.data?.target ?? null, target_name: r.target_name ?? null, role: r.data?.role ?? null, note: r.data?.note ?? null })),
    };
  }

  async grant(actor: Account, input: Record<string, unknown>): Promise<{ sub: string; role: KiorlyRole; previous_roles: string[] }> {
    this.requireSuper(actor);
    if (!isKiorlyRole(input.role)) throw new HttpError(400, 'invalid_role', { allowed: KIORLY_ROLES });
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (note.length < 3 || note.length > 300) throw new HttpError(400, 'reason_required', { detail: 'a reason of 3 to 300 characters is required' });
    const target = await this.find(input);
    if (target.sub === actor.sub) throw new HttpError(409, 'cannot_grant_self');
    const plan = planGrant(target.roles, input.role);
    if ('conflicting' in plan) throw new HttpError(409, 'mixed_roles', { detail: 'a Kiorly role needs a separate account: this one holds Kiorex roles', conflicting: plan.conflicting });
    await this.c.pool.query(`UPDATE accounts SET roles = $2::jsonb WHERE sub = $1`, [target.sub, JSON.stringify(plan.roles)]);
    await this.c.audit.record('kiorly.role.granted', actor.sub, { target: target.sub, role: input.role, previous: target.roles, note });
    await this.c.hooks.revokeSessions(target.sub);
    return { sub: target.sub, role: input.role, previous_roles: target.roles };
  }

  async revoke(actor: Account, sub: string, input: Record<string, unknown>): Promise<{ sub: string; roles: string[] }> {
    this.requireSuper(actor);
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (note.length < 3 || note.length > 300) throw new HttpError(400, 'reason_required', { detail: 'a reason of 3 to 300 characters is required' });
    const target = await this.c.accounts.findBySub(sub);
    if (!target) throw new HttpError(404, 'account_not_found');
    const held = target.roles.filter(isKiorlyRole);
    if (!held.length) throw new HttpError(404, 'no_kiorly_role');
    const roles = planRevoke();
    await this.c.pool.query(`UPDATE accounts SET roles = $2::jsonb WHERE sub = $1`, [target.sub, JSON.stringify(roles)]);
    await this.c.audit.record('kiorly.role.revoked', actor.sub, { target: target.sub, role: held[0], note });
    await this.c.hooks.revokeSessions(target.sub);
    return { sub: target.sub, roles };
  }
}
