import { ulid } from 'ulid';
import { E164 } from '@kiorex/otp-sender';
import type { Account } from './accounts.js';
import type { OtpService } from './otp.js';
import { HttpError, type Ctx } from './services.js';

export type LinkStatus = 'pending_verification' | 'pending_review' | 'merged' | 'rejected' | 'reversed' | 'cancelled';
export interface Conflict { code: string; severity: 'blocking' | 'info'; detail: Record<string, unknown> }
export interface LinkRequest {
  id: string; primary_sub: string; secondary_sub: string; secondary_phone: string; status: LinkStatus; conflicts: Conflict[];
  resolution: Resolution | null; snapshot: Snapshot | null; requested_at: Date; verified_at: Date | null; reviewed_by: string | null;
  reviewed_at: Date | null; review_note: string | null; merged_at: Date | null; reversed_at: Date | null;
}
export interface Resolution { name?: 'primary' | 'secondary'; membership_roles?: Record<string, string> }
interface Snapshot {
  secondary: { phone: string; name: string | null; status: string; locale: string };
  primaryName: string | null;
  primaryMembershipRoles: Record<string, string>;
  passkeys: string[]; guardianLinks: string[]; memberships: string[]; endedMemberships: string[]; federated: Array<[string, string]>;
}

/**
 * KA-08: account linking with dual verification and a reversible merge workflow with operator review.
 * Dual verification = the primary account is authenticated (its own session) AND the secondary's verified phone proves possession
 * via OTP. A merge is NEVER automatic: even with zero conflicts an ops reviewer (with MFA step-up) must approve. Conflicts block
 * approval until the reviewer supplies an explicit resolution. Only identity data moves; products merge their own patient records
 * separately (KX-04 section 01), so this never touches clinical data.
 */
export class AccountLinking {
  constructor(private readonly c: Ctx, private readonly otp: OtpService) {}

  async request(primary: Account, body: Record<string, unknown>, ip: string): Promise<{ id: string; status: LinkStatus }> {
    if (primary.kind !== 'person') throw new HttpError(403, 'not_a_login_account');
    const phone = typeof body.phone === 'string' ? body.phone.replace(/[\s-]/g, '') : '';
    if (!E164.test(phone)) throw new HttpError(400, 'invalid_phone');
    const secondary = await this.c.accounts.findByPhone(phone);
    if (!secondary || secondary.kind !== 'person') throw new HttpError(404, 'account_not_found');
    if (secondary.sub === primary.sub) throw new HttpError(400, 'cannot_link_to_self');
    const open = await this.c.pool.query(`SELECT count(*)::int AS n FROM link_requests WHERE primary_sub=$1 AND status IN ('pending_verification','pending_review')`, [primary.sub]);
    if (open.rows[0].n >= 3) throw new HttpError(429, 'too_many_open_requests');
    const dup = await this.c.pool.query(`SELECT 1 FROM link_requests WHERE primary_sub=$1 AND secondary_sub=$2 AND status IN ('pending_verification','pending_review')`, [primary.sub, secondary.sub]);
    if (dup.rows[0]) throw new HttpError(409, 'request_exists');
    const id = ulid();
    const sent = await this.otp.send({ interactionUid: `link:${id}`, phone, ip, locale: secondary.locale, name: null });
    if (!sent.ok) throw new HttpError(sent.reason === 'send_failed' ? 502 : 429, sent.reason, sent.retryAfterSeconds ? { retry_after: sent.retryAfterSeconds } : {});
    await this.c.pool.query(`INSERT INTO link_requests (id, primary_sub, secondary_sub, secondary_phone, status) VALUES ($1,$2,$3,$4,'pending_verification')`, [id, primary.sub, secondary.sub, phone]);
    await this.c.audit.record('account.link.requested', primary.sub, { link: id, secondary: secondary.sub });
    return { id, status: 'pending_verification' };
  }

  async get(id: string): Promise<LinkRequest> {
    const r = await this.c.pool.query(`SELECT * FROM link_requests WHERE id=$1`, [id]);
    if (!r.rows[0]) throw new HttpError(404, 'link_not_found');
    return r.rows[0];
  }

