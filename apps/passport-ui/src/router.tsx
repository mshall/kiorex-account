import { useCallback, useEffect, useState, type AnchorHTMLAttributes, type MouseEvent } from 'react';

const EVT = 'kx:navigate';

export function navigate(to: string, replace = false): void {
  if (replace) window.history.replaceState({}, '', to); else window.history.pushState({}, '', to);
  window.dispatchEvent(new Event(EVT));
}

export function useRoute(): { path: string; query: URLSearchParams; navigate: typeof navigate } {
  const read = () => ({ path: window.location.pathname.replace(/\/+$/, '') || '/', search: window.location.search });
  const [loc, setLoc] = useState(read);
  useEffect(() => {
    const on = () => setLoc(read());
    window.addEventListener('popstate', on); window.addEventListener(EVT, on);
    return () => { window.removeEventListener('popstate', on); window.removeEventListener(EVT, on); };
  }, []);
  const query = new URLSearchParams(loc.search);
  const nav = useCallback(navigate, []);
  return { path: loc.path, query, navigate: nav };
}

/** In-app link: client-side navigation for plain left clicks, normal anchor semantics otherwise. */
export function Link({ to, onClick, children, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={click} {...rest}>{children}</a>;
}
