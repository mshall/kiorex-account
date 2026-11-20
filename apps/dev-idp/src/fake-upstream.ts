import http from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, exportJWK, generateKeyPair, type JWK, type CryptoKey } from 'jose';

export interface FakeUpstreamUser { id: string; name: string; email: string }
export interface FakeUpstreamOptions {
  id: string; name: string; clientId: string; clientSecret: string; users: FakeUpstreamUser[]; redirectUris: string[];
}

/**
 * KA-11 (dev): a SECOND, independent fake upstream OIDC provider (think "Hospital SSO"). Own issuer, own RS256 key, picker page,
 * authorization code + PKCE S256, confidential client. It exists only so provider SSO / federation can be exercised end to end locally;
 * production uses the managed IdP's enterprise SAML/OIDC federation. Never exposed in production (the dev IdP refuses to start there).
 */
export class FakeUpstreamIdp {
  issuer = '';
  port = 0;
  private server?: http.Server;
  private priv?: CryptoKey;
  private pub?: JWK;
  private readonly txns = new Map<string, { redirectUri: string; state: string; nonce: string; challenge: string }>();
  private readonly codes = new Map<string, { user: FakeUpstreamUser; nonce: string; redirectUri: string; challenge: string; exp: number }>();

  constructor(private readonly o: FakeUpstreamOptions) {}

  async start(port: number): Promise<void> {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    this.priv = privateKey;
    this.pub = { ...(await exportJWK(publicKey)), kid: 'fake-upstream-1', alg: 'RS256', use: 'sig' };
    this.server = http.createServer((req, res) => void this.handle(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); }));
    await new Promise<void>((resolve, reject) => { this.server!.once('error', reject); this.server!.listen(port, '127.0.0.1', resolve); });
    this.port = (this.server.address() as { port: number }).port;
    this.issuer = `http://localhost:${this.port}`;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((r) => this.server!.close(() => r()));
    this.server.closeAllConnections?.();
  }

  private json(res: http.ServerResponse, status: number, body: unknown): void {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  private issueCode(user: FakeUpstreamUser, t: { redirectUri: string; state: string; nonce: string; challenge: string }): string {
    const code = randomBytes(24).toString('base64url');
    this.codes.set(code, { user, nonce: t.nonce, redirectUri: t.redirectUri, challenge: t.challenge, exp: Date.now() + 60_000 });
    return `${t.redirectUri}${t.redirectUri.includes('?') ? '&' : '?'}code=${code}&state=${encodeURIComponent(t.state)}`;
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', this.issuer);
    const p = url.pathname;
    if (p === '/.well-known/openid-configuration') {
      return this.json(res, 200, {
        issuer: this.issuer, authorization_endpoint: `${this.issuer}/authorize`, token_endpoint: `${this.issuer}/token`, jwks_uri: `${this.issuer}/jwks`,
        response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      });
    }
    if (p === '/jwks') return this.json(res, 200, { keys: [this.pub] });
    if (p === '/authorize' && req.method === 'GET') {
      const q = url.searchParams;
      const redirectUri = q.get('redirect_uri') ?? '';
      if (q.get('client_id') !== this.o.clientId || !this.o.redirectUris.includes(redirectUri)) return this.json(res, 400, { error: 'invalid_client_or_redirect_uri' });
      if (q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge')) {
        res.writeHead(302, { location: `${redirectUri}?error=invalid_request&state=${encodeURIComponent(q.get('state') ?? '')}` }); return void res.end();
      }
      const t = { redirectUri, state: q.get('state') ?? '', nonce: q.get('nonce') ?? '', challenge: q.get('code_challenge')! };
      const hinted = this.o.users.find((u) => u.id === q.get('login_hint'));
      if (hinted) { res.writeHead(302, { location: this.issueCode(hinted, t) }); return void res.end(); }
      const txn = randomBytes(12).toString('hex');
      this.txns.set(txn, t);
      const items = this.o.users.map((u) => `<li><a data-user="${u.id}" href="/authorize/pick?txn=${txn}&amp;user=${u.id}">${u.name} (${u.email})</a></li>`).join('');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return void res.end(`<!doctype html><meta charset="utf-8"><title>${this.o.name}</title><h1>${this.o.name}</h1><p>Fake upstream identity provider for local development. Choose a staff member.</p><ul>${items}</ul>`);
    }
    if (p === '/authorize/pick') {
      const t = this.txns.get(url.searchParams.get('txn') ?? '');
      const user = this.o.users.find((u) => u.id === url.searchParams.get('user'));
      if (!t || !user) return this.json(res, 400, { error: 'invalid_request' });
      this.txns.delete(url.searchParams.get('txn')!);
      res.writeHead(302, { location: this.issueCode(user, t) }); return void res.end();
    }
    if (p === '/token' && req.method === 'POST') {
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer);
      const f = new URLSearchParams(Buffer.concat(chunks).toString());
      let id = f.get('client_id') ?? ''; let secret = f.get('client_secret') ?? '';
      const basic = String(req.headers.authorization ?? '').match(/^Basic (.+)$/i);
      if (basic) { const [a, ...b] = Buffer.from(basic[1], 'base64').toString().split(':'); id = decodeURIComponent(a); secret = decodeURIComponent(b.join(':')); }
      if (id !== this.o.clientId || secret !== this.o.clientSecret) return this.json(res, 401, { error: 'invalid_client' });
      const entry = this.codes.get(f.get('code') ?? '');
      this.codes.delete(f.get('code') ?? ''); // single use
      if (!entry || entry.exp < Date.now() || entry.redirectUri !== f.get('redirect_uri')) return this.json(res, 400, { error: 'invalid_grant' });
      const verifier = f.get('code_verifier') ?? '';
      if (createHash('sha256').update(verifier).digest('base64url') !== entry.challenge) return this.json(res, 400, { error: 'invalid_grant', error_description: 'PKCE' });
      const now = Math.floor(Date.now() / 1000);
      const idToken = await new SignJWT({ name: entry.user.name, email: entry.user.email, nonce: entry.nonce, acr: 'fake-hospital:sso' })
        .setProtectedHeader({ alg: 'RS256', kid: 'fake-upstream-1' }).setIssuer(this.issuer).setAudience(this.o.clientId).setSubject(entry.user.id)
        .setIssuedAt(now).setExpirationTime(now + 300).sign(this.priv!);
      return this.json(res, 200, { token_type: 'Bearer', access_token: randomBytes(16).toString('hex'), id_token: idToken, expires_in: 300 });
    }
    return this.json(res, 404, { error: 'not_found' });
  }
}
