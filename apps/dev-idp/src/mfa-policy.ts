import { ulid } from 'ulid';
import type { Account } from './accounts.js';
import { HttpError, type Ctx } from './services.js';

/**
 * Configurable second-factor policy (27 Nov 2026, founder decision).
 *
 * MFA stays OPTIONAL by default. A Passport ops_admin proposes (a different ops_admin or super_admin approves; a super_admin may apply directly as a
 * break-glass, audited) a policy that makes TOTP / passkey MANDATORY at sign-in for chosen roles, in three scopes: everywhere (`all`), per organisation
 * type (`org_type`: clinic, nurse, pharmacy, lab) or per organisation (`org`). Roles are membership role hints (owner, pharmacist, ...) and Passport
 * roles; `*` means every member. A global switch (`enabled`) turns the whole policy on or off without losing the rules; it defaults OFF.
 *
 * The baseline in config/idp.json `mfaPolicy.requiredForRoles` (ops_admin, super_admin, owner, admin, finance as Passport ROLES) is unchanged and cannot
 * be weakened here: this policy can only ADD requirements. Pharmacy and Lab keep their own MFA_REQUIRED rule for privileged staff roles.
 */
export const ORG_TYPES = ['clinic', 'nurse', 'pharmacy', 'lab'] as const;
export type OrgType = (typeof ORG_TYPES)[number];
export type PolicyScope = 'all' | 'org_type' | 'org';
export interface PolicyRule { scope: PolicyScope; value?: string; roles: string[] }
export interface MfaPolicyDoc { enabled: boolean; rules: PolicyRule[] }
export const DEFAULT_POLICY: MfaPolicyDoc = { enabled: false, rules: [] };

export interface ChangeRow {
  id: string; proposed_by: string; policy: MfaPolicyDoc; note: string | null; base_version: number; status: 'pending' | 'applied' | 'rejected' | 'withdrawn';
  decided_by: string | null; decided_at: Date | null; decision_note: string | null; applied_directly: boolean; created_at: Date;
}
export interface Requirement { required: boolean; by: 'role' | 'policy' | null; rule?: { scope: PolicyScope; value?: string } }

const MAX_RULES = 40;
const MAX_ROLES = 30;

/** Organisation types of one organisation row: Pharmacy and Lab by their product reference, Nurse by edition, Clinic otherwise. */
export function orgTypesOf(o: { edition: string | null; product_refs: Record<string, string> | null }): OrgType[] {
  const refs = o.product_refs ?? {};
  const types = new Set<OrgType>();
  if (refs.kiorly_pharmacy_tenant_id) types.add('pharmacy');
  if (refs.kiorly_lab_tenant_id) types.add('lab');
  if ((o.edition ?? '').toUpperCase() === 'NURSE') types.add('nurse');
  if (refs.kiorly_clinic_tenant_id || !types.size) types.add((o.edition ?? '').toUpperCase() === 'NURSE' ? 'nurse' : 'clinic');
  return [...types];
}

/** Pure matcher (unit tested): does this person, with these Passport roles and memberships, fall under the policy? */
export function matchPolicy(
  policy: MfaPolicyDoc, passportRoles: string[],
  memberships: Array<{ org_id: string; role_hint: string; types: OrgType[] }>,
): PolicyRule | undefined {
  if (!policy.enabled) return undefined;
  const has = (rule: PolicyRule, role: string) => rule.roles.includes('*') || rule.roles.includes(role);
  for (const rule of policy.rules) {
    if (rule.scope === 'all') {
      if (passportRoles.some((r) => rule.roles.includes(r))) return rule;
      if (memberships.some((m) => has(rule, m.role_hint))) return rule;
    } else if (rule.scope === 'org_type') {
      if (memberships.some((m) => m.types.includes(rule.value as OrgType) && has(rule, m.role_hint))) return rule;
    } else if (memberships.some((m) => m.org_id === rule.value && has(rule, m.role_hint))) return rule;
  }
  return undefined;
}

export interface TypeCoverage { mandatory: string[]; partial: string[] }
export interface PublicCoverage { enabled: boolean; version: number; types: Record<OrgType, TypeCoverage> }

/**
 * What a PRODUCT API may ask about the policy (no person, no organisation id): per organisation type, the role hints for which two-step verification is
 * mandatory for the WHOLE type (`mandatory`, '*' = every member) and the ones only some organisations of that type are covered for (`partial`, org-scoped rules).
 * Pure and unit tested. Baseline Passport roles are not part of it (they are not product roles).
 */
