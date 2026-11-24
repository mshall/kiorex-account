import { describe, it, expect } from 'vitest';
import { DEV_CSS } from '../src/dev-test-users.js';

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
};
const ratio = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x! + 0.05) / (y! + 0.05); };

describe('DEV tag colour contrast (axe color-contrast, WCAG AA 4.5:1), same chip in light and dark', () => {
  const rule = /\.tag\{[^}]*\}/.exec(DEV_CSS)![0];
  it('uses the brand coral-950 ink on the coral-500 pill, not white', () => {
    expect(rule).toContain('color:var(--kx-coral-950,#261826)');
    expect(rule).toContain('background:var(--kx-coral-500,#E8735E)');
    expect(rule).not.toMatch(/[^-]color:#fff/);
  });
  it('the fallback colours meet AA', () => { expect(ratio('#261826', '#E8735E')).toBeGreaterThanOrEqual(4.5); expect(ratio('#FFFFFF', '#E8735E')).toBeLessThan(4.5); });
});
