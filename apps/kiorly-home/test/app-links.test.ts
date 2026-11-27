import { describe, expect, it } from 'vitest';
import { appIdSuffix, renderAppLinks } from '../app-links';

const FP = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':');

describe('Kiorly Home app-link association files (staff app)', () => {
  it('without configuration the templates render as valid JSON with the placeholders and without $comment', () => {
    const r = renderAppLinks({});
    const aasa = JSON.parse(r.aasa); const al = JSON.parse(r.assetlinks);
    expect(aasa.$comment).toBeUndefined();
    expect(aasa.applinks.details[0].appIDs).toEqual(['TODO_NEEDS_HUMAN_APPLE_TEAM_ID.com.kiorly.app']);
    expect(aasa.applinks.details[0].components).toEqual([{ '/': '/open/*' }]);
    expect(al[0].target).toMatchObject({ package_name: 'com.kiorly.app', sha256_cert_fingerprints: ['TODO_NEEDS_HUMAN_SHA256_CERT_FINGERPRINT'] });
    expect(r.placeholders).toBe(true);
  });
  it('team id, fingerprints and the app id suffix come from environment values', () => {
    const r = renderAppLinks({ APPLE_TEAM_ID: 'ABCDE12345', ANDROID_SHA256_CERT_FINGERPRINTS: `${FP}, ${FP.toLowerCase()}`, KX_STAFF_APP_ID_SUFFIX: '.test' });
    expect(JSON.parse(r.aasa).applinks.details[0].appIDs).toEqual(['ABCDE12345.com.kiorly.app.test']);
    const t = JSON.parse(r.assetlinks)[0].target;
    expect(t.package_name).toBe('com.kiorly.app.test');
    expect(t.sha256_cert_fingerprints).toEqual([FP, FP]);
    expect(r.placeholders).toBe(false);
  });
  it('rejects malformed values instead of publishing a broken association', () => {
    expect(() => renderAppLinks({ APPLE_TEAM_ID: 'short' })).toThrow(/Team ID/);
    expect(() => renderAppLinks({ ANDROID_SHA256_CERT_FINGERPRINTS: 'not-a-fingerprint' })).toThrow(/SHA-256/);
    expect(() => appIdSuffix({ KX_STAFF_APP_ID_SUFFIX: 'test' })).toThrow(/dot/);
    expect(appIdSuffix({})).toBe('');
  });
  it('claims /open/* only, never the sign-in callback', () => {
    expect(renderAppLinks({}).aasa).not.toContain('signin');
  });
});
