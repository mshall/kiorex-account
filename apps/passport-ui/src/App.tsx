import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { Api } from './api';
import type { Auth, AuthConfig } from './auth';
import { AppProvider, useApp } from './app-context';
import { useI18n, type TKey } from './i18n';
import { Link, navigate, useRoute } from './router';
import { Loading, ToastProvider, Alert, Button, PulseLine } from './ui';
import { safeReturn } from './util';
import { KiorexLogo } from './brand/kiorex-logo/KiorexLogo.web';
import { HomePage } from './pages/Home';
import { SecurityPage } from './pages/Security';
import { FamilyPage } from './pages/Family';
import { LinkedPage } from './pages/Linked';
import { OpsLinksPage } from './pages/OpsLinks';
import { OpsMfaPage } from './pages/OpsMfa';
import { OpsLimitsPage } from './pages/OpsLimits';
import { OrgsPage } from './pages/Orgs';
import { PrivacyPage } from './pages/Privacy';
import { AppsPage } from './pages/Apps';
import { StepUpPage } from './pages/StepUp';

type Theme = 'light' | 'dark' | 'system';
/** LIGHT is the default (founder, 24 Nov 2026). Only an explicit Dark / System choice is stored (`kx-theme`, per origin) and restored; the boot script in the HTML shell applies it before first paint. */
function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => { try { const v = localStorage.getItem('kx-theme'); return v === 'dark' || v === 'system' ? v : 'light'; } catch { return 'light'; } });
  const setTheme = (next: Theme) => {
    setThemeState(next);
    document.documentElement.dataset.theme = next === 'system' ? 'auto' : next; // 'auto' = follow the OS (tokens.css)
    try { localStorage.setItem('kx-theme', next); } catch { /* storage blocked: applies to this visit only */ }
  };
  return [theme, setTheme];
}

/** KIOREX lockup (founder spec 25 Nov 2026), trimmed to its ink box (the viewBox carries the clear space). Colours follow html[data-theme] (dark / auto = OS). */
function Brand({ height = 64 }: { height?: number }) {
  return <span className="brand"><KiorexLogo variant="full" height={height} title="Kiorex Passport" style={{ margin: `${-0.2 * height}px ${-0.9654 * height}px ${-0.2 * height}px ${-0.1846 * height}px`, maxWidth: 'none' }} /></span>;
}

function Toolbar() {
  const { t, lang, setLang } = useI18n();
  const [theme, setTheme] = useTheme();
  return (
    <div className="toolbar">
      <label className="sr-only" htmlFor="kx-theme">{t('app.theme')}</label>
      <select id="kx-theme" value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
        <option value="light">{t('theme.light')}</option><option value="dark">{t('theme.dark')}</option><option value="system">{t('theme.system')}</option>
      </select>
      <button type="button" className="btn btn-ghost" lang={lang === 'ar' ? 'en' : 'ar'} onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}>{lang === 'ar' ? 'English' : 'العربية'}</button>
    </div>
  );
}

const NAV: Array<{ to: string; key: TKey; ops?: boolean }> = [
  { to: '/account', key: 'nav.home' }, { to: '/account/security', key: 'nav.security' }, { to: '/account/family', key: 'nav.family' },
  { to: '/account/linked', key: 'nav.linked' }, { to: '/account/orgs', key: 'nav.orgs' }, { to: '/account/privacy', key: 'nav.privacy' },
  { to: '/account/apps', key: 'nav.apps' }, { to: '/account/ops/links', key: 'nav.ops', ops: true }, { to: '/account/ops/mfa', key: 'nav.mfa', ops: true }, { to: '/account/ops/limits', key: 'nav.limits', ops: true },
];

function Shell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { account, signOut } = useApp();
  const { path } = useRoute();
  const isOps = account.roles.some((r) => r === 'ops_admin' || r === 'super_admin');
  return (
    <>
      <a className="skip" href="#main">{t('app.skip')}</a>
      <header className="topbar">
        <Link to="/account" className="brand-link" aria-label="Kiorex Passport"><Brand /></Link>
        <Toolbar />
        <Button variant="ghost" onClick={signOut}>{t('app.signOut')}</Button>
      </header>
      <nav className="tabs" aria-label={t('app.mainNav')}>
        {NAV.filter((n) => !n.ops || isOps).map((n) => (
          <Link key={n.to} to={n.to} aria-current={path === n.to ? 'page' : undefined} className={path === n.to ? 'tab active' : 'tab'}>{t(n.key)}</Link>
        ))}
      </nav>
      <main id="main" tabIndex={-1}>{children}</main>
      <footer className="foot"><span>{t('app.devNote')}</span></footer>
    </>
  );
}

