import { ulid } from 'ulid';
import type { Account } from './accounts.js';
import { HttpError, type Ctx } from './services.js';
import { signAccessToken } from './tokens.js';
import { E164 } from '@kiorex/otp-sender';

export const RELATIONSHIPS = ['parent', 'legal_guardian', 'grandparent', 'other_relative'] as const;
const NATIONAL_ID_LIKE = /^\d{14}$/; // Egyptian national ID shape: never stored in identity (ADR-013)

export interface GuardianLink {
  id: string; guardian_sub: string; dependant_sub: string; relationship: string; evidence: { type: string; reference?: string };
  status: 'pending' | 'active' | 'revoked' | 'expired'; expires_at: Date; created_at: Date; ended_at: Date | null; ended_reason: string | null;
}

/** KA-06: guardian <-> dependant links with evidence and automatic expiry at the age of majority. */
export class Guardianship {
  constructor(private readonly c: Ctx) {}

  ageOfMajority(market: string): number {
    const m = this.c.cfg.guardianship.ageOfMajority;
    return m[market] ?? m.default ?? 18;
  }

  /** The instant a dependant born on `dob` reaches the age of majority (00:00 UTC on the birthday). */
  expiryFor(dob: string, market: string): Date {
    const [y, mo, d] = dob.split('-').map(Number);
    return new Date(Date.UTC(y + this.ageOfMajority(market), mo - 1, d));
  }

