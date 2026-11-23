import type { CardKey } from './core';
declare const __KX_HOME__: { tier: string; issuer: string; home: string; products: Record<CardKey, string> } | undefined;
/** Build-time environment (vite.config.ts define). Falls back to local defaults under unit tests. */
export const ENV = typeof __KX_HOME__ !== 'undefined' ? __KX_HOME__ : { tier: 'local', issuer: 'http://localhost:4400', home: 'http://localhost:5194', products: { clinic: 'http://localhost:5174', nurse: 'http://localhost:5174', pharmacy: 'http://localhost:5192', lab: 'http://localhost:5193' } };
export const IDP_BASE = '/idp';
export const CLIENT_ID = 'kiorly-home';
export const SCOPE = 'openid profile phone kx kx_org';