  async verify(primary: Account, id: string, code: unknown): Promise<LinkRequest> {
    const l = await this.get(id);
    if (l.primary_sub !== primary.sub) throw new HttpError(404, 'link_not_found');
    if (l.status !== 'pending_verification') throw new HttpError(409, 'wrong_state', { status: l.status });
    const r = await this.otp.verify(`link:${id}`, String(code ?? ''));
    if (!r.ok) throw new HttpError(r.reason === 'locked' ? 429 : 400, `otp_${r.reason}`, r.attemptsLeft !== undefined ? { attempts_left: r.attemptsLeft } : {});
    const secondary = await this.c.accounts.findBySub(l.secondary_sub);
    if (!secondary) throw new HttpError(409, 'secondary_unavailable');
    const conflicts = await this.detectConflicts(primary, secondary);
    await this.c.pool.query(`UPDATE link_requests SET status='pending_review', conflicts=$2, verified_at=now() WHERE id=$1`, [id, JSON.stringify(conflicts)]);
    await this.c.audit.record('account.link.verified', primary.sub, { link: id, conflicts: conflicts.map((x) => x.code) });
    return this.get(id);
  }

  async cancel(primary: Account, id: string): Promise<void> {
    const r = await this.c.pool.query(`UPDATE link_requests SET status='cancelled' WHERE id=$1 AND primary_sub=$2 AND status IN ('pending_verification','pending_review')`, [id, primary.sub]);
    if (!r.rowCount) throw new HttpError(404, 'link_not_found');
  }

  async listFor(sub: string) {
    const r = await this.c.pool.query(`SELECT * FROM link_requests WHERE primary_sub=$1 ORDER BY requested_at DESC`, [sub]);
    return r.rows.map((l: LinkRequest) => this.view(l));
  }

  view(l: LinkRequest) {
    return { link_id: l.id, status: l.status, primary_sub: l.primary_sub, secondary_sub: l.secondary_sub, conflicts: l.conflicts, resolution: l.resolution,
      requested_at: l.requested_at, verified_at: l.verified_at, reviewed_by: l.reviewed_by, reviewed_at: l.reviewed_at, review_note: l.review_note, merged_at: l.merged_at, reversed_at: l.reversed_at };
  }

  async detectConflicts(p: Account, s: Account): Promise<Conflict[]> {
    const out: Conflict[] = [];
    const priv = this.c.cfg.mfaPolicy.requiredForRoles;
    if (p.name && s.name && p.name.trim().toLowerCase() !== s.name.trim().toLowerCase()) out.push({ code: 'name_mismatch', severity: 'blocking', detail: { primary: p.name, secondary: s.name } });
    if (p.locale !== s.locale) out.push({ code: 'locale_mismatch', severity: 'info', detail: { primary: p.locale, secondary: s.locale } });
    const sp = s.roles.filter((r) => priv.includes(r)); const pp = p.roles.filter((r) => priv.includes(r));
    if (sp.length) out.push({ code: 'privileged_role_on_secondary', severity: 'info', detail: { roles: sp, note: 'privileged roles are never carried over by a merge' } });
    if (pp.length) out.push({ code: 'privileged_role_on_primary', severity: 'info', detail: { roles: pp } });
    const gl = async (sub: string) => (await this.c.pool.query(`SELECT count(*)::int AS n FROM guardian_links WHERE guardian_sub=$1 AND status IN ('active','pending')`, [sub])).rows[0].n as number;
    const [gp, gs] = [await gl(p.sub), await gl(s.sub)];
    if (gp > 0 && gs > 0) out.push({ code: 'guardian_links_on_both', severity: 'info', detail: { primary: gp, secondary: gs } });
    const m = await this.c.pool.query(
      `SELECT a.org_id, a.role_hint AS primary_role, b.role_hint AS secondary_role FROM memberships a JOIN memberships b ON a.org_id=b.org_id
        WHERE a.sub=$1 AND b.sub=$2 AND a.status='active' AND b.status='active' AND a.role_hint <> b.role_hint`, [p.sub, s.sub]);
    for (const row of m.rows) out.push({ code: 'membership_role_conflict', severity: 'blocking', detail: { org_id: row.org_id, primary_role: row.primary_role, secondary_role: row.secondary_role } });
    const t = await this.c.pool.query(`SELECT count(*)::int AS n FROM totp_credentials WHERE sub = ANY($1) AND confirmed_at IS NOT NULL`, [[p.sub, s.sub]]);
    if (t.rows[0].n > 1) out.push({ code: 'totp_on_both', severity: 'info', detail: { note: 'primary TOTP is kept; secondary TOTP is not merged' } });
    return out;
  }

  // ---------------- operator review ----------------
  async queue(status: string) {
    const r = await this.c.pool.query(`SELECT * FROM link_requests WHERE status=$1 ORDER BY requested_at`, [status]);
    return r.rows.map((l: LinkRequest) => this.view(l));
  }

