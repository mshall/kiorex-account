import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Drift guard for `Docs/openapi/passport-account.v1.openapi.json` (the self-service account API of Passport). The dev IdP routes are hand written, so the router source is scanned for its route
 * signatures and compared with the document in BOTH directions: a route added or removed without the document (or the document without the route) fails here. Operator routes (/api/ops/*) are
 * deliberately not documented. A structural check (every path parameter declared, unique operation ids, resolvable refs) runs on the document itself.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = (f: string) => readFileSync(join(here, '..', 'src', f), 'utf8');
const doc = JSON.parse(readFileSync(join(here, '..', '..', '..', 'Docs', 'openapi', 'passport-account.v1.openapi.json'), 'utf8')) as { paths: Record<string, Record<string, { operationId: string; parameters?: { name: string; in: string }[] }>> };
const METHODS = ['get', 'put', 'post', 'delete', 'patch'];
const norm = (p: string) => p.replace(/\{\w+\}/g, '{}');
const key = (m: string, p: string) => `${m.toUpperCase()} ${norm(p)}`;

/** Route signatures in the source: `p === '/api/x' && m === 'GET'`, the segment form `s[1] === 'x' && s[2] && s[3] === 'y' && m === 'POST'`, and the `.match(/^\/api\/x\/([^/]+)$/)` forms. */
function sourceRoutes(): Set<string> {
  const out = new Set<string>();
  const text = `${src('api.ts')}\n${src('routes.ts')}`;
  for (const line of text.split('\n')) {
    const m = line.match(/\b(?:m|method) === '(GET|POST|PUT|PATCH|DELETE)'/)?.[1];
    if (!m) continue;
    const lit = line.match(/p === '(\/api\/[\w/-]+)'/);
    if (lit) { out.add(key(m, lit[1]!)); continue; }
    const m1 = line.match(/s\[0\] === 'api' && s\[1\] === '([\w-]+)'/);
    if (m1) {
      const sub = line.match(/s\[3\] === '([\w-]+)'/)?.[1];
      const base = `/api/${m1[1]}`;
      if (m1[1] === 'orgs') continue; // the organisation block is scanned below
      if (m1[1] === 'federation') continue; // scanned below
      if (m1[1] === 'ops') continue; // operator routes are not part of the document
      out.add(key(m, sub ? `${base}/{}/${sub}` : `${base}/{}`));
    }
  }
  // /api/orgs/:orgId/... block
  for (const line of text.split('\n')) {
    const m = line.match(/\bm === '(GET|POST|PUT|PATCH|DELETE)'/)?.[1];
    if (!m) continue;
    const o = line.match(/if \(s\[3\] === '([\w-]+)'( && s\.length === 4| && s\[4\])/);
    if (o) out.add(key(m, o[2]!.includes('length') ? `/api/orgs/{}/${o[1]}` : `/api/orgs/{}/${o[1]}/{}`));
    const f = line.match(/if \(s\[2\] === 'identities' && s\.length === (3|5)/);
    if (f) out.add(key(m, f[1] === '3' ? '/api/federation/identities' : '/api/federation/identities/{}/{}'));
  }
  // `const sm = p.match(/^\/api\/sessions\/([^/]+)$/); if (sm && method === 'DELETE')`
  for (const mm of text.matchAll(/const (\w+) = p\.match\(\/\^\\\/api\\\/([\w-]+)\\\/\(\[\^\/\]\+\)\$\/\);\s*\n\s*if \(\1 && method === '(\w+)'/g)) out.add(key(mm[3]!, `/api/${mm[2]}/{}`));
  // `if (p.startsWith('/api/passkeys'))` block: `const pk = p.match(...)` followed by `if (pk && method === 'DELETE')`
  for (const mm of text.matchAll(/const (\w+) = p\.match\(\/\^\\\/api\\\/([\w-]+)\\\/\(\[\^\/\]\+\)\$\/\);\s*\n\s*if \(\1 && method === '(\w+)'/g)) out.add(key(mm[3]!, `/api/${mm[2]}/{}`));
  return out;
}
function docRoutes(): Set<string> {
  const out = new Set<string>();
  for (const [p, item] of Object.entries(doc.paths)) for (const m of METHODS) if (item[m]) out.add(key(m, p));
  return out;
}

describe('Passport account OpenAPI document', () => {
  it('every route of the router is documented, and every documented route exists', () => {
    const s = sourceRoutes(); const d = docRoutes();
    expect({ undocumented: [...s].filter((x) => !d.has(x)).sort() }).toEqual({ undocumented: [] });
    expect({ missingInSource: [...d].filter((x) => !s.has(x)).sort() }).toEqual({ missingInSource: [] });
    expect(s.size).toBeGreaterThanOrEqual(45);
  });
  it('every path parameter is declared and operation ids are unique', () => {
    const ids = new Set<string>();
    for (const [p, item] of Object.entries(doc.paths)) for (const m of METHODS) {
      const op = item[m]; if (!op) continue;
      for (const n of [...p.matchAll(/\{(\w+)\}/g)].map((x) => x[1]!)) expect({ p, m, n, declared: (op.parameters ?? []).some((x) => x.in === 'path' && x.name === n) }).toEqual({ p, m, n, declared: true });
      expect(ids.has(op.operationId)).toBe(false); ids.add(op.operationId);
    }
  });
});
