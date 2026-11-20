import { createHash, randomBytes } from 'node:crypto';
import { ulid } from 'ulid';
import { E164 } from '@kiorex/otp-sender';
import type { Account } from './accounts.js';
import { HttpError, type Ctx } from './services.js';

const COUNTRY = /^[A-Z]{2}$/;
const MANAGER_HINTS = ['owner', 'admin'];

/**
 * KA-09: organisations and memberships as identity-level assertions (ADR-013). A membership is a HINT (org_id + role hint); the
 * product decides permissions. Nothing here (fields, claims, events, invitations) may carry clinical data; free-text is limited to
 * the legal name and strictly whitelisted fields. Invitations are single-use, expire after 7 days and are bound to the invitee's
 * verified phone.
 */
export class Orgs {
  constructor(private readonly c: Ctx) {}

  private hint(v: unknown): string {
    if (typeof v !== 'string' || !this.c.cfg.orgs.roleHints.includes(v)) throw new HttpError(400, 'invalid_role_hint', { allowed: this.c.cfg.orgs.roleHints });
    return v;
  }
  private edition(v: unknown): string {
    if (v === undefined || v === null || v === '') return this.c.cfg.orgs.defaultEdition;
    if (typeof v !== 'string' || !this.c.cfg.orgs.editions.includes(v.toUpperCase())) throw new HttpError(400, 'invalid_edition', { allowed: this.c.cfg.orgs.editions });
    return v.toUpperCase();
  }
  private tokenHash = (t: string) => createHash('sha256').update(t).digest('hex');

  async create(owner: Account, body: Record<string, unknown>) {
    if (owner.kind !== 'person') throw new HttpError(403, 'not_a_login_account');
    const legal = typeof body.legal_name === 'string' ? body.legal_name.trim() : '';
    if (!legal || legal.length > 120) throw new HttpError(400, 'invalid_legal_name');
    const country = typeof body.country === 'string' ? body.country.toUpperCase() : '';
    if (!COUNTRY.test(country)) throw new HttpError(400, 'invalid_country');
    const refs: Record<string, string> = {};
    for (const [k, v] of Object.entries((body.product_refs ?? {}) as Record<string, unknown>)) {
      if (!this.c.cfg.orgs.productRefKeys.includes(k) || typeof v !== 'string' || v.length > 64) throw new HttpError(400, 'invalid_product_ref', { allowed: this.c.cfg.orgs.productRefKeys });
      refs[k] = v;
    }
    const edition = this.edition(body.edition); // KA-14: display hint only (ADR-031); never a token claim
    const orgId = ulid();
    await this.c.pool.query(`INSERT INTO organizations (org_id, legal_name, country, product_refs, edition, created_by) VALUES ($1,$2,$3,$4,$5,$6)`, [orgId, legal, country, JSON.stringify(refs), edition, owner.sub]);
    const m = await this.addMembership(orgId, owner.sub, 'owner', null);
    await this.c.audit.record('org.created', owner.sub, { org: orgId, edition });
    return { org_id: orgId, legal_name: legal, country, edition, product_refs: refs, membership_id: m };
  }

  private async addMembership(orgId: string, sub: string, role: string, invitedBy: string | null): Promise<string> {
    const id = ulid();
    const dup = await this.c.pool.query(`SELECT 1 FROM memberships WHERE org_id=$1 AND sub=$2 AND status='active'`, [orgId, sub]);
    if (dup.rows[0]) throw new HttpError(409, 'already_member');
    await this.c.pool.query(`INSERT INTO memberships (id, org_id, sub, role_hint, invited_by, effective_from) VALUES ($1,$2,$3,$4,$5,$6)`, [id, orgId, sub, role, invitedBy, new Date(this.c.now() * 1000)]);
    await this.emit(orgId, sub, role, 'added');
    return id;
  }

  private async emit(orgId: string, sub: string, role: string, change: 'added' | 'removed' | 'role_changed'): Promise<void> {
    await this.c.events.emit('membership.changed', 'Membership', `${orgId}:${sub}`, { orgId, sub, roleHint: role, change, at: new Date().toISOString() });
  }