  private checkReviewer(reviewer: Account, l: LinkRequest): void {
    if (reviewer.sub === l.primary_sub || reviewer.sub === l.secondary_sub) throw new HttpError(403, 'reviewer_must_be_independent');
  }

  async reject(reviewer: Account, id: string, note: unknown): Promise<LinkRequest> {
    const l = await this.get(id);
    this.checkReviewer(reviewer, l);
    const r = await this.c.pool.query(`UPDATE link_requests SET status='rejected', reviewed_by=$2, reviewed_at=now(), review_note=$3 WHERE id=$1 AND status='pending_review' RETURNING id`, [id, reviewer.sub, typeof note === 'string' ? note.slice(0, 500) : null]);
    if (!r.rowCount) throw new HttpError(409, 'wrong_state', { status: l.status });
    await this.c.audit.record('account.link.rejected', reviewer.sub, { link: id });
    return this.get(id);
  }

  private validateResolution(l: LinkRequest, res: Resolution): void {
    const missing: string[] = [];
    for (const cf of l.conflicts.filter((x) => x.severity === 'blocking')) {
      if (cf.code === 'name_mismatch' && res.name !== 'primary' && res.name !== 'secondary') missing.push('name');
      if (cf.code === 'membership_role_conflict') {
        const org = String(cf.detail.org_id);
        const chosen = res.membership_roles?.[org];
        if (chosen !== cf.detail.primary_role && chosen !== cf.detail.secondary_role) missing.push(`membership_roles.${org}`);
      }
    }
    if (missing.length) throw new HttpError(409, 'resolution_required', { missing });
  }