function Routes() {
  const { path } = useRoute();
  const { t } = useI18n();
  switch (path) {
    case '/account': return <HomePage />;
    case '/account/security': return <SecurityPage />;
    case '/account/family': return <FamilyPage />;
    case '/account/linked': return <LinkedPage />;
    case '/account/orgs': return <OrgsPage />;
    case '/account/privacy': return <PrivacyPage />;
    case '/account/apps': return <AppsPage />;
    case '/account/step-up': return <StepUpPage />;
    case '/account/ops/links': return <OpsLinksPage />;
    case '/account/ops/mfa': return <OpsMfaPage />;
    case '/account/ops/limits': return <OpsLimitsPage />;
    default: return <><h1>404</h1><p>{t('app.notFound')}</p><Link to="/account">{t('nav.home')}</Link></>;
  }
}

export function SignInPage({ notice, auth }: { notice?: 'expired' | 'failed' | 'deleted'; auth: Auth }) {
  const { t, lang } = useI18n();
  const { path, query } = useRoute();
  const invite = query.get('invite');
  const go = () => { const ret = path === '/account/callback' || query.get('deleted') ? '/account' : safeReturn(path) + (invite ? `?invite=${encodeURIComponent(invite)}` : ''); void auth.startLogin(ret, lang); };
  return (
    <>
      <header className="topbar"><span className="brand-link"><Brand /></span><Toolbar /></header>
      <main id="main" className="signin" tabIndex={-1}>
        {notice === 'deleted' ? <Alert kind="success"><strong>{t('signin.deleted.title')}</strong> {t('signin.deleted.body')}</Alert> : null}
        {notice === 'expired' ? <Alert kind="warning">{t('signin.expired')}</Alert> : null}
        {notice === 'failed' ? <Alert kind="error">{t('signin.failed')}</Alert> : null}
        <div className="card hero-card">
          <div className="hero">
            <span aria-hidden="true"><PulseLine size={24} label="" /></span>
            <h1>{t('signin.title')}</h1>
            <p className="lead">{t('signin.lead')}</p>
            <Button onClick={go}>{t('signin.cta')}</Button>
            <p className="secure"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></svg>{lang === 'ar' ? 'تسجيل دخول آمن برمز يُرسل إلى هاتفك' : 'Secure sign-in with a code sent to your phone'}</p>
          </div>
        </div>
      </main>
      <footer className="foot"><span>{t('app.devNote')}</span></footer>
    </>
  );
}

function Callback({ auth }: { auth: Auth }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    auth.handleCallback(window.location.search).then((r) => { if (live) navigate(safeReturn(r.returnTo), true); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [auth]);
  if (failed) return <SignInPage auth={auth} notice="failed" />;
  return <main id="main" className="signin"><Loading label={t('signin.working')} /></main>;
}

export function App({ auth, api, cfg }: { auth: Auth; api: Api; cfg: AuthConfig }) {
  const { path, query } = useRoute();
  const [signedIn, setSignedIn] = useState(() => auth.hasSession());
  const [notice, setNotice] = useState<'expired' | undefined>();
  const onAuthError = useCallback(() => { auth.clear(); setNotice('expired'); setSignedIn(false); }, [auth]);
  useEffect(() => { if (path !== '/account/callback') setSignedIn(auth.hasSession()); }, [path, auth]);
  if (path === '/account/callback') return <Callback auth={auth} />;
  if (!signedIn) return <SignInPage auth={auth} notice={query.get('deleted') ? 'deleted' : notice} />;
  return (
    <ToastProvider>
      <AppProvider api={api} auth={auth} cfg={cfg} onAuthError={onAuthError}>
        <Shell><Routes /></Shell>
      </AppProvider>
    </ToastProvider>
  );
}