export function coverageByType(policy: MfaPolicyDoc, orgs: Array<{ org_id: string; types: OrgType[] }>, version = 0): PublicCoverage {
  const out = Object.fromEntries(ORG_TYPES.map((t) => [t, { mandatory: new Set<string>(), partial: new Set<string>() }])) as Record<OrgType, { mandatory: Set<string>; partial: Set<string> }>;
  if (policy.enabled) {
    for (const rule of policy.rules) {
      if (rule.scope === 'all') for (const t of ORG_TYPES) rule.roles.forEach((r) => out[t].mandatory.add(r));
      else if (rule.scope === 'org_type' && (ORG_TYPES as readonly string[]).includes(rule.value ?? '')) rule.roles.forEach((r) => out[rule.value as OrgType].mandatory.add(r));
      else if (rule.scope === 'org') for (const o of orgs.filter((x) => x.org_id === rule.value)) for (const t of o.types) rule.roles.forEach((r) => out[t].partial.add(r));
    }
  }
  const lists = (x: { mandatory: Set<string>; partial: Set<string> }): TypeCoverage => ({ mandatory: [...x.mandatory].sort(), partial: [...x.partial].sort() });
  return { enabled: policy.enabled, version, types: Object.fromEntries(ORG_TYPES.map((t) => [t, lists(out[t])])) as Record<OrgType, TypeCoverage> };
}

export class MfaPolicy {
  constructor(private readonly c: Ctx) {}

  // ---- roles a policy can name ----
  assignableRoles(): string[] {
    const cfg = this.c.cfg.mfaPolicy as { requiredForRoles: string[]; assignableRoles?: string[] };
    const passport = ['ops_admin', 'super_admin', 'finance', 'owner', 'admin'];
    return [...new Set([...this.c.cfg.orgs.roleHints, ...cfg.requiredForRoles, ...passport, ...(cfg.assignableRoles ?? [])])].sort();
  }

  // ---- storage ----
  async current(): Promise<{ policy: MfaPolicyDoc; version: number; updated_by: string | null; updated_at: Date | null }> {
    const r = await this.c.pool.query(`SELECT policy, version, updated_by, updated_at FROM mfa_policy WHERE id = 1`);
    const row = r.rows[0];
    if (!row) return { policy: structuredClone(DEFAULT_POLICY), version: 0, updated_by: null, updated_at: null };
    return { policy: normalise(row.policy), version: Number(row.version), updated_by: row.updated_by, updated_at: row.updated_at };
  }

  // ---- evaluation (sign-in, account API) ----
  async requirement(a: Pick<Account, 'sub' | 'roles'>): Promise<Requirement> {
    const base = (this.c.cfg.mfaPolicy as { requiredForRoles: string[] }).requiredForRoles;
    if (a.roles.some((r) => base.includes(r))) return { required: true, by: 'role' };
    const { policy } = await this.current();
    if (!policy.enabled || !policy.rules.length) return { required: false, by: null };
    const rule = matchPolicy(policy, a.roles, await this.membershipsOf(a.sub));
    return rule ? { required: true, by: 'policy', rule: { scope: rule.scope, ...(rule.value ? { value: rule.value } : {}) } } : { required: false, by: null };
  }

  private async membershipsOf(sub: string) {
    const now = new Date(this.c.now() * 1000);
    const r = await this.c.pool.query(
      `SELECT m.org_id, m.role_hint, o.edition, o.product_refs FROM memberships m JOIN organizations o ON o.org_id = m.org_id
        WHERE m.sub = $1 AND m.status = 'active' AND o.status = 'active' AND m.effective_from <= $2 AND (m.expires_at IS NULL OR m.expires_at > $2)`, [sub, now]);
    return r.rows.map((x) => ({ org_id: x.org_id as string, role_hint: x.role_hint as string, types: orgTypesOf(x) }));
  }

  /** Unauthenticated coverage answer for product APIs (see coverageByType). */
  async publicCoverage(): Promise<PublicCoverage> {
    const { policy, version } = await this.current();
    const orgs = policy.enabled && policy.rules.some((r) => r.scope === 'org') ? await this.orgOptions() : [];
    return coverageByType(policy, orgs, version);
  }

  /** How many people a policy would cover, and how many of them have no authenticator yet (they would be walked through enrolment at their next sign-in). */
  async impact(policy: MfaPolicyDoc): Promise<{ people: number; without_factor: number }> {
    if (!policy.enabled || !policy.rules.length) return { people: 0, without_factor: 0 };
    const now = new Date(this.c.now() * 1000);
    const r = await this.c.pool.query(
      `SELECT m.sub, m.org_id, m.role_hint, o.edition, o.product_refs, a.roles,
              EXISTS (SELECT 1 FROM totp_credentials t WHERE t.sub = m.sub AND t.confirmed_at IS NOT NULL) AS enrolled
         FROM memberships m JOIN organizations o ON o.org_id = m.org_id JOIN accounts a ON a.sub = m.sub
        WHERE m.status = 'active' AND o.status = 'active' AND a.status = 'active' AND m.effective_from <= $1 AND (m.expires_at IS NULL OR m.expires_at > $1) LIMIT 50000`, [now]);
    const bySub = new Map<string, { roles: string[]; enrolled: boolean; ms: Array<{ org_id: string; role_hint: string; types: OrgType[] }> }>();
    for (const x of r.rows) {
      const e = bySub.get(x.sub) ?? { roles: x.roles as string[], enrolled: x.enrolled as boolean, ms: [] };
      e.ms.push({ org_id: x.org_id, role_hint: x.role_hint, types: orgTypesOf(x) });
      bySub.set(x.sub, e);
    }
    let people = 0; let without = 0;
    for (const e of bySub.values()) {
      if (!matchPolicy(policy, e.roles, e.ms)) continue;
      people++; if (!e.enrolled) without++;
    }
    return { people, without_factor: without };
  }

