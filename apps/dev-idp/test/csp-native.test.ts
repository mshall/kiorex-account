import { describe, expect, it } from 'vitest';
import { send, setNativeFormActionSchemes } from '../src/http.js';

function cspOf(): string {
  let headers: Record<string, string> = {};
  const res = { writeHead: (_s: number, h: Record<string, string>) => { headers = h; }, end: () => undefined };
  send(res as never, 200, '<p>x</p>');
  return headers['content-security-policy']!;
}

describe('form-action CSP covers the native client schemes', () => {
  it('lets the post-form redirect reach kiorex://, kiorly:// and legacy kiorlyteam:// (iOS auth session), never wildcards', () => {
    setNativeFormActionSchemes(['kiorex://auth/callback', 'http://localhost:8081/auth/callback', 'kiorlyteam://auth/callback', 'exp+kiorly-team://auth/callback', 'kiorly://auth/callback', 'exp+kiorly://auth/callback', 'kiorex://auth/logout']);
    const fa = /form-action ([^;]+)/.exec(cspOf())![1]!.split(' ');
    expect(fa).toEqual(expect.arrayContaining(["'self'", 'http:', 'https:', 'kiorex:', 'kiorlyteam:', 'exp+kiorly-team:', 'kiorly:', 'exp+kiorly:']));
    expect(fa.filter((x) => x === 'kiorex:')).toHaveLength(1);
    expect(fa).not.toContain('*');
  });
});
