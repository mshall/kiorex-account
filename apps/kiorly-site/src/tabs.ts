/** Accessible tabs (module selector, journeys, plans): arrow keys, Home and End, roving tabindex. Safe to call again on a list added later. */
export function bindTabs(list: HTMLElement): void {
  const tabs = [...list.querySelectorAll<HTMLButtonElement>('[role=tab]')];
  const select = (t: HTMLButtonElement, focus = false) => {
    for (const x of tabs) { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; const p = document.getElementById(x.getAttribute('aria-controls') ?? ''); if (p) p.hidden = !on; }
    if (focus) t.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      const rtl = document.documentElement.dir === 'rtl'; const next = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); select(tabs[(i + next + tabs.length) % tabs.length]!, true); }
      else if (e.key === 'Home') { e.preventDefault(); select(tabs[0]!, true); } else if (e.key === 'End') { e.preventDefault(); select(tabs[tabs.length - 1]!, true); }
    });
  });
}