  private parseDob(dob: unknown): string {
    if (typeof dob !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dob) || Number.isNaN(Date.parse(dob))) throw new HttpError(400, 'invalid_dob');
    const t = Date.parse(`${dob}T00:00:00Z`);
    if (t > this.c.now() * 1000) throw new HttpError(400, 'dob_in_future');
    if (new Date(t).getUTCFullYear() < 1900) throw new HttpError(400, 'invalid_dob');
    return dob;
  }

  private parseEvidence(e: unknown): { type: string; reference?: string } {
    const ev = (e ?? {}) as { type?: unknown; reference?: unknown };
    if (typeof ev.type !== 'string' || !this.c.cfg.guardianship.evidenceTypes.includes(ev.type)) throw new HttpError(400, 'invalid_evidence_type', { allowed: this.c.cfg.guardianship.evidenceTypes });
    if (ev.reference !== undefined) {
      if (typeof ev.reference !== 'string' || ev.reference.length > 64 || NATIONAL_ID_LIKE.test(ev.reference.replace(/\s/g, ''))) {
        throw new HttpError(400, 'invalid_evidence_reference', { hint: 'opaque document reference only; never a national ID number' });
      }
    }
    if (ev.type !== 'self_declared' && !ev.reference) throw new HttpError(400, 'evidence_reference_required');
    return { type: ev.type, ...(ev.reference ? { reference: ev.reference } : {}) };
  }

  private parseRelationship(r: unknown): string {
    if (typeof r !== 'string' || !(RELATIONSHIPS as readonly string[]).includes(r)) throw new HttpError(400, 'invalid_relationship', { allowed: RELATIONSHIPS });
    return r;
  }

  private assertGuardian(g: Account): void {
    if (g.kind !== 'person' || !g.phone_verified) throw new HttpError(403, 'guardian_must_be_verified_adult_account');
  }

  /** Lazily ends links whose age-of-majority expiry has passed; emits events and notifies the guardian. Idempotent. */
  async expireDue(): Promise<number> {
    const r = await this.c.pool.query(
      `UPDATE guardian_links SET status='expired', ended_at=now(), ended_reason='age_of_majority'
        WHERE status IN ('active','pending') AND expires_at <= $1 RETURNING *`, [new Date(this.c.now() * 1000)]);
    for (const l of r.rows as GuardianLink[]) await this.afterEnd(l, 'expired', 'age_of_majority');
    return r.rowCount ?? 0;
  }

  private async afterEnd(l: GuardianLink, change: 'revoked' | 'expired', reason: string): Promise<void> {
    await this.c.events.emit('guardian.link.changed', 'GuardianLink', l.id, {
      linkId: l.id, guardianSub: l.guardian_sub, dependantSub: l.dependant_sub, change, reason, effectiveAt: new Date().toISOString(),
    });
    await this.c.audit.record(`guardian.link.${change}`, l.guardian_sub, { link: l.id, dependant: l.dependant_sub, reason });
    const g = await this.c.accounts.findBySub(l.guardian_sub);
    const dep = await this.c.accounts.findAnyBySub(l.dependant_sub);
    if (g?.phone) await this.c.notifier.send(g.phone, 'guardian_link_ended', g.locale, { dependant: dep?.name ?? 'dependant', reason }, { link: l.id });
  }

  async createDependant(guardian: Account, body: Record<string, unknown>): Promise<{ dependant: Account; link: GuardianLink }> {
    await this.expireDue();
    this.assertGuardian(guardian);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 80) throw new HttpError(400, 'invalid_name');
    const dob = this.parseDob(body.dob);
    const relationship = this.parseRelationship(body.relationship);
    const evidence = this.parseEvidence(body.evidence);
    const market = typeof body.market === 'string' && this.c.cfg.guardianship.ageOfMajority[body.market] !== undefined ? body.market : this.c.cfg.guardianship.defaultMarket;
    const expires = this.expiryFor(dob, market);
    if (expires.getTime() <= this.c.now() * 1000) throw new HttpError(422, 'already_adult', { age_of_majority: this.ageOfMajority(market) });
    const count = (await this.c.pool.query(`SELECT count(*)::int AS n FROM guardian_links WHERE guardian_sub=$1 AND status IN ('active','pending')`, [guardian.sub])).rows[0].n as number;
    if (count >= this.c.cfg.guardianship.maxDependantsPerGuardian) throw new HttpError(409, 'too_many_dependants');
    const dependant = await this.c.accounts.createDependant(name, dob, body.locale === 'ar' ? 'ar' : guardian.locale, market);
    const link = await this.insertLink(guardian.sub, dependant.sub, relationship, evidence, expires, 'active');
    await this.announce(link, 'created', guardian, dependant);
    return { dependant, link };
  }

  private async insertLink(guardianSub: string, dependantSub: string, relationship: string, evidence: object, expires: Date, status: 'active' | 'pending'): Promise<GuardianLink> {
    const id = ulid();
    const r = await this.c.pool.query(
      `INSERT INTO guardian_links (id, guardian_sub, dependant_sub, relationship, evidence, status, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [id, guardianSub, dependantSub, relationship, JSON.stringify(evidence), status, expires]);
    return r.rows[0];
  }

  private async announce(l: GuardianLink, change: 'created' | 'activated', guardian: Account, dependant: Account): Promise<void> {
    await this.c.events.emit('guardian.link.changed', 'GuardianLink', l.id, {
      linkId: l.id, guardianSub: l.guardian_sub, dependantSub: l.dependant_sub, change, relationship: l.relationship,
      evidenceType: l.evidence.type, expiresAt: l.expires_at.toISOString(), effectiveAt: new Date().toISOString(),
    });
    await this.c.audit.record(`guardian.link.${change}`, l.guardian_sub, { link: l.id, dependant: l.dependant_sub, evidence: l.evidence.type });
    if (guardian.phone) await this.c.notifier.send(guardian.phone, 'guardian_link_created', guardian.locale, { guardian: guardian.name ?? 'Guardian', dependant: dependant.name ?? 'dependant' }, { link: l.id });
  }

  /** An existing guardian proposes a co-guardian by verified phone; the invitee must accept (pending until then). */
  async inviteCoGuardian(guardian: Account, dependantSub: string, body: Record<string, unknown>): Promise<GuardianLink> {
    await this.expireDue();
    const mine = await this.activeLink(guardian.sub, dependantSub);
    const phone = typeof body.phone === 'string' ? body.phone.replace(/[\s-]/g, '') : '';
    if (!E164.test(phone)) throw new HttpError(400, 'invalid_phone');
    const other = await this.c.accounts.findByPhone(phone);
    if (!other || other.kind !== 'person') throw new HttpError(404, 'guardian_account_not_found');
    if (other.sub === guardian.sub) throw new HttpError(400, 'cannot_invite_self');
    const dup = await this.c.pool.query(`SELECT 1 FROM guardian_links WHERE guardian_sub=$1 AND dependant_sub=$2 AND status IN ('active','pending')`, [other.sub, dependantSub]);
    if (dup.rows[0]) throw new HttpError(409, 'link_exists');
    const link = await this.insertLink(other.sub, dependantSub, this.parseRelationship(body.relationship), this.parseEvidence(body.evidence), mine.expires_at, 'pending');
    await this.c.audit.record('guardian.link.invited', guardian.sub, { link: link.id, invitee: other.sub, dependant: dependantSub });
    return link;
  }

  async accept(guardian: Account, linkId: string): Promise<GuardianLink> {
    await this.expireDue();
    const r = await this.c.pool.query(`UPDATE guardian_links SET status='active' WHERE id=$1 AND guardian_sub=$2 AND status='pending' AND expires_at > $3 RETURNING *`, [linkId, guardian.sub, new Date(this.c.now() * 1000)]);
    const l = r.rows[0] as GuardianLink | undefined;
    if (!l) throw new HttpError(404, 'link_not_found');
    const dep = await this.c.accounts.findAnyBySub(l.dependant_sub);
    await this.announce(l, 'activated', guardian, dep!);
    return l;
  }

  async activeLink(guardianSub: string, dependantSub: string): Promise<GuardianLink> {
    const r = await this.c.pool.query(
      `SELECT * FROM guardian_links WHERE guardian_sub=$1 AND dependant_sub=$2 AND status='active' AND expires_at > $3`, [guardianSub, dependantSub, new Date(this.c.now() * 1000)]);
    if (!r.rows[0]) throw new HttpError(403, 'no_active_guardian_link');
    return r.rows[0];
  }

  async list(guardianSub: string) {
    await this.expireDue();
    const r = await this.c.pool.query(
      `SELECT l.*, a.name AS dependant_name, a.dob, a.market FROM guardian_links l JOIN accounts a ON a.sub=l.dependant_sub
        WHERE l.guardian_sub=$1 ORDER BY l.created_at DESC`, [guardianSub]);
    return r.rows.map((l) => ({
      link_id: l.id, dependant_sub: l.dependant_sub, name: l.dependant_name, dob: typeof l.dob === 'string' ? l.dob : new Date(l.dob).toISOString().slice(0, 10),
      relationship: l.relationship, evidence_type: l.evidence.type, status: l.status, expires_at: l.expires_at, ended_reason: l.ended_reason,
    }));
  }

  async revoke(guardianSub: string, dependantSub: string): Promise<GuardianLink> {
    const r = await this.c.pool.query(
      `UPDATE guardian_links SET status='revoked', ended_at=now(), ended_reason='revoked_by_guardian' WHERE guardian_sub=$1 AND dependant_sub=$2 AND status IN ('active','pending') RETURNING *`, [guardianSub, dependantSub]);
    const l = r.rows[0] as GuardianLink | undefined;
    if (!l) throw new HttpError(404, 'link_not_found');
    await this.afterEnd(l, 'revoked', 'revoked_by_guardian');
    return l;
  }

  /** Ends all links of a deleted guardian (KA-07 interplay). */
  async endAllFor(guardianSub: string): Promise<void> {
    const r = await this.c.pool.query(`UPDATE guardian_links SET status='revoked', ended_at=now(), ended_reason='guardian_deleted' WHERE guardian_sub=$1 AND status IN ('active','pending') RETURNING *`, [guardianSub]);
    for (const l of r.rows as GuardianLink[]) {
      await this.c.events.emit('guardian.link.changed', 'GuardianLink', l.id, { linkId: l.id, guardianSub: l.guardian_sub, dependantSub: l.dependant_sub, change: 'revoked', reason: 'guardian_deleted', effectiveAt: new Date().toISOString() });
    }
  }

  /**
   * Guardian acting-as token (RFC 8693 style actor claim): sub = dependant, act.sub = guardian, narrow scopes, <= 10 min and never
   * past the link's age-of-majority expiry. Bound to the guardian's sid so session revocation / back-channel logout covers it.
   * Carries identity-level claims only (ADR-013): no phone, no roles beyond patient, no clinical data.
   */
  async actAs(caller: { sub: string; sid: string; clientId: string; acr?: string; amr?: string[] }, dependantSub: string, scopes?: unknown): Promise<{ access_token: string; expires_in: number; scope: string; link_id: string }> {
    await this.expireDue();
    const link = await this.activeLink(caller.sub, dependantSub);
    const allowed = this.c.cfg.guardianship.actScopes;
    let granted = allowed;
    if (scopes !== undefined) {
      if (!Array.isArray(scopes) || scopes.some((s) => typeof s !== 'string' || !allowed.includes(s))) throw new HttpError(400, 'invalid_scope', { allowed });
      granted = scopes as string[];
      if (granted.length === 0) throw new HttpError(400, 'invalid_scope', { allowed });
    }
    const dep = await this.c.accounts.findBySub(dependantSub);
    if (!dep) throw new HttpError(404, 'dependant_not_found');
    const untilExpiry = Math.floor((link.expires_at.getTime() - this.c.now() * 1000) / 1000);
    const ttl = Math.max(1, Math.min(this.c.cfg.guardianship.scopedTokenSeconds, untilExpiry));
    const claims: Record<string, unknown> = {
      sub: dep.sub, client_id: caller.clientId, sid: caller.sid, scope: granted.join(' '), act: { sub: caller.sub },
      locale: dep.locale, kx_roles: ['patient'],
      ...(dep.name ? { name: dep.name } : {}), ...(caller.acr ? { acr: caller.acr } : {}), ...(caller.amr ? { amr: caller.amr } : {}),
    };
    const token = await signAccessToken(this.c.key, this.c.issuer, this.c.cfg.defaultAudience, claims, ttl, this.c.now());
    await this.c.audit.record('guardian.act_as', caller.sub, { link: link.id, dependant: dep.sub, scope: granted, ttl });
    return { access_token: token, expires_in: ttl, scope: granted.join(' '), link_id: link.id };
  }
}
