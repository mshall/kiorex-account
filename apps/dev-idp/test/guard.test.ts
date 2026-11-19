import { describe, it, expect, vi } from 'vitest';
import { assertNotProduction } from '../src/guard.js';

describe('production guard', () => {
  it('refuses to start when NODE_ENV=production and prints the banner', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => assertNotProduction({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/production/);
    expect(spy.mock.calls.join('\n')).toMatch(/DEV IDP/);
    spy.mockRestore();
  });
  it('also refuses KX_ENV=prod', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => assertNotProduction({ KX_ENV: 'prod' } as NodeJS.ProcessEnv)).toThrow();
    spy.mockRestore();
  });
  it('allows development and test', () => {
    expect(() => assertNotProduction({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => assertNotProduction({} as NodeJS.ProcessEnv)).not.toThrow();
  });
});
