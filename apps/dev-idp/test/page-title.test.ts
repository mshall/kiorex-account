import { describe, it, expect } from 'vitest';
import { page } from '../src/views.js';

describe('Passport page title names the Kiorly admin', () => {
  it('uses the product name for the Kiorly admin context and Kiorex Passport otherwise', () => {
    expect(page('en', 'Sign in', '', { ctx: { product: 'Kiorly Admin', audience: 'ops', mode: 'login' } })).toContain('<title>Sign in - Kiorly Admin</title>');
    expect(page('ar', 'دخول', '', { ctx: { product: 'إدارة كيورلي', audience: 'ops', mode: 'login' } })).toContain('<title>دخول - إدارة كيورلي</title>');
    expect(page('en', 'Sign in', '', { ctx: { product: 'Kiorex Ops', audience: 'ops', mode: 'login' } })).toContain('<title>Sign in - Kiorex Passport</title>');
    expect(page('en', 'Sign in', '')).toContain('<title>Sign in - Kiorex Passport</title>');
  });
});
