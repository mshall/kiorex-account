import type { IdpConfig } from './config.js';
import { domainsFor, tierFromEnv, type Tier } from '../../../config/domains.js';

/**
 * ADR-038: the workspaces a signed-in person belongs to, for Kiorly Home (one web sign-in).
 * Source today = Passport organisation memberships (identity-level HINTS, ADR-013): the product comes from the organisation's
 * `product_refs` keys (`kiorly_*_tenant_id`), defaulting to Clinic; the edition (CLINIC|NURSE) is the organisation's display hint.
 * Seam: once the Passport-to-staff links in the three product APIs are authoritative, they replace/confirm this derivation; the
 * response shape stays the same. No clinical data, no secrets; product URLs are config.
 */
export type WorkspaceProduct = 'clinic' | 'pharmacy' | 'lab';
export interface Workspace {
  id: string; product: WorkspaceProduct; edition: 'CLINIC' | 'NURSE' | null; org_id: string; org_name: string; role: string;
  product_url: string; product_ref: string | null; source: 'passport_membership';
}
interface Row { org_id: string; legal_name: string; edition: string; product_refs: Record<string, string> | null; role_hint: string }

export function workspaceUrl(product: WorkspaceProduct, edition: string | null, env: NodeJS.ProcessEnv = process.env, tier: Tier = tierFromEnv(env.KX_ENV)): string {
  const nurse = product === 'clinic' && edition === 'NURSE';
  const override = (nurse ? env.KX_WORKSPACE_URL_NURSE : undefined) ?? env[`KX_WORKSPACE_URL_${product.toUpperCase()}`];
  return (override ?? domainsFor(tier)[nurse ? 'nurse' : product]).replace(/\/+$/, '');
}

export function deriveWorkspaces(rows: Row[], cfg: IdpConfig, env: NodeJS.ProcessEnv = process.env, tier: Tier = tierFromEnv(env.KX_ENV)): Workspace[] {
  const w = cfg.workspaces;
  const out: Workspace[] = [];
  for (const r of rows) {
    const refs = r.product_refs ?? {};
    const products = (['clinic', 'pharmacy', 'lab'] as const).filter((k) => w?.products[k] && refs[w.products[k].refKey]);
    const list: WorkspaceProduct[] = products.length ? [...products] : [w?.defaultProduct ?? 'clinic'];
    for (const product of list) {
      const edition = product === 'clinic' ? (r.edition === 'NURSE' ? 'NURSE' : 'CLINIC') : null;
      out.push({
        id: `${r.org_id}:${product}`, product, edition, org_id: r.org_id, org_name: r.legal_name, role: r.role_hint,
        product_url: workspaceUrl(product, edition, env, tier), product_ref: w ? refs[w.products[product].refKey] ?? null : null, source: 'passport_membership',
      });
    }
  }
  return out;
}
