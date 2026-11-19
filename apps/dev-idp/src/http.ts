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

export function send(res: ServerResponse, status: number, body: string | object, headers: Record<string, string> = {}): void {
  const isStr = typeof body === 'string';
  res.writeHead(status, {
    'content-type': isStr ? 'text/html; charset=utf-8' : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self' http: https:",
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
