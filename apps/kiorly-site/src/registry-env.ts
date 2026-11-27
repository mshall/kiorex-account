/**
 * Derives the registry-backed values of the site build (this site = service `kiorly.marketing`, sign-in = `kiorly.app`, join requests = `kiorex.api` /api/v1/public/leads) from the service URL registry
 * (ADR-059), using the registry's own validator module. Nothing is typed here: the hosts exist only in _docs/registry/service-url-registry.yaml.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SITE_SERVICE = 'kiorly.marketing';
export const HOME_SERVICE = 'kiorly.app';
export const API_SERVICE = 'kiorex.api';

interface Registry { environments: Array<{ id: string }> }
interface RegistryModule { load(file: string): Registry; hostOf(reg: Registry, service: string, env: string): string | null }

export function defaultRegistryFile(): string { return process.env.KX_REGISTRY_FILE || path.resolve(here, '../../../../_docs/registry/service-url-registry.yaml'); }

export async function loadRegistryEnv(envId: string, registryFile = defaultRegistryFile()): Promise<Record<string, string>> {
  if (!existsSync(registryFile)) throw new Error(`registry not found at ${registryFile}: pass --registry <file> or set KX_REGISTRY_FILE (it lives in the workspace repository, _docs/registry), or set KIORLY_SITE_ORIGIN and KIORLY_HOME_URL yourself`);
  const mod = (await import(pathToFileURL(path.join(path.dirname(registryFile), 'validate-registry.mjs')).href)) as RegistryModule;
  const reg = mod.load(registryFile);
  if (!reg.environments.some((e) => e.id === envId)) throw new Error(`unknown environment "${envId}" in the registry`);
  const site = mod.hostOf(reg, SITE_SERVICE, envId); const home = mod.hostOf(reg, HOME_SERVICE, envId);
  if (!site || !home) throw new Error(`the registry has no host for ${SITE_SERVICE} or ${HOME_SERVICE} in ${envId}`);
  const api = mod.hostOf(reg, API_SERVICE, envId);
  return { KIORLY_SITE_ORIGIN: `https://${site}`, KIORLY_HOME_URL: `https://${home}`, ...(api ? { KIORLY_LEAD_ENDPOINT: `https://${api}/api/v1/public/leads` } : {}) };
}
