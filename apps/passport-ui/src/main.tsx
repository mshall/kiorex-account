import { createRoot } from 'react-dom/client';
import './styles.css';
import { App } from './App';
import { Auth, type AuthConfig } from './auth';
import { createApi } from './api';
import { I18nProvider } from './i18n';

const raw = document.getElementById('kx-config')?.textContent;
const cfg: AuthConfig = raw ? JSON.parse(raw) : { issuer: window.location.origin, clientId: 'kiorex-passport-web' };
const auth = new Auth(cfg);
const api = createApi(cfg.issuer, auth);

createRoot(document.getElementById('root')!).render(
  <I18nProvider><App auth={auth} api={api} cfg={cfg} /></I18nProvider>,
);
