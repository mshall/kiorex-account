import type { IncomingMessage, ServerResponse } from 'node:http';

export async function readBody(req: IncomingMessage, limit = 256 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > limit) throw new Error('body too large');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function readForm(req: IncomingMessage): Promise<Record<string, string>> {
  const buf = await readBody(req);
  const ct = String(req.headers['content-type'] ?? '');
  if (ct.includes('application/json')) return buf.length ? JSON.parse(buf.toString('utf8')) : {};
  return Object.fromEntries(new URLSearchParams(buf.toString('utf8')));
}

/**
 * Custom URL schemes of the registered native clients (kiorex://, kiorly://, exp+kiorly://, plus legacy kiorlyteam://, exp+kiorly-team://). CSP `form-action` also governs the
 * redirect chain that follows a form POST, and without these schemes iOS Safari / ASWebAuthenticationSession refuses the final
 * 302 to `kiorex://auth/callback` after "Not now"/Verify: the sign-in sheet then sits on the last screen and the app never gets its code.
 */
let nativeSchemes: string[] = [];
export function setNativeFormActionSchemes(uris: Iterable<string>): void {
  const out = new Set<string>();
  for (const u of uris) { const m = /^([a-z][a-z0-9+.-]*):/i.exec(u); if (m && !/^https?$/i.test(m[1]!)) out.add(`${m[1]!.toLowerCase()}:`); }
  nativeSchemes = [...out];
}
const formAction = () => ['\'self\'', 'http:', 'https:', ...nativeSchemes].join(' ');

export function send(res: ServerResponse, status: number, body: string | object, headers: Record<string, string> = {}): void {
  const isStr = typeof body === 'string';
  res.writeHead(status, {
    'content-type': isStr ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': `default-src 'self'; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; form-action ${formAction()}`,
    ...headers,
  });
  res.end(isStr ? body : JSON.stringify(body));
}

export const redirect = (res: ServerResponse, to: string): void => {
  res.writeHead(303, { location: to, 'cache-control': 'no-store' });
  res.end();
};

export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const xff = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim();
    if (xff) return xff;
  }
  return req.socket.remoteAddress ?? 'unknown';
}