  // ---- validation ----
  async validate(input: unknown): Promise<MfaPolicyDoc> {
    if (!input || typeof input !== 'object') throw new HttpError(400, 'invalid_policy', { detail: 'policy object required' });
    const p = input as Record<string, unknown>;
    if (typeof p.enabled !== 'boolean') throw new HttpError(400, 'invalid_policy', { detail: 'enabled must be true or false' });
    const rawRules = p.rules === undefined ? [] : p.rules;
    if (!Array.isArray(rawRules) || rawRules.length > MAX_RULES) throw new HttpError(400, 'invalid_policy', { detail: `rules must be a list of at most ${MAX_RULES}` });
    const allowed = new Set([...this.assignableRoles(), '*']);
    const seen = new Set<string>();
    const rules: PolicyRule[] = [];
    for (const rr of rawRules) {
      const r = rr as Record<string, unknown>;
      if (!r || typeof r !== 'object') throw new HttpError(400, 'invalid_policy', { detail: 'rule must be an object' });
      const scope = r.scope;
      if (scope !== 'all' && scope !== 'org_type' && scope !== 'org') throw new HttpError(400, 'invalid_policy', { detail: 'scope must be all, org_type or org' });
      let value: string | undefined;
      if (scope === 'org_type') {
        if (typeof r.value !== 'string' || !(ORG_TYPES as readonly string[]).includes(r.value)) throw new HttpError(400, 'invalid_policy', { detail: 'unknown organisation type', allowed: ORG_TYPES });
        value = r.value;
      } else if (scope === 'org') {
        if (typeof r.value !== 'string' || r.value.length > 64) throw new HttpError(400, 'invalid_policy', { detail: 'organisation id required' });
        const o = await this.c.pool.query(`SELECT 1 FROM organizations WHERE org_id = $1`, [r.value]);
        if (!o.rows[0]) throw new HttpError(400, 'invalid_policy', { detail: 'unknown organisation', org: r.value });
        value = r.value;
      }
      if (!Array.isArray(r.roles) || !r.roles.length || r.roles.length > MAX_ROLES) throw new HttpError(400, 'invalid_policy', { detail: 'each rule needs 1 to 30 roles' });
      const roles = [...new Set(r.roles.map(String))];
      for (const role of roles) if (!allowed.has(role)) throw new HttpError(400, 'invalid_policy', { detail: 'unknown role', role });
      const key = `${scope}:${value ?? ''}`;
      if (seen.has(key)) throw new HttpError(400, 'invalid_policy', { detail: 'duplicate rule for the same scope', scope, value });
      seen.add(key);
      rules.push({ scope, ...(value ? { value } : {}), roles: roles.sort() });
    }
    return { enabled: p.enabled, rules };
  }

  // ---- maker-checker ----
  private async changeRow(id: string): Promise<ChangeRow> {
    const r = await this.c.pool.query(`SELECT * FROM mfa_policy_changes WHERE id = $1`, [id]);
    if (!r.rows[0]) throw new HttpError(404, 'not_found');
    return { ...r.rows[0], policy: normalise(r.rows[0].policy), base_version: Number(r.rows[0].base_version) };
  }

  async list(limit = 30): Promise<Array<ChangeRow & { proposed_by_name: string | null; decided_by_name: string | null }>> {
    const r = await this.c.pool.query(
      `SELECT c.*, p.name AS proposed_by_name, d.name AS decided_by_name FROM mfa_policy_changes c
         LEFT JOIN accounts p ON p.sub = c.proposed_by LEFT JOIN accounts d ON d.sub = c.decided_by ORDER BY c.created_at DESC LIMIT $1`, [limit]);
    return r.rows.map((x) => ({ ...x, policy: normalise(x.policy), base_version: Number(x.base_version) }));
  }

