/**
 * Public DEV deployment mode.
 *
 * The dev IdP still refuses NODE_ENV/KX_ENV/APP_ENV = production (guard.ts, unchanged). A public DEV environment (App Runner or one Docker host)
 * runs with NODE_ENV=development behind an https URL. That is allowed, but only in this HARDENED mode, which turns the local conveniences OFF
 * unless each is switched on explicitly:
 *   - public mode is on when DEV_IDP_PUBLIC=true OR the ISSUER host is not loopback (so a forgotten flag cannot leave a public host permissive);
 *   - the fixed demo OTP 000000 is accepted only with KX_DEV_OTP_BYPASS=true (the "Test users" quick-pick panel follows it);
 *   - the /dev/* helper routes (inbox with OTP codes, events, simulators, rate-limit reset) answer 404 unless KX_DEV_ENDPOINTS=true;
 *   - start-up fails unless: ISSUER is https, DATABASE_URL is set, KX_WORKSPACE_URL_CLINIC|PHARMACY|LAB are https, KX_COOKIE_KEYS holds at least one key of 32+ characters (no published constant),
 *     and every confidential client has its secret set through KX_CLIENT_OVERRIDES_JSON (the committed dev secrets are public).
 * Local runs and tests (localhost issuer, DEV_IDP_PUBLIC unset) are unchanged.
 */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function isLoopbackIssuer(issuer: string): boolean {
  try { return LOOPBACK.has(new URL(issuer).hostname); } catch { return false; }
}

export function isPublicDeployment(env: NodeJS.ProcessEnv, issuer: string | undefined = env.ISSUER): boolean {
  if ((env.DEV_IDP_PUBLIC ?? '').toLowerCase() === 'true') return true;
  return issuer !== undefined && !isLoopbackIssuer(issuer);
}

export interface PublicCheckInput {
  env: NodeJS.ProcessEnv;
  issuer: string;
  /** confidential client ids and whether each had its secret supplied by KX_CLIENT_OVERRIDES_JSON */
  confidentialClients: Array<{ clientId: string; secretOverridden: boolean }>;
}

/** Returns the list of problems (empty = fine). Pure, so it is unit tested. */
export function publicModeProblems(i: PublicCheckInput): string[] {
  const p: string[] = [];
  let url: URL | undefined;
  try { url = new URL(i.issuer); } catch { /* reported below */ }
  if (!url || url.protocol !== 'https:' || isLoopbackIssuer(i.issuer)) p.push('ISSUER must be the final public https URL (no localhost, no http)');
  else if (url.search || url.hash || url.pathname !== '/') p.push('ISSUER must be an origin only (no path, query or fragment)');
  if (!i.env.DATABASE_URL) p.push('DATABASE_URL must be set (no default database in a public deployment)');
  const keys = (i.env.KX_COOKIE_KEYS ?? '').split(',').map((k) => k.trim()).filter(Boolean);
  if (!keys.length || keys.some((k) => k.length < 32)) p.push('KX_COOKIE_KEYS must hold one or more comma-separated random keys of at least 32 characters');
  for (const k of ['CLINIC', 'PHARMACY', 'LAB']) {
    const v = i.env[`KX_WORKSPACE_URL_${k}`];
    if (!v || !/^https:\/\//.test(v) || isLoopbackIssuer(v)) p.push(`KX_WORKSPACE_URL_${k} must be the https URL of that product's DEV web app (GET /api/workspaces would otherwise hand out localhost)`);
  }
  for (const c of i.confidentialClients) if (!c.secretOverridden) p.push(`confidential client ${c.clientId} still has the committed dev secret: set clientSecret in KX_CLIENT_OVERRIDES_JSON`);
  return p;
}

export function assertPublicConfig(i: PublicCheckInput): void {
  const problems = publicModeProblems(i);
  if (!problems.length) return;
  console.error(`REFUSING TO START (public DEV deployment):\n - ${problems.join('\n - ')}`);
  throw new Error('dev-idp public deployment is misconfigured');
}

export const PUBLIC_DEV_BANNER = `
################################################################################
#  KIOREX PASSPORT DEV IDP - PUBLIC DEV DEPLOYMENT (synthetic data only)       #
#  Never put real people, real phone numbers or production products behind    #
#  this server. Production identity is the managed IdP (Cognito).              #
################################################################################
`;