  /** Active, unexpired memberships for token claims `kx_orgs` (hints only). */
  async claimsFor(sub: string): Promise<Array<{ org_id: string; role_hint: string }>> {
    const r = await this.c.pool.query(
      `SELECT m.org_id, m.role_hint FROM memberships m JOIN organizations o ON o.org_id=m.org_id
        WHERE m.sub=$1 AND m.status='active' AND o.status='active' AND m.effective_from <= $2 AND (m.expires_at IS NULL OR m.expires_at > $2) ORDER BY m.created_at`,
      [sub, new Date(this.c.now() * 1000)]);
    return r.rows;
  }

  async mine(sub: string) {
    const r = await this.c.pool.query(
      `SELECT o.org_id, o.legal_name, o.country, o.edition, o.product_refs, m.id AS membership_id, m.role_hint, m.status, m.effective_from, m.expires_at
         FROM memberships m JOIN organizations o ON o.org_id=m.org_id WHERE m.sub=$1 ORDER BY m.created_at`, [sub]);
    return r.rows;
  }

  private async myRole(orgId: string, sub: string): Promise<string> {
    const r = await this.c.pool.query(`SELECT role_hint FROM memberships WHERE org_id=$1 AND sub=$2 AND status='active'`, [orgId, sub]);
    if (!r.rows[0]) throw new HttpError(404, 'org_not_found'); // do not reveal orgs to non-members
    return r.rows[0].role_hint;
  }
  private async requireManager(orgId: string, sub: string): Promise<string> {
    const role = await this.myRole(orgId, sub);
    if (!MANAGER_HINTS.includes(role)) throw new HttpError(403, 'insufficient_membership');
    return role;
  }

  async members(orgId: string, sub: string) {
    await this.requireManager(orgId, sub);
    const r = await this.c.pool.query(`SELECT m.id AS membership_id, m.sub, a.name, m.role_hint, m.status, m.effective_from, m.expires_at FROM memberships m JOIN accounts a ON a.sub=m.sub WHERE m.org_id=$1 ORDER BY m.created_at`, [orgId]);
    return r.rows;
  }

