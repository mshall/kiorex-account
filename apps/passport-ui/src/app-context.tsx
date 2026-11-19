import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Api, Account, Meta } from './api';
import { ApiError } from './api';
import type { Auth, AuthConfig } from './auth';
import { Dialog, Loading } from './ui';
import { StepUpPanel } from './pages/StepUp';
import { useI18n } from './i18n';

export interface AppValue {
  api: Api; auth: Auth; cfg: AuthConfig;
  account: Account; reloadAccount: () => Promise<void>; meta: Meta | null;
  /** Runs `fn`; if the API answers step_up_required, shows the step-up dialog and retries once. */
  withStepUp: <T>(fn: () => Promise<T>) => Promise<T>;
  signOut: () => void;
}
const Ctx = createContext<AppValue | null>(null);
export const useApp = (): AppValue => { const v = useContext(Ctx); if (!v) throw new Error('useApp outside AppProvider'); return v; };

/** Loads the signed-in account + policy once, owns the step-up dialog. Renders children only when the account is known. */
export function AppProvider({ api, auth, cfg, children, onAuthError }: { api: Api; auth: Auth; cfg: AuthConfig; children: ReactNode; onAuthError: () => void }) {
  const { t, setLang } = useI18n();
  const [account, setAccount] = useState<Account>();
  const [meta, setMeta] = useState<Meta | null>(null);
  const [failed, setFailed] = useState(false);
  const [prompt, setPrompt] = useState<{ resolve: () => void; reject: (e: unknown) => void } | null>(null);
  const localeApplied = useRef(false);

  const reloadAccount = useCallback(async () => { setAccount(await api.account()); }, [api]);
  useEffect(() => {
    let live = true;
    Promise.all([api.account(), api.meta().catch(() => null)]).then(([a, m]) => {
      if (!live) return;
      setAccount(a); setMeta(m);
      if (!localeApplied.current) { localeApplied.current = true; try { if (!localStorage.getItem('kx-lang')) setLang(a.locale); } catch { /* ignore */ } }
    }, (e) => { if (live) { if (e instanceof ApiError && e.status === 401) onAuthError(); else setFailed(true); } });
    return () => { live = false; };
  }, [api, onAuthError, setLang]);

  const withStepUp = useCallback(async <T,>(fn: () => Promise<T>): Promise<T> => {
    try { return await fn(); } catch (e) {
      if (!(e instanceof ApiError) || e.code !== 'step_up_required') throw e;
      await new Promise<void>((resolve, reject) => setPrompt({ resolve, reject }));
      return fn();
    }
  }, []);

  const value = useMemo<AppValue | null>(() => account ? { api, auth, cfg, account, reloadAccount, meta, withStepUp, signOut: () => auth.signOut() } : null, [api, auth, cfg, account, reloadAccount, meta, withStepUp]);
  if (failed) return <p role="alert" className="center-note">{t('err.unknown')}</p>;
  if (!value) return <Loading />;
  return (
    <Ctx.Provider value={value}>
      {children}
      {prompt ? (
        <Dialog title={t('su.title')} onClose={() => { prompt.reject(new ApiError(0, 'cancelled')); setPrompt(null); }}>
          <StepUpPanel embedded onDone={() => { prompt.resolve(); setPrompt(null); }} />
        </Dialog>
      ) : null}
    </Ctx.Provider>
  );
}
