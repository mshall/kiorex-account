import { test, expect, type Page } from '@playwright/test';

/**
 * Visual regression for the "What does connecting to Kiorex add?" diagram: the Arabic diagram must be the exact horizontal mirror of the English one
 * (node boxes, dots, arrows), with the labels inside their nodes, never overlapping a node icon, never clipped, and nodes never overlapping each other.
 * Compared by bounding boxes relative to the figure's SVG, at phone, tablet and desktop widths, and attached as screenshots.
 */
type Box = { x: number; y: number; w: number; h: number };
type Snap = { svg: Box; nodes: Record<string, Box>; dots: Record<string, Box>; arrows: Record<string, Box>; labels: Record<string, Box> };

async function snap(page: Page, lang: string, width: number): Promise<Snap> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/${lang}/`);
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('is-in')));
  const fig = page.locator('figure.diagram'); await fig.scrollIntoViewIfNeeded(); await page.waitForTimeout(300);
  await test.info().attach(`diagram-${lang}-${width}`, { body: await fig.screenshot(), contentType: 'image/png' });
  return page.evaluate(() => {
    const svg = [...document.querySelectorAll('figure.diagram svg.art')].find((e) => (e as SVGElement).getClientRects().length > 0)!; const s = svg.getBoundingClientRect();
    const rel = (el: Element): Box => { const b = el.getBoundingClientRect(); return { x: b.x - s.x, y: b.y - s.y, w: b.width, h: b.height }; };
    const pick = (attr: string) => Object.fromEntries([...svg.querySelectorAll(`[${attr}]`)].map((e) => [e.getAttribute(attr)!, rel(e)]));
    return { svg: { x: 0, y: 0, w: s.width, h: s.height }, nodes: pick('data-node'), dots: pick('data-dot'), arrows: pick('data-arrow'), labels: pick('data-label') };
  });
}
const inside = (a: Box, b: Box, pad = 0.5) => a.x >= b.x - pad && a.y >= b.y - pad && a.x + a.w <= b.x + b.w + pad && a.y + a.h <= b.y + b.h + pad;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// 390 renders the portrait (phone) diagram, 768 and 1440 the wide one
for (const width of [390, 768, 1440]) {
  test(`the Arabic diagram is the mirror of the English one at ${width}px`, async ({ page }) => {
    const en = await snap(page, 'en', width); const ar = await snap(page, 'ar', width);
    const tol = Math.max(1.5, en.svg.w * 0.004); const W = en.svg.w;
    expect(Math.abs(ar.svg.w - en.svg.w)).toBeLessThan(1); expect(Math.abs(ar.svg.h - en.svg.h)).toBeLessThan(1);
    for (const group of ['nodes', 'dots', 'arrows'] as const) {
      expect(Object.keys(ar[group]).sort()).toEqual(Object.keys(en[group]).sort());
      for (const [id, e] of Object.entries(en[group])) {
        const a = ar[group][id]!;
        expect(Math.abs(a.x - (W - e.x - e.w)), `${group}.${id} x mirrors`).toBeLessThanOrEqual(tol);
        expect(Math.abs(a.y - e.y), `${group}.${id} y`).toBeLessThanOrEqual(tol);
        expect(Math.abs(a.w - e.w), `${group}.${id} width`).toBeLessThanOrEqual(tol);
        expect(Math.abs(a.h - e.h), `${group}.${id} height`).toBeLessThanOrEqual(tol);
      }
    }
    // the three product nodes sit left of the marketplace and the patient to its right in Arabic (reverse of English)
    if (width > 640) {
      expect(en.nodes.patient!.x).toBeLessThan(en.nodes.kiorex!.x); expect(en.nodes.kiorex!.x).toBeLessThan(en.nodes.clinic!.x);
      expect(ar.nodes.patient!.x).toBeGreaterThan(ar.nodes.kiorex!.x); expect(ar.nodes.kiorex!.x).toBeGreaterThan(ar.nodes.clinic!.x);
    } else { // portrait: the three products sit in a row, clinic first (left in English, right in Arabic)
      expect(en.nodes.clinic!.x).toBeLessThan(en.nodes.pharmacy!.x); expect(en.nodes.pharmacy!.x).toBeLessThan(en.nodes.lab!.x);
      expect(ar.nodes.clinic!.x).toBeGreaterThan(ar.nodes.pharmacy!.x); expect(ar.nodes.pharmacy!.x).toBeGreaterThan(ar.nodes.lab!.x);
    }
    for (const [name, d] of [['en', en], ['ar', ar]] as const) {
      const ids = Object.keys(d.nodes);
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) expect(overlap(d.nodes[ids[i]!]!, d.nodes[ids[j]!]!), `${name}: nodes ${ids[i]} and ${ids[j]} overlap`).toBe(false);
      for (const id of ['clinic', 'pharmacy', 'lab']) {
        const label = d.labels[id]!; expect(inside(label, d.nodes[id]!), `${name}: label ${id} inside its node`).toBe(true);
        expect(overlap(label, d.dots[id]!), `${name}: label ${id} clear of its icon`).toBe(false);
        // the label sits on the far side of the icon from the marketplace edge: right of it in English, left of it in Arabic
        const sameRow = label.y < d.dots[id]!.y + d.dots[id]!.h && label.y + label.h > d.dots[id]!.y; // portrait (phone) layout stacks the label under the icon
        if (!sameRow) continue;
        if (name === 'en') expect(label.x).toBeGreaterThanOrEqual(d.dots[id]!.x + d.dots[id]!.w - 0.5); else expect(label.x + label.w).toBeLessThanOrEqual(d.dots[id]!.x + 0.5);
      }
      for (const [id, l] of Object.entries(d.labels)) expect(inside(l, d.svg, 0.5), `${name}: label ${id} not clipped by the figure`).toBe(true);
      // arrows touch the nodes they join
      const touch = (arrow: string, from: string, to: string) => { const a = d.arrows[arrow]!; for (const n of [from, to]) { const b = d.nodes[n]!; expect(a.x <= b.x + b.w + 6 && a.x + a.w >= b.x - 6 && a.y <= b.y + b.h + 6 && a.y + a.h >= b.y - 6, `${name}: arrow ${arrow} reaches ${n}`).toBe(true); } };
      touch('search', 'patient', 'kiorex'); touch('confirm', 'kiorex', 'patient'); touch('to-clinic', 'kiorex', 'clinic'); touch('to-pharmacy', 'kiorex', 'pharmacy'); touch('to-lab', 'kiorex', 'lab'); touch('com-clinic', 'clinic', 'kiorex'); touch('com-pharmacy', 'pharmacy', 'kiorex');
    }
  });
}