  async invite(inviter: Account, orgId: string, body: Record<string, unknown>) {
    const myRole = await this.requireManager(orgId, inviter.sub);
    const role = this.hint(body.role_hint);
    if (role === 'owner' && myRole !== 'owner') throw new HttpError(403, 'only_owner_can_invite_owner');
    const phone = typeof body.phone === 'string' ? body.phone.replace(/[\s-]/g, '') : '';
    if (!E164.test(phone)) throw new HttpError(400, 'invalid_phone');
    const org = (await this.c.pool.query(`SELECT legal_name FROM organizations WHERE org_id=$1`, [orgId])).rows[0];
    const token = randomBytes(24).toString('base64url');
    const id = ulid();
    const days = this.c.cfg.orgs.invitationTtlDays;
    const expires = new Date(this.c.now() * 1000 + days * 86400_000);
    await this.c.pool.query(`INSERT INTO invitations (id, org_id, role_hint, invitee_phone, token_hash, invited_by, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, orgId, role, phone, this.tokenHash(token), inviter.sub, expires]);
    await this.c.notifier.send(phone, 'org_invitation', typeof body.locale === 'string' && body.locale === 'ar' ? 'ar' : 'en',
      { org: org.legal_name, role, token, days: String(days) }, { invitation_id: id, org_id: orgId, token });
    await this.c.audit.record('org.invitation.created', inviter.sub, { org: orgId, invitation: id, role });
    return { invitation_id: id, expires_at: expires.toISOString(), delivered_via: 'whatsapp(mock)' };
  }

  async accept(user: Account, token: unknown) {
    if (typeof token !== 'string' || token.length < 16) throw new HttpError(400, 'invalid_token');
    const now = new Date(this.c.now() * 1000);
    const row = (await this.c.pool.query(`SELECT * FROM invitations WHERE token_hash=$1`, [this.tokenHash(token)])).rows[0] as
      undefined | { id: string; org_id: string; role_hint: string; invitee_phone: string; invited_by: string; expires_at: Date; consumed_at: Date | null; revoked_at: Date | null };
    if (!row) throw new HttpError(404, 'invitation_not_found');
    if (row.revoked_at) throw new HttpError(410, 'invitation_revoked');
    if (row.consumed_at) throw new HttpError(410, 'invitation_used');
    if (row.expires_at.getTime() <= now.getTime()) throw new HttpError(410, 'invitation_expired');
    const mine = (await this.c.pool.query(`SELECT 1 FROM accounts WHERE sub=$1 AND (phone=$2 OR EXISTS (SELECT 1 FROM account_contacts WHERE sub=$1 AND type='phone' AND value=$2))`, [user.sub, row.invitee_phone])).rows[0];
    if (!mine) throw new HttpError(403, 'invitation_not_for_this_account');
    // single use: atomic claim
    const claim = await this.c.pool.query(`UPDATE invitations SET consumed_at=$2, consumed_by=$3 WHERE id=$1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > $2 RETURNING id`, [row.id, now, user.sub]);
    if (!claim.rowCount) throw new HttpError(410, 'invitation_used');
    let membershipId: string;
    try { membershipId = await this.addMembership(row.org_id, user.sub, row.role_hint, row.invited_by); }
    catch (e) { await this.c.pool.query(`UPDATE invitations SET consumed_at=NULL, consumed_by=NULL WHERE id=$1`, [row.id]); throw e; }
    await this.c.audit.record('org.invitation.accepted', user.sub, { org: row.org_id, invitation: row.id });
    return { org_id: row.org_id, role_hint: row.role_hint, membership_id: membershipId };
  }

  /** Pending, unexpired invitations addressed to one of this account's verified phone numbers (token never returned). */
  async pendingFor(user: Account) {
    const r = await this.c.pool.query(
      `SELECT i.id AS invitation_id, i.org_id, o.legal_name, i.role_hint, i.expires_at, a.name AS invited_by_name
         FROM invitations i JOIN organizations o ON o.org_id=i.org_id LEFT JOIN accounts a ON a.sub=i.invited_by
        WHERE i.consumed_at IS NULL AND i.revoked_at IS NULL AND i.expires_at > $2
          AND (i.invitee_phone=$3 OR i.invitee_phone IN (SELECT value FROM account_contacts WHERE sub=$1 AND type='phone'))
        ORDER BY i.created_at DESC`, [user.sub, new Date(this.c.now() * 1000), user.phone]);
    return r.rows;
  }

  /** Accept by invitation id: same phone-binding checks as the token flow, the caller must already be signed in as the invitee. */
  async acceptById(user: Account, invitationId: string) {
    const pending = (await this.pendingFor(user)).find((x) => x.invitation_id === invitationId);
    if (!pending) throw new HttpError(404, 'invitation_not_found');
    const now = new Date(this.c.now() * 1000);
    const claim = await this.c.pool.query(`UPDATE invitations SET consumed_at=$2, consumed_by=$3 WHERE id=$1 AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > $2 RETURNING invited_by`, [invitationId, now, user.sub]);
    if (!claim.rowCount) throw new HttpError(410, 'invitation_used');
    let membershipId: string;
    try { membershipId = await this.addMembership(pending.org_id, user.sub, pending.role_hint, claim.rows[0].invited_by); }
    catch (e) { await this.c.pool.query(`UPDATE invitations SET consumed_at=NULL, consumed_by=NULL WHERE id=$1`, [invitationId]); throw e; }
    await this.c.audit.record('org.invitation.accepted', user.sub, { org: pending.org_id, invitation: invitationId });
    return { org_id: pending.org_id, role_hint: pending.role_hint, membership_id: membershipId };
  }

  async decline(user: Account, invitationId: string) {
    const pending = (await this.pendingFor(user)).find((x) => x.invitation_id === invitationId);
    if (!pending) throw new HttpError(404, 'invitation_not_found');
    await this.c.pool.query(`UPDATE invitations SET revoked_at=now() WHERE id=$1 AND consumed_at IS NULL AND revoked_at IS NULL`, [invitationId]);
    await this.c.audit.record('org.invitation.declined', user.sub, { org: pending.org_id, invitation: invitationId });
  }

  /** KA-09: invitations this organisation has sent that are still open (managers only). Tokens are never returned; the invitee phone is masked. */
  async sentInvitations(orgId: string, sub: string) {
    await this.requireManager(orgId, sub);
    const r = await this.c.pool.query(
      `SELECT id AS invitation_id, role_hint, invitee_phone, invited_by, created_at, expires_at,
              CASE WHEN revoked_at IS NOT NULL THEN 'revoked' WHEN consumed_at IS NOT NULL THEN 'accepted' WHEN expires_at <= $2 THEN 'expired' ELSE 'pending' END AS status
         FROM invitations WHERE org_id=$1 ORDER BY created_at DESC LIMIT 200`, [orgId, new Date(this.c.now() * 1000)]);
    return r.rows.map((x: any) => ({ invitation_id: x.invitation_id, role_hint: x.role_hint, invitee_phone_masked: `${String(x.invitee_phone).slice(0, 4)}****${String(x.invitee_phone).slice(-2)}`, invited_by: x.invited_by, created_at: x.created_at, expires_at: x.expires_at, status: x.status }));
  }

  async revokeInvitation(actor: Account, orgId: string, invitationId: string) {
    await this.requireManager(orgId, actor.sub);
    const r = await this.c.pool.query(`UPDATE invitations SET revoked_at=now() WHERE id=$1 AND org_id=$2 AND consumed_at IS NULL AND revoked_at IS NULL RETURNING id`, [invitationId, orgId]);
    if (!r.rowCount) throw new HttpError(404, 'invitation_not_found');
  }

  async changeRole(actor: Account, orgId: string, targetSub: string, roleIn: unknown) {
    const myRole = await this.requireManager(orgId, actor.sub);
    const role = this.hint(roleIn);
    if ((role === 'owner' || (await this.myRole(orgId, targetSub).catch(() => '')) === 'owner') && myRole !== 'owner') throw new HttpError(403, 'only_owner_can_change_owner');
    const r = await this.c.pool.query(`UPDATE memberships SET role_hint=$3 WHERE org_id=$1 AND sub=$2 AND status='active' RETURNING id`, [orgId, targetSub, role]);
    if (!r.rowCount) throw new HttpError(404, 'membership_not_found');
    await this.emit(orgId, targetSub, role, 'role_changed');
  }

  async remove(actor: Account, orgId: string, targetSub: string) {
    const myRole = await this.myRole(orgId, actor.sub);
    if (targetSub !== actor.sub && !MANAGER_HINTS.includes(myRole)) throw new HttpError(403, 'insufficient_membership');
    const target = await this.myRole(orgId, targetSub).catch(() => { throw new HttpError(404, 'membership_not_found'); });
    if (target === 'owner') {
      const owners = (await this.c.pool.query(`SELECT count(*)::int AS n FROM memberships WHERE org_id=$1 AND role_hint='owner' AND status='active'`, [orgId])).rows[0].n as number;
      if (owners <= 1) throw new HttpError(409, 'last_owner');
      if (myRole !== 'owner') throw new HttpError(403, 'only_owner_can_remove_owner');
    }
    await this.c.pool.query(`UPDATE memberships SET status='revoked', ended_at=now() WHERE org_id=$1 AND sub=$2 AND status='active'`, [orgId, targetSub]);
    await this.emit(orgId, targetSub, target, 'removed');
    await this.c.audit.record('org.member.removed', actor.sub, { org: orgId, member: targetSub });
  }

  async endAllFor(sub: string): Promise<void> {
    const r = await this.c.pool.query(`UPDATE memberships SET status='revoked', ended_at=now() WHERE sub=$1 AND status='active' RETURNING org_id, role_hint`, [sub]);
    for (const m of r.rows) await this.emit(m.org_id, sub, m.role_hint, 'removed');
  }
}
