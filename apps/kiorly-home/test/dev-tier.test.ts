import { describe, it, expect } from 'vitest';
import { devTierFromEnv } from '../dev-tier';

const E = {
  VITE_PASSPORT_ISSUER: 'https://account.dev.example.com', KX_HOME_ORIGIN: 'https://home.dev.example.com/', KX_PRODUCT_URL_CLINIC: 'https://clinic.dev.example.com',
  KX_PRODUCT_URL_PHARMACY: 'https://pharmacy.dev.example.com', KX_PRODUCT_URL_LAB: 'https://lab.dev.example.com',
  KX_API_CLINIC: 'https://api.clinic.dev.example.com', KX_API_PHARMACY: 'https://api.pharmacy.dev.example.com', KX_API_LAB: 'https://api.lab.dev.example.com',
};

describe('kiorly-home dev tier (KX_ENV=dev)', () => {
  it('builds every origin from environment values, trims trailing slashes, and defaults Nurse to the Clinic web app', () => {
    const d = devTierFromEnv(E);
    expect(d).toEqual({ passport: E.VITE_PASSPORT_ISSUER, home: 'https://home.dev.example.com', clinic: E.KX_PRODUCT_URL_CLINIC, nurse: E.KX_PRODUCT_URL_CLINIC, pharmacy: E.KX_PRODUCT_URL_PHARMACY, lab: E.KX_PRODUCT_URL_LAB, api: { clinic: E.KX_API_CLINIC, pharmacy: E.KX_API_PHARMACY, lab: E.KX_API_LAB } });
    expect(devTierFromEnv({ ...E, KX_PRODUCT_URL_NURSE: 'https://nurse.dev.example.com' }).nurse).toBe('https://nurse.dev.example.com');
    expect(JSON.stringify(d)).not.toMatch(/localhost|127\.0\.0\.1/);
  });
  it('fails the build when a value is missing, not https, or localhost', () => {
    for (const k of Object.keys(E)) expect(() => devTierFromEnv({ ...E, [k]: undefined } as never), k).toThrow(new RegExp(k));
    expect(() => devTierFromEnv({ ...E, KX_API_LAB: 'http://api.lab.dev.example.com' })).toThrow(/KX_API_LAB/);
    expect(() => devTierFromEnv({ ...E, KX_HOME_ORIGIN: 'https://localhost:5194' })).toThrow(/KX_HOME_ORIGIN/);
  });
});