  /** A proposal (maker). `direct` (super_admin break-glass) applies at once; the audit trail marks it. */
  async propose(actor: Account, body: Record<string, unknown>): Promise<ChangeRow> {
    const policy = await this.validate(body.policy);
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
    const cur = await this.current();
    if (canon(policy) === canon(cur.policy)) throw new HttpError(409, 'no_change');
    const direct = body.apply === true;
    if (direct && !actor.roles.includes('super_admin')) throw new HttpError(403, 'super_admin_required_for_direct_apply');
    const id = ulid();
    await this.c.pool.query(
      `INSERT INTO mfa_policy_changes (id, proposed_by, policy, note, base_version, status) VALUES ($1,$2,$3,$4,$5,'pending')`,
      [id, actor.sub, JSON.stringify(policy), note || null, cur.version]);
    await this.c.audit.record('mfa.policy.proposed', actor.sub, { change: id, enabled: policy.enabled, rules: policy.rules, base_version: cur.version });
    if (direct) return this.apply(actor, id, true, note);
    return this.changeRow(id);
  }

  async approve(actor: Account, id: string, note?: unknown): Promise<ChangeRow> {
    const ch = await this.changeRow(id);
    if (ch.status !== 'pending') throw new HttpError(409, 'not_pending');
    if (ch.proposed_by === actor.sub) throw new HttpError(403, 'second_person_required');
    return this.apply(actor, id, false, typeof note === 'string' ? note.trim().slice(0, 500) : '');
  }

  private async apply(actor: Account, id: string, direct: boolean, decisionNote: string): Promise<ChangeRow> {
    const ch = await this.changeRow(id);
    const cur = await this.current();
    if (cur.version !== ch.base_version) throw new HttpError(409, 'stale_proposal', { current_version: cur.version, base_version: ch.base_version });
    const c = await this.c.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO mfa_policy (id, policy, version, updated_by, updated_at) VALUES (1, $1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET policy = $1, version = $2, updated_by = $3, updated_at = now()`,
        [JSON.stringify(ch.policy), cur.version + 1, actor.sub]);
      await c.query(
        `UPDATE mfa_policy_changes SET status = 'applied', decided_by = $2, decided_at = now(), decision_note = $3, applied_directly = $4 WHERE id = $1 AND status = 'pending'`,
        [id, actor.sub, decisionNote || null, direct]);
      await c.query('COMMIT');
    } catch (e) { await c.query('ROLLBACK').catch(() => undefined); throw e; } finally { c.release(); }
    await this.c.audit.record(direct ? 'mfa.policy.applied_direct' : 'mfa.policy.applied', actor.sub, {
      change: id, proposed_by: ch.proposed_by, enabled: ch.policy.enabled, rules: ch.policy.rules, version: cur.version + 1, previous_enabled: cur.policy.enabled,
    });
    return this.changeRow(id);
  }

  async reject(actor: Account, id: string, note?: unknown): Promise<ChangeRow> {
    const ch = await this.changeRow(id);
    if (ch.status !== 'pending') throw new HttpError(409, 'not_pending');
    if (ch.proposed_by === actor.sub) throw new HttpError(403, 'use_withdraw');
    await this.c.pool.query(`UPDATE mfa_policy_changes SET status = 'rejected', decided_by = $2, decided_at = now(), decision_note = $3 WHERE id = $1`, [id, actor.sub, typeof note === 'string' ? note.trim().slice(0, 500) || null : null]);
    await this.c.audit.record('mfa.policy.rejected', actor.sub, { change: id, proposed_by: ch.proposed_by });
    return this.changeRow(id);
  }

  async withdraw(actor: Account, id: string): Promise<ChangeRow> {
    const ch = await this.changeRow(id);
    if (ch.status !== 'pending') throw new HttpError(409, 'not_pending');
    if (ch.proposed_by !== actor.sub) throw new HttpError(403, 'only_proposer_can_withdraw');
    await this.c.pool.query(`UPDATE mfa_policy_changes SET status = 'withdrawn', decided_by = $2, decided_at = now() WHERE id = $1`, [id, actor.sub]);
    await this.c.audit.record('mfa.policy.withdrawn', actor.sub, { change: id });
    return this.changeRow(id);
  }

  async orgOptions(): Promise<Array<{ org_id: string; legal_name: string; types: OrgType[] }>> {
    const r = await this.c.pool.query(`SELECT org_id, legal_name, edition, product_refs FROM organizations WHERE status = 'active' ORDER BY legal_name LIMIT 300`);
    return r.rows.map((o) => ({ org_id: o.org_id, legal_name: o.legal_name, types: orgTypesOf(o) }));
  }
}

/** Key-order independent form (jsonb does not keep the key order). */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

function normalise(p: unknown): MfaPolicyDoc {
  const o = (p ?? {}) as Partial<MfaPolicyDoc>;
  return { enabled: o.enabled === true, rules: Array.isArray(o.rules) ? o.rules : [] };
}
