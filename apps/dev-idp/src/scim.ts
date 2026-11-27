import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ulid } from 'ulid';
import { E164 } from '@kiorex/otp-sender';
import type { Account } from './accounts.js';
import { HttpError, type Ctx } from './services.js';
import { readBody } from './http.js';

/**
 * KA-11 second half: SCIM 2.0 (RFC 7643/7644) provider-directory sync. A customer organisation's directory (Entra ID, Okta, Google
 * Workspace, ...) provisions its staff into a Passport organisation:
 *   - one bearer token per organisation (`kxscim_...`, shown once, stored as a SHA-256 hash, revocable),
 *   - /Users  -> Passport person identities (matched by verified-able E.164 phone) + an org membership (role hint = group),
 *   - /Groups -> the organisation's role-hint groups (owner/admin/doctor/...); membership of a group = the role hint.
 * Identity-level only (ADR-013): the only attributes accepted are userName, externalId, name, displayName, phone, e-mail, locale,
 * active and the role hint. Anything else (clinical, licence, profession) is ignored and never stored. SCIM never creates or
 * removes `owner` memberships, never deletes a Passport identity (the person owns it) and only sees users it provisioned.
 */
export const SCIM_USER = 'urn:ietf:params:scim:schemas:core:2.0:User';
export const SCIM_GROUP = 'urn:ietf:params:scim:schemas:core:2.0:Group';
export const SCIM_PATCH = 'urn:ietf:params:scim:api:messages:2.0:PatchOp';
export const SCIM_LIST = 'urn:ietf:params:scim:api:messages:2.0:ListResponse';
export const SCIM_ERROR = 'urn:ietf:params:scim:api:messages:2.0:Error';
export const SCIM_EXT = 'urn:kiorex:params:scim:schemas:extension:passport:2.0:User';
const CT = 'application/scim+json; charset=utf-8';
const DEFAULT_ROLE = 'staff';
const TOKEN_PREFIX = 'kxscim_';

class ScimError extends Error {
  constructor(public readonly status: number, public readonly scimType: string | undefined, public readonly detail: string) { super(detail); }
}

interface UserRow { sub: string; org_id: string; external_id: string | null; user_name: string; active: boolean; created_at: Date; updated_at: Date }

const hash = (t: string) => createHash('sha256').update(t).digest('hex');

export class Scim {
  constructor(private readonly c: Ctx, private readonly enabled = true) {}

  // ---------------------------------------------------------------- token management (called from the Passport API by org managers)
  async createToken(orgId: string, actor: Account, label: unknown) {
    const l = typeof label === 'string' && label.trim() ? label.trim().slice(0, 80) : 'SCIM token';
    const token = TOKEN_PREFIX + randomBytes(32).toString('base64url');
    const id = ulid();
    await this.c.pool.query(`INSERT INTO scim_tokens (id, org_id, token_hash, label, created_by) VALUES ($1,$2,$3,$4,$5)`, [id, orgId, hash(token), l, actor.sub]);
    await this.c.audit.record('scim.token.created', actor.sub, { org: orgId, token: id });
    return { token_id: id, label: l, token, note: 'Shown once. Configure it as the bearer token of the SCIM connector.' };
  }
  async listTokens(orgId: string) {
    const r = await this.c.pool.query(`SELECT id AS token_id, label, created_at, last_used_at, revoked_at FROM scim_tokens WHERE org_id=$1 ORDER BY created_at DESC`, [orgId]);
    return r.rows;
  }
  async revokeToken(orgId: string, actor: Account, tokenId: string) {
    const r = await this.c.pool.query(`UPDATE scim_tokens SET revoked_at=now() WHERE id=$1 AND org_id=$2 AND revoked_at IS NULL RETURNING id`, [tokenId, orgId]);
    if (!r.rowCount) throw new HttpError(404, 'token_not_found');
    await this.c.audit.record('scim.token.revoked', actor.sub, { org: orgId, token: tokenId });
  }