  async approve(reviewer: Account, id: string, resolutionIn: unknown, note: unknown): Promise<LinkRequest> {
    const l = await this.get(id);
    this.checkReviewer(reviewer, l);
    if (l.status !== 'pending_review') throw new HttpError(409, 'wrong_state', { status: l.status });
    const res = (resolutionIn && typeof resolutionIn === 'object' ? resolutionIn : {}) as Resolution;
    this.validateResolution(l, res);
    const [p, s] = [await this.c.accounts.findBySub(l.primary_sub), await this.c.accounts.findBySub(l.secondary_sub)];
    if (!p || !s) throw new HttpError(409, 'account_unavailable');

    const client = await this.c.pool.connect();
    const snap: Snapshot = { secondary: { phone: s.phone ?? l.secondary_phone, name: s.name, status: s.status, locale: s.locale }, primaryName: p.name, primaryMembershipRoles: {}, passkeys: [], guardianLinks: [], memberships: [], endedMemberships: [], federated: [] };
    try {
      await client.query('BEGIN');
      const lock = await client.query(`SELECT status FROM link_requests WHERE id=$1 FOR UPDATE`, [id]);
      if (lock.rows[0]?.status !== 'pending_review') throw new HttpError(409, 'wrong_state');
      await client.query(`INSERT INTO account_contacts (sub, type, value, source) VALUES ($1,'phone',$2,$3)`, [p.sub, snap.secondary.phone, `merge:${id}`]);
      await client.query(`UPDATE accounts SET phone=NULL, status='merged', merged_into=$2 WHERE sub=$1`, [s.sub, p.sub]);
      snap.passkeys = (await client.query(`UPDATE passkeys SET sub=$2 WHERE sub=$1 RETURNING credential_id`, [s.sub, p.sub])).rows.map((x) => x.credential_id);
      snap.guardianLinks = (await client.query(`UPDATE guardian_links SET guardian_sub=$2 WHERE guardian_sub=$1 AND status IN ('active','pending') AND dependant_sub NOT IN (SELECT dependant_sub FROM guardian_links WHERE guardian_sub=$2 AND status IN ('active','pending')) RETURNING id`, [s.sub, p.sub])).rows.map((x) => x.id);
      snap.federated = (await client.query(`UPDATE federated_identities SET sub=$2 WHERE sub=$1 RETURNING upstream_id, upstream_sub`, [s.sub, p.sub])).rows.map((x) => [x.upstream_id, x.upstream_sub] as [string, string]);
      // memberships: overlapping orgs keep one row (reviewer's chosen role), others move
      for (const [orgId, role] of Object.entries(res.membership_roles ?? {})) {
        const prev = await client.query(`SELECT role_hint FROM memberships WHERE sub=$1 AND org_id=$2 AND status='active'`, [p.sub, orgId]);
        if (prev.rows[0]) snap.primaryMembershipRoles[orgId] = prev.rows[0].role_hint;
        await client.query(`UPDATE memberships SET role_hint=$3 WHERE sub=$1 AND org_id=$2 AND status='active'`, [p.sub, orgId, role]);
      }
      snap.endedMemberships = (await client.query(
        `UPDATE memberships SET status='merged', ended_at=now() WHERE sub=$1 AND status='active' AND org_id IN (SELECT org_id FROM memberships WHERE sub=$2 AND status='active') RETURNING id`, [s.sub, p.sub])).rows.map((x) => x.id);
      snap.memberships = (await client.query(`UPDATE memberships SET sub=$2 WHERE sub=$1 AND status='active' RETURNING id`, [s.sub, p.sub])).rows.map((x) => x.id);
      if (res.name === 'secondary' && s.name) await client.query(`UPDATE accounts SET name=$2 WHERE sub=$1`, [p.sub, s.name]);
      await client.query(`UPDATE link_requests SET status='merged', resolution=$2, snapshot=$3, reviewed_by=$4, reviewed_at=now(), review_note=$5, merged_at=now() WHERE id=$1`,
        [id, JSON.stringify(res), JSON.stringify(snap), reviewer.sub, typeof note === 'string' ? note.slice(0, 500) : null]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally { client.release(); }

    await this.c.hooks.revokeSessions(s.sub);
    await this.c.events.emit('account.merged', 'Account', p.sub, { linkId: id, primarySub: p.sub, mergedSub: s.sub, change: 'merged', reversible: true, at: new Date().toISOString() });
    await this.c.audit.record('account.link.merged', reviewer.sub, { link: id, primary: p.sub, secondary: s.sub, resolution: res });
    if (p.phone) await this.c.notifier.send(p.phone, 'account_merge_completed', p.locale, {}, { link: id });
    return this.get(id);
  }

  async reverse(reviewer: Account, id: string, note: unknown): Promise<LinkRequest> {
    const l = await this.get(id);
    this.checkReviewer(reviewer, l);
    if (l.status !== 'merged' || !l.snapshot) throw new HttpError(409, 'wrong_state', { status: l.status });
    const snap = l.snapshot;
    const client = await this.c.pool.connect();
    try {
      await client.query('BEGIN');
      const lock = await client.query(`SELECT status FROM link_requests WHERE id=$1 FOR UPDATE`, [id]);
      if (lock.rows[0]?.status !== 'merged') throw new HttpError(409, 'wrong_state');
      await client.query(`DELETE FROM account_contacts WHERE type='phone' AND value=$1 AND source=$2`, [snap.secondary.phone, `merge:${id}`]);
      await client.query(`UPDATE accounts SET phone=$2, status=$3, merged_into=NULL WHERE sub=$1`, [l.secondary_sub, snap.secondary.phone, snap.secondary.status]);
      if (snap.passkeys.length) await client.query(`UPDATE passkeys SET sub=$1 WHERE credential_id = ANY($2)`, [l.secondary_sub, snap.passkeys]);
      if (snap.guardianLinks.length) await client.query(`UPDATE guardian_links SET guardian_sub=$1 WHERE id = ANY($2)`, [l.secondary_sub, snap.guardianLinks]);
      for (const [up, us] of snap.federated) await client.query(`UPDATE federated_identities SET sub=$1 WHERE upstream_id=$2 AND upstream_sub=$3`, [l.secondary_sub, up, us]);
      if (snap.memberships.length) await client.query(`UPDATE memberships SET sub=$1 WHERE id = ANY($2)`, [l.secondary_sub, snap.memberships]);
      if (snap.endedMemberships.length) await client.query(`UPDATE memberships SET status='active', ended_at=NULL WHERE id = ANY($1)`, [snap.endedMemberships]);
      for (const [orgId, role] of Object.entries(snap.primaryMembershipRoles ?? {})) {
        await client.query(`UPDATE memberships SET role_hint=$3 WHERE sub=$1 AND org_id=$2 AND status='active'`, [l.primary_sub, orgId, role]);
      }
      await client.query(`UPDATE accounts SET name=$2 WHERE sub=$1`, [l.primary_sub, snap.primaryName]);
      await client.query(`UPDATE link_requests SET status='reversed', reversed_at=now(), review_note=COALESCE($2, review_note) WHERE id=$1`, [id, typeof note === 'string' ? note.slice(0, 500) : null]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally { client.release(); }
    await this.c.events.emit('account.merged', 'Account', l.primary_sub, { linkId: id, primarySub: l.primary_sub, mergedSub: l.secondary_sub, change: 'reversed', reversible: false, at: new Date().toISOString() });
    await this.c.audit.record('account.link.reversed', reviewer.sub, { link: id });
    return this.get(id);
  }
}
