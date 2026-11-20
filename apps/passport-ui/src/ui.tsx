import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useI18n, NEEDS_HUMAN_KEYS } from './i18n';
import { ApiError } from './api';
import { PulseLine } from './brand/components/web/KiorexLogo';

export function Button({ variant = 'primary', busy, children, className = '', ...rest }: { variant?: 'primary' | 'secondary' | 'danger' | 'ghost'; busy?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...rest} disabled={rest.disabled || busy} aria-busy={busy || undefined} className={`btn btn-${variant} ${className}`}>{children}</button>;
}

export function Card({ title, lead, children, actions, id }: { title: ReactNode; lead?: ReactNode; children?: ReactNode; actions?: ReactNode; id?: string }) {
  const hid = useId();
  return (
    <section className="card" aria-labelledby={hid} id={id}>
      <header className="card-head"><div><h2 id={hid}>{title}</h2>{lead ? <p className="lead">{lead}</p> : null}</div>{actions ? <div className="card-actions">{actions}</div> : null}</header>
      {children}
    </section>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: (p: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode }) {
  const id = useId(); const hid = `${id}-h`; const eid = `${id}-e`;
  const describedby = [hint ? hid : '', error ? eid : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-describedby': describedby, 'aria-invalid': error ? true : undefined })}
      {hint ? <div className="hint" id={hid}>{hint}</div> : null}
      {error ? <div className="field-error" id={eid} role="alert">{error}</div> : null}
    </div>
  );
}

export function Alert({ kind = 'info', children, role }: { kind?: 'info' | 'error' | 'success' | 'warning'; children: ReactNode; role?: 'alert' | 'status' }) {
  return <div className={`alert alert-${kind}`} role={role ?? (kind === 'error' ? 'alert' : 'status')}>{children}</div>;
}

export function Badge({ kind = 'neutral', children }: { kind?: 'neutral' | 'success' | 'warning' | 'info' | 'danger'; children: ReactNode }) {
  return <span className={`badge badge-${kind}`}>{children}</span>;
}

export function Loading({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="loading" role="status" aria-live="polite">
      <span aria-hidden="true"><PulseLine size={16} loop label="" /></span>
      <span>{label ?? t('app.loading')}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t, err } = useI18n();
  const e = error instanceof ApiError ? error : undefined;
  const msg = e?.status === 0 ? t('err.network') : err(e?.code, e?.status);
  return <div className="alert alert-error" role="alert"><span>{msg}</span>{onRetry ? <Button variant="secondary" onClick={onRetry}>{t('app.retry')}</Button> : null}</div>;
}

export function Empty({ children }: { children: ReactNode }) { return <p className="empty">{children}</p>; }

/** Visible marker for copy that still needs legal / clinical review (NEEDS_HUMAN). */
export function DraftNote({ k }: { k: (typeof NEEDS_HUMAN_KEYS)[number] }) {
  const { t } = useI18n();
  return <p className="draft" data-needs-human={k.replace('draft.', '')}><span className="badge badge-warning">{t('draft.badge')}</span> <span>{t(k)}</span></p>;
}

/** bdi/ltr wrapper for phone numbers, ids and codes inside RTL text. */
export function Ltr({ children }: { children: ReactNode }) { return <bdi dir="ltr" className="ltr">{children}</bdi>; }

// ---------- async data ----------
export interface AsyncState<T> { data: T | undefined; error: unknown; loading: boolean; reload: () => void; set: (v: T) => void }
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn); fnRef.current = fn;
  useEffect(() => {
    let live = true;
    setLoading(true);
    fnRef.current().then((v) => { if (live) { setData(v); setError(undefined); } }, (e) => { if (live) setError(e); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, loading, reload, set: setData };
}

export function Async<T>({ state, children }: { state: AsyncState<T>; children: (data: T) => ReactNode }) {
  if (state.error && state.data === undefined) return <ErrorState error={state.error} onRetry={state.reload} />;
  if (state.data === undefined) return <Loading />;
  return <>{children(state.data)}</>;
}

// ---------- toasts ----------
interface ToastApi { ok(msg: string): void; fail(e: unknown): void; info(msg: string): void }
const ToastCtx = createContext<ToastApi | null>(null);
export function useToast(): ToastApi { const v = useContext(ToastCtx); if (!v) throw new Error('useToast outside ToastProvider'); return v; }

export function ToastProvider({ children }: { children: ReactNode }) {
  const { err, t } = useI18n();
  const [items, setItems] = useState<Array<{ id: number; kind: 'success' | 'error' | 'info'; msg: string }>>([]);
  const seq = useRef(0);
  const push = useCallback((kind: 'success' | 'error' | 'info', msg: string) => {
    const id = ++seq.current;
    setItems((a) => [...a.slice(-2), { id, kind, msg }]);
    setTimeout(() => setItems((a) => a.filter((x) => x.id !== id)), kind === 'error' ? 9000 : 5000);
  }, []);
  const api: ToastApi = {
    ok: (m) => push('success', m), info: (m) => push('info', m),
    fail: (e) => { const a = e instanceof ApiError ? e : undefined; if (a?.code === 'step_up_required' || a?.code === 'cancelled') return; push('error', a?.status === 0 ? t('err.network') : err(a?.code, a?.status)); },
  };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite" role="status">
        {items.map((i) => <div key={i.id} className={`toast toast-${i.kind}`}>{i.msg}<button type="button" className="toast-x" aria-label={t('app.close')} onClick={() => setItems((a) => a.filter((x) => x.id !== i.id))}>×</button></div>)}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- dialog ----------
export function Dialog({ title, onClose, children, labelledBy }: { title: string; onClose: () => void; children: ReactNode; labelledBy?: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const hid = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('[data-autofocus], input, button, select, textarea');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && ref.current) {
        const f = [...ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        const a = document.activeElement;
        if (e.shiftKey && a === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? hid} ref={ref}>
        <div className="dialog-head"><h2 id={labelledBy ?? hid}>{title}</h2><button type="button" className="icon-btn" aria-label={t('app.close')} onClick={onClose}>×</button></div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({ title, body, confirmLabel, danger, busy, onConfirm, onCancel, children }: {
  title: string; body?: ReactNode; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void; children?: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <Dialog title={title} onClose={onCancel}>
      {body ? <p>{body}</p> : null}
      {children}
      <div className="dialog-actions">
        <Button variant="secondary" onClick={onCancel} data-autofocus>{t('app.cancel')}</Button>
        <Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}

/** Runs an async action with a busy flag; surfaces failures as toasts (step-up is handled by the caller). */
export function useAction(): { busy: boolean; run: <T>(fn: () => Promise<T>, onOk?: (v: T) => void) => Promise<T | undefined> } {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async <T,>(fn: () => Promise<T>, onOk?: (v: T) => void) => {
    setBusy(true);
    try { const v = await fn(); onOk?.(v); return v; } catch (e) { toast.fail(e); return undefined; } finally { setBusy(false); }
  }, [toast]);
  return { busy, run };
}