  // ---------------------------------------------------------------- HTTP surface: /scim/v2/*
  async handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    try {
      if (!this.enabled) throw new ScimError(404, undefined, 'SCIM is not enabled');
      const orgId = await this.authenticate(req);
      const s = url.pathname.split('/').filter(Boolean).slice(2); // after scim, v2
      const m = req.method ?? 'GET';
      const base = `${this.c.issuer}/scim/v2`;
      const out = (status: number, body: unknown, headers: Record<string, string> = {}) => this.reply(res, status, body, headers);

      if (s[0] === 'ServiceProviderConfig' && m === 'GET') return out(200, this.serviceProviderConfig());
      if (s[0] === 'ResourceTypes' && m === 'GET') return out(200, this.list(this.resourceTypes(base), 1, 100));
      if (s[0] === 'Schemas' && m === 'GET') return out(200, this.list(this.schemas(), 1, 100));

      if (s[0] === 'Users') {
        if (s.length === 1 && m === 'GET') {
          const { start, count } = this.paging(url);
          const rows = await this.users(orgId, url.searchParams.get('filter'));
          const page = rows.slice(start - 1, start - 1 + count);
          return out(200, this.list(await Promise.all(page.map((r) => this.userResource(orgId, r, base))), start, count, rows.length));
        }
        if (s.length === 1 && m === 'POST') {
          const { status, user } = await this.createUser(orgId, await this.json(req));
          return out(status, await this.userResource(orgId, user, base), { location: `${base}/Users/${user.sub}` });
        }
        if (s.length === 2 && m === 'GET') return out(200, await this.userResource(orgId, await this.mustUser(orgId, s[1]), base));
        if (s.length === 2 && m === 'PUT') return out(200, await this.userResource(orgId, await this.replaceUser(orgId, s[1], await this.json(req)), base));
        if (s.length === 2 && m === 'PATCH') return out(200, await this.userResource(orgId, await this.patchUser(orgId, s[1], await this.json(req)), base));
        if (s.length === 2 && m === 'DELETE') { await this.deleteUser(orgId, s[1]); res.writeHead(204, { 'cache-control': 'no-store' }); return void res.end(); }
      }
      if (s[0] === 'Groups') {
        if (s.length === 1 && m === 'GET') {
          const { start, count } = this.paging(url);
          const groups = await Promise.all(this.c.cfg.orgs.roleHints.map((r) => this.groupResource(orgId, r, base)));
          const f = this.parseFilter(url.searchParams.get('filter'));
          const rows = f ? groups.filter((g) => String((g as Record<string, unknown>)[f.attr] ?? '').toLowerCase() === f.value.toLowerCase()) : groups;
          return out(200, this.list(rows.slice(start - 1, start - 1 + count), start, count, rows.length));
        }
        if (s.length === 1 && m === 'POST') throw new ScimError(409, 'uniqueness', 'Groups are the fixed organisation role groups; create is not supported. Use PATCH to change membership.');
        if (s.length === 2 && m === 'GET') return out(200, await this.groupResource(orgId, this.roleFromGroupId(s[1]), base));
        if (s.length === 2 && (m === 'PATCH' || m === 'PUT')) return out(200, await this.updateGroup(orgId, this.roleFromGroupId(s[1]), m, await this.json(req), base));
        if (s.length === 2 && m === 'DELETE') throw new ScimError(403, 'mutability', 'Role groups cannot be deleted');
      }
      throw new ScimError(404, undefined, 'Resource not found');
    } catch (e) {
      if (e instanceof ScimError) return this.fail(res, e.status, e.detail, e.scimType);
      if (e instanceof HttpError) return this.fail(res, e.status, e.code);
      throw e;
    }
  }

  private reply(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
    res.writeHead(status, { 'content-type': CT, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
    res.end(JSON.stringify(body));
  }
  private fail(res: ServerResponse, status: number, detail: string, scimType?: string) {
    const headers: Record<string, string> = status === 401 ? { 'www-authenticate': 'Bearer realm="kiorex-passport-scim"' } : {};
    this.reply(res, status, { schemas: [SCIM_ERROR], status: String(status), ...(scimType ? { scimType } : {}), detail }, headers);
  }
  private async json(req: IncomingMessage): Promise<Record<string, any>> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const b = await readBody(req, 512 * 1024);
    if (!b.length) return {};
    try { const v = JSON.parse(b.toString('utf8')); if (v && typeof v === 'object' && !Array.isArray(v)) return v; } catch { /* fallthrough */ }
    throw new ScimError(400, 'invalidSyntax', 'Body is not a JSON object');
  }
  private paging(url: URL) {
    const start = Math.max(1, Number(url.searchParams.get('startIndex') ?? 1) || 1);
    const count = Math.min(200, Math.max(0, Number(url.searchParams.get('count') ?? 100) || 0));
    return { start, count };
  }
  private list(resources: unknown[], start: number, count: number, total = resources.length) {
    return { schemas: [SCIM_LIST], totalResults: total, startIndex: start, itemsPerPage: resources.length, Resources: resources, ...(count === 0 ? { Resources: [], itemsPerPage: 0 } : {}) };
  }

  private async authenticate(req: IncomingMessage): Promise<string> {
    const m = String(req.headers.authorization ?? '').match(/^Bearer (.+)$/i);
    if (!m || !m[1].startsWith(TOKEN_PREFIX)) throw new ScimError(401, undefined, 'Bearer token required');
    const h = hash(m[1]);
    const row = (await this.c.pool.query(`SELECT id, org_id, token_hash FROM scim_tokens WHERE token_hash=$1 AND revoked_at IS NULL`, [h])).rows[0] as undefined | { id: string; org_id: string; token_hash: string };
    if (!row || !timingSafeEqual(Buffer.from(row.token_hash), Buffer.from(h))) throw new ScimError(401, undefined, 'Invalid or revoked token');
    const org = (await this.c.pool.query(`SELECT status FROM organizations WHERE org_id=$1`, [row.org_id])).rows[0];
    if (!org || org.status !== 'active') throw new ScimError(403, undefined, 'Organisation is not active');
    void this.c.pool.query(`UPDATE scim_tokens SET last_used_at=now() WHERE id=$1`, [row.id]).catch(() => undefined);
    return row.org_id;
  }

  // ---------------------------------------------------------------- discovery
  private serviceProviderConfig() {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      documentationUri: process.env.KX_SCIM_DOCS_URL ?? `${this.c.issuer}/docs/scim`, // the Passport's own origin unless a docs site is configured
      patch: { supported: true }, bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 }, changePassword: { supported: false }, sort: { supported: false }, etag: { supported: false },
      authenticationSchemes: [{ type: 'oauthbearertoken', name: 'Organisation SCIM token', description: 'Static bearer token issued per organisation by an owner/admin in Kiorex Passport', primary: true }],
      meta: { resourceType: 'ServiceProviderConfig', location: `${this.c.issuer}/scim/v2/ServiceProviderConfig` },
    };
  }
  private resourceTypes(base: string) {
    return [
      { schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: 'User', name: 'User', endpoint: '/Users', schema: SCIM_USER, schemaExtensions: [{ schema: SCIM_EXT, required: false }], meta: { resourceType: 'ResourceType', location: `${base}/ResourceTypes/User` } },
      { schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'], id: 'Group', name: 'Group', endpoint: '/Groups', schema: SCIM_GROUP, meta: { resourceType: 'ResourceType', location: `${base}/ResourceTypes/Group` } },
    ];
  }
  private schemas() {
    return [
      { id: SCIM_USER, name: 'User', description: 'Passport person identity as seen by an organisation (identity attributes only)', attributes: ['userName', 'externalId', 'name', 'displayName', 'emails', 'phoneNumbers', 'locale', 'active'].map((name) => ({ name })) },
      { id: SCIM_GROUP, name: 'Group', description: 'Organisation role-hint group (read-mostly; membership = role hint)', attributes: ['displayName', 'members'].map((name) => ({ name })) },
      { id: SCIM_EXT, name: 'PassportUser', description: 'Kiorex Passport extension', attributes: [{ name: 'roleHint', description: `One of ${this.c.cfg.orgs.roleHints.join(', ')}; default ${DEFAULT_ROLE}` }] },
    ];
  }

  // ---------------------------------------------------------------- users
  private parseFilter(f: string | null): { attr: string; value: string } | undefined {
    if (!f) return undefined;
    const m = f.trim().match(/^([A-Za-z.]+)\s+eq\s+"((?:[^"\\]|\\.)*)"$/);
    if (!m) throw new ScimError(400, 'invalidFilter', 'Only the form: attribute eq "value" is supported');
    return { attr: m[1], value: m[2].replace(/\\"/g, '"') };
  }
  private async users(orgId: string, filter: string | null): Promise<UserRow[]> {
    const f = this.parseFilter(filter);
    let where = 'org_id=$1'; const params: unknown[] = [orgId];
    if (f) {
      const col = f.attr === 'userName' ? 'lower(user_name)' : f.attr === 'externalId' ? 'external_id' : f.attr === 'id' ? 'sub' : undefined;
      if (!col) throw new ScimError(400, 'invalidFilter', 'Filter attribute must be userName, externalId or id');
      where += ` AND ${col}=$2`; params.push(f.attr === 'userName' ? f.value.toLowerCase() : f.value);
    }
    return (await this.c.pool.query(`SELECT * FROM scim_users WHERE ${where} ORDER BY created_at, sub`, params)).rows;
  }
  private async mustUser(orgId: string, sub: string): Promise<UserRow> {
    const r = (await this.c.pool.query(`SELECT * FROM scim_users WHERE org_id=$1 AND sub=$2`, [orgId, sub])).rows[0];
    if (!r) throw new ScimError(404, undefined, 'User not found');
    return r;
  }
  private async activeRole(orgId: string, sub: string): Promise<string | undefined> {
    return (await this.c.pool.query(`SELECT role_hint FROM memberships WHERE org_id=$1 AND sub=$2 AND status='active'`, [orgId, sub])).rows[0]?.role_hint;
  }
  private async lastRole(orgId: string, sub: string): Promise<string> {
    return (await this.c.pool.query(`SELECT role_hint FROM memberships WHERE org_id=$1 AND sub=$2 ORDER BY created_at DESC LIMIT 1`, [orgId, sub])).rows[0]?.role_hint ?? DEFAULT_ROLE;
  }

  private async userResource(orgId: string, u: UserRow, base: string) {
    const a = await this.c.accounts.findAnyBySub(u.sub);
    const role = (await this.activeRole(orgId, u.sub)) ?? (await this.lastRole(orgId, u.sub));
    return {
      schemas: [SCIM_USER, SCIM_EXT], id: u.sub, ...(u.external_id ? { externalId: u.external_id } : {}), userName: u.user_name,
      ...(a?.name ? { name: { formatted: a.name }, displayName: a.name } : {}),
      ...(a?.phone ? { phoneNumbers: [{ value: a.phone, type: 'mobile', primary: true }] } : {}),
      ...(u.user_name.includes('@') ? { emails: [{ value: u.user_name, primary: true }] } : {}),
      locale: a?.locale ?? 'en', active: u.active,
      groups: u.active ? [{ value: this.groupId(role), display: role, $ref: `${base}/Groups/${this.groupId(role)}` }] : [],
      [SCIM_EXT]: { roleHint: role },
      meta: { resourceType: 'User', created: u.created_at.toISOString(), lastModified: u.updated_at.toISOString(), location: `${base}/Users/${u.sub}` },
    };
  }

  /** Validate and normalise the SCIM User payload to the identity-only attributes we accept. */
  private parseUser(b: Record<string, any>, partial = false) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const userName = typeof b.userName === 'string' ? b.userName.trim() : '';
    if (!partial && !userName) throw new ScimError(400, 'invalidValue', 'userName is required');
    if (userName.length > 200) throw new ScimError(400, 'invalidValue', 'userName too long');
    const phones: unknown[] = Array.isArray(b.phoneNumbers) ? b.phoneNumbers : [];
    const rawPhone = (phones.find((p: any) => p?.primary) ?? phones[0]) as { value?: unknown } | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
    const phone = typeof rawPhone?.value === 'string' ? rawPhone.value.replace(/[\s-]/g, '') : undefined;
    if (phone !== undefined && !E164.test(phone)) throw new ScimError(400, 'invalidValue', 'phoneNumbers[0].value must be an E.164 number');
    if (!partial && !phone) throw new ScimError(400, 'invalidValue', 'A mobile phone number (E.164) is required to map the user to a Passport identity');
    const name = typeof b.displayName === 'string' ? b.displayName : typeof b.name?.formatted === 'string' ? b.name.formatted
      : (b.name && (b.name.givenName || b.name.familyName)) ? [b.name.givenName, b.name.familyName].filter(Boolean).join(' ') : undefined;
    const ext = b[SCIM_EXT] as { roleHint?: unknown } | undefined;
    const roleHint = ext?.roleHint !== undefined ? this.role(ext.roleHint) : undefined;
    const locale = typeof b.locale === 'string' ? (b.locale.toLowerCase().startsWith('ar') ? 'ar' : 'en') : undefined;
    return { userName, externalId: typeof b.externalId === 'string' ? b.externalId.slice(0, 200) : undefined, phone, name: name?.trim().slice(0, 120), roleHint, locale: locale as 'ar' | 'en' | undefined, active: typeof b.active === 'boolean' ? b.active : undefined };
  }
  private role(v: unknown): string {
    if (typeof v !== 'string' || !this.c.cfg.orgs.roleHints.includes(v)) throw new ScimError(400, 'invalidValue', `roleHint must be one of ${this.c.cfg.orgs.roleHints.join(', ')}`);
    if (v === 'owner') throw new ScimError(403, 'mutability', 'SCIM cannot grant the owner role; ownership is managed in Passport');
    return v;
  }

  private async createUser(orgId: string, body: Record<string, any>): Promise<{ status: number; user: UserRow }> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const p = this.parseUser(body);
    const dup = (await this.c.pool.query(`SELECT 1 FROM scim_users WHERE org_id=$1 AND lower(user_name)=lower($2)`, [orgId, p.userName])).rows[0];
    if (dup) throw new ScimError(409, 'uniqueness', 'userName already exists');
    // identity mapping: an existing Passport account with this phone is reused (the person owns it); otherwise a person identity is created
    let acct = await this.c.accounts.findByPhone(p.phone!);
    if (acct && acct.kind !== 'person') throw new ScimError(409, 'uniqueness', 'Phone belongs to a non-login identity');
    if (!acct) {
      const sub = ulid();
      // phone_verified=false: the directory attests the number, Passport verifies it at the person's first OTP sign-in
      await this.c.pool.query(`INSERT INTO accounts (sub, phone, phone_verified, name, locale, roles) VALUES ($1,$2,false,$3,$4,'["patient"]')`, [sub, p.phone, p.name ?? null, p.locale ?? 'en']);
      acct = (await this.c.accounts.findBySub(sub))!;
    } else if (acct.sub === (await this.ownerOnly(orgId, acct.sub))) throw new ScimError(409, 'uniqueness', 'User is an organisation owner');
    const taken = (await this.c.pool.query(`SELECT 1 FROM scim_users WHERE org_id=$1 AND sub=$2`, [orgId, acct.sub])).rows[0];
    if (taken) throw new ScimError(409, 'uniqueness', 'Phone already provisioned in this organisation');
    const active = p.active ?? true;
    await this.c.pool.query(`INSERT INTO scim_users (org_id, sub, external_id, user_name, active) VALUES ($1,$2,$3,$4,$5)`, [orgId, acct.sub, p.externalId ?? null, p.userName, active]);
    if (active) await this.ensureMembership(orgId, acct.sub, p.roleHint ?? DEFAULT_ROLE);
    await this.c.audit.record('scim.user.created', acct.sub, { org: orgId, active });
    return { status: 201, user: await this.mustUser(orgId, acct.sub) };
  }
  private async ownerOnly(orgId: string, sub: string): Promise<string | undefined> {
    const r = (await this.c.pool.query(`SELECT 1 FROM memberships WHERE org_id=$1 AND sub=$2 AND status='active' AND role_hint='owner'`, [orgId, sub])).rows[0];
    return r ? sub : undefined;
  }

  /** Create/activate a membership with `role`, or change the role of the active one. Owners are never touched. */
  private async ensureMembership(orgId: string, sub: string, role: string): Promise<void> {
    const cur = await this.activeRole(orgId, sub);
    if (cur === 'owner') return;
    if (cur === role) return;
    if (cur) {
      await this.c.pool.query(`UPDATE memberships SET role_hint=$3 WHERE org_id=$1 AND sub=$2 AND status='active'`, [orgId, sub, role]);
      await this.c.events.emit('membership.changed', 'Membership', `${orgId}:${sub}`, { orgId, sub, roleHint: role, change: 'role_changed', at: new Date().toISOString() });
      return;
    }
    await this.c.pool.query(`INSERT INTO memberships (id, org_id, sub, role_hint, invited_by, effective_from) VALUES ($1,$2,$3,$4,NULL,$5)`, [ulid(), orgId, sub, role, new Date(this.c.now() * 1000)]);
    await this.c.events.emit('membership.changed', 'Membership', `${orgId}:${sub}`, { orgId, sub, roleHint: role, change: 'added', at: new Date().toISOString() });
  }
  private async endMembership(orgId: string, sub: string): Promise<void> {
    const cur = await this.activeRole(orgId, sub);
    if (!cur) return;
    if (cur === 'owner') throw new ScimError(403, 'mutability', 'SCIM cannot deactivate an organisation owner');
    await this.c.pool.query(`UPDATE memberships SET status='revoked', ended_at=now() WHERE org_id=$1 AND sub=$2 AND status='active'`, [orgId, sub]);
    await this.c.events.emit('membership.changed', 'Membership', `${orgId}:${sub}`, { orgId, sub, roleHint: cur, change: 'removed', at: new Date().toISOString() });
  }

  private async apply(orgId: string, u: UserRow, p: ReturnType<Scim['parseUser']>): Promise<UserRow> {
    if (p.userName && p.userName.toLowerCase() !== u.user_name.toLowerCase()) {
      const dup = (await this.c.pool.query(`SELECT 1 FROM scim_users WHERE org_id=$1 AND lower(user_name)=lower($2) AND sub<>$3`, [orgId, p.userName, u.sub])).rows[0];
      if (dup) throw new ScimError(409, 'uniqueness', 'userName already exists');
    }
    await this.c.pool.query(`UPDATE scim_users SET user_name=COALESCE($3,user_name), external_id=COALESCE($4,external_id), updated_at=now() WHERE org_id=$1 AND sub=$2`, [orgId, u.sub, p.userName || null, p.externalId ?? null]);
    // profile edits only fill gaps: a signed-in person's own name/locale is never overwritten by the directory once they changed it
    if (p.name !== undefined) await this.c.pool.query(`UPDATE accounts SET name=$2 WHERE sub=$1 AND status='active' AND (name IS NULL OR name=$3)`, [u.sub, p.name, (await this.c.accounts.findAnyBySub(u.sub))?.name ?? '']);
    const active = p.active ?? u.active;
    if (active) await this.ensureMembership(orgId, u.sub, p.roleHint ?? (await this.lastRole(orgId, u.sub)));
    else await this.endMembership(orgId, u.sub);
    await this.c.pool.query(`UPDATE scim_users SET active=$3, updated_at=now() WHERE org_id=$1 AND sub=$2`, [orgId, u.sub, active]);
    if (active !== u.active) await this.c.audit.record(active ? 'scim.user.activated' : 'scim.user.deactivated', u.sub, { org: orgId });
    return this.mustUser(orgId, u.sub);
  }

  private async replaceUser(orgId: string, sub: string, body: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const u = await this.mustUser(orgId, sub);
    const p = this.parseUser(body);
    const acct = await this.c.accounts.findAnyBySub(sub);
    if (acct?.phone && p.phone !== acct.phone) throw new ScimError(400, 'mutability', 'The phone number is the identity key and cannot be changed through SCIM');
    return this.apply(orgId, u, { ...p, active: p.active ?? true });
  }

  private async patchUser(orgId: string, sub: string, body: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const u = await this.mustUser(orgId, sub);
    if (!Array.isArray(body.Operations) || !(body.schemas ?? []).includes(SCIM_PATCH)) throw new ScimError(400, 'invalidSyntax', 'PatchOp with Operations[] expected');
    const flat: Record<string, any> = {}; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const op of body.Operations) {
      const verb = String(op.op ?? '').toLowerCase();
      if (!['add', 'replace', 'remove'].includes(verb)) throw new ScimError(400, 'invalidSyntax', 'op must be add, replace or remove');
      const path = typeof op.path === 'string' ? op.path : '';
      if (verb === 'remove') {
        if (path === 'active') flat.active = false;
        else if (path === 'externalId' || path.startsWith('phoneNumbers') || path === 'name' || path === 'displayName') continue; // not removable: ignored
        else throw new ScimError(400, 'noTarget', `Cannot remove ${path || '(no path)'}`);
        continue;
      }
      const set = (k: string, v: unknown) => { flat[k] = v; };
      if (!path) { for (const [k, v] of Object.entries((op.value ?? {}) as Record<string, unknown>)) set(k, v); continue; }
      if (path === 'name.givenName' || path === 'name.familyName' || path === 'name.formatted') { set('displayName', op.value); continue; }
      if (path.startsWith('phoneNumbers')) { set('phoneNumbers', [{ value: op.value, primary: true }]); continue; }
      if (path === `${SCIM_EXT}:roleHint` || path === 'roleHint') { set(SCIM_EXT, { roleHint: op.value }); continue; }
      if (path.startsWith(`${SCIM_EXT}:`)) { set(SCIM_EXT, { roleHint: op.value }); continue; }
      set(path, op.value);
    }
    if (typeof flat.active === 'string') flat.active = flat.active.toLowerCase() === 'true'; // Entra sends "True"/"False" strings
    const p = this.parseUser(flat, true);
    const acct = await this.c.accounts.findAnyBySub(sub);
    if (p.phone && acct?.phone && p.phone !== acct.phone) throw new ScimError(400, 'mutability', 'The phone number is the identity key and cannot be changed through SCIM');
    return this.apply(orgId, u, p);
  }

  /** DELETE removes the membership and the SCIM mapping. The Passport identity itself is the person's and is never deleted here. */
  private async deleteUser(orgId: string, sub: string) {
    await this.mustUser(orgId, sub);
    await this.endMembership(orgId, sub);
    await this.c.pool.query(`DELETE FROM scim_users WHERE org_id=$1 AND sub=$2`, [orgId, sub]);
    await this.c.audit.record('scim.user.deleted', sub, { org: orgId });
  }

  // ---------------------------------------------------------------- groups (= role hints)
  private groupId = (role: string) => `role-${role}`;
  private roleFromGroupId(id: string): string {
    const role = id.replace(/^role-/, '');
    if (!this.c.cfg.orgs.roleHints.includes(role)) throw new ScimError(404, undefined, 'Group not found');
    return role;
  }
  private async groupResource(orgId: string, role: string, base: string) {
    const r = await this.c.pool.query(
      `SELECT su.sub, su.user_name FROM scim_users su JOIN memberships m ON m.org_id=su.org_id AND m.sub=su.sub AND m.status='active'
        WHERE su.org_id=$1 AND m.role_hint=$2 ORDER BY su.created_at`, [orgId, role]);
    return {
      schemas: [SCIM_GROUP], id: this.groupId(role), displayName: role,
      members: r.rows.map((x: { sub: string; user_name: string }) => ({ value: x.sub, display: x.user_name, $ref: `${base}/Users/${x.sub}`, type: 'User' })),
      meta: { resourceType: 'Group', location: `${base}/Groups/${this.groupId(role)}` },
    };
  }
  /** Group membership change = role-hint change for SCIM-provisioned users. Removing a member from a group is a no-op (a user always has exactly one role; deactivate the user to end the membership). */
  private async updateGroup(orgId: string, role: string, method: string, body: Record<string, any>, base: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (role === 'owner') throw new ScimError(403, 'mutability', 'The owner group is managed in Passport');
    const add: string[] = [];
    if (method === 'PUT') { for (const m of Array.isArray(body.members) ? body.members : []) add.push(String(m.value)); }
    else {
      if (!Array.isArray(body.Operations) || !(body.schemas ?? []).includes(SCIM_PATCH)) throw new ScimError(400, 'invalidSyntax', 'PatchOp with Operations[] expected');
      for (const op of body.Operations) {
        const verb = String(op.op ?? '').toLowerCase();
        if (verb === 'remove') continue;
        const path = typeof op.path === 'string' ? op.path : '';
        if (path && path !== 'members') throw new ScimError(400, 'noTarget', `Unsupported path ${path}`);
        const vals = Array.isArray(op.value) ? op.value : Array.isArray(op.value?.members) ? op.value.members : [];
        for (const m of vals) add.push(String(m.value));
      }
    }
    for (const sub of add) {
      const u = await this.mustUser(orgId, sub).catch(() => { throw new ScimError(400, 'invalidValue', `Member ${sub} is not a SCIM-provisioned user of this organisation`); });
      if (!u.active) throw new ScimError(400, 'invalidValue', `Member ${sub} is deactivated`);
      await this.ensureMembership(orgId, sub, role);
    }
    return this.groupResource(orgId, role, base);
  }
}
