import { useState } from 'react';
import { startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useApp } from '../app-context';
import { useI18n } from '../i18n';
import { Alert, Button, Card, Field, useAction } from '../ui';
import { Link, useRoute } from '../router';
import { safeReturn } from '../util';

/** Fresh second-factor check (KA-10): authenticator code or a user-verifying passkey. Replaces the access token with an acr=mfa one. */
export function StepUpPanel({ onDone, embedded }: { onDone: () => void; embedded?: boolean }) {
  const { api, auth, account, meta } = useApp();
  const { t, err } = useI18n();
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState('');
  const { busy, run } = useAction();
  const canPasskey = !!meta?.passkeys_enabled && browserSupportsWebAuthn();
  const finish = (r: { access_token: string; expires_in: number }) => { auth.setAccessToken(r.access_token, r.expires_in); onDone(); };
  const fail = (e: unknown) => { const a = e as { code?: string; status?: number }; setMsg(err(a.code, a.status)); };

  const submitCode = async () => {
    setMsg('');
    try { finish(await api.stepUpTotp(code.trim())); } catch (e) { fail(e); }
  };
  const usePasskey = async () => {
    setMsg('');
    await run(async () => {
      try {
        const options = await api.stepUpPasskeyOptions();
        const resp = await startAuthentication({ optionsJSON: options as never });
        finish(await api.stepUpPasskey(resp));
      } catch (e) { fail(e); }
    });
  };
  const none = !account.totp_enrolled && !canPasskey;
  return (
    <div className="stepup" data-embedded={embedded || undefined}>
      <p>{t('su.lead')}</p>
      {msg ? <Alert kind="error">{msg}</Alert> : null}
      {none ? <Alert kind="warning">{t('su.noMethod')} <Link to="/account/security">{t('su.setup')}</Link></Alert> : null}
      {account.totp_enrolled ? (
        <form onSubmit={(e) => { e.preventDefault(); void submitCode(); }}>
          <Field label={t('su.totp')}>{(p) => <input {...p} name="totp" className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} data-autofocus />}</Field>
          <Button type="submit" busy={busy} disabled={code.replace(/\s/g, '').length < 6}>{t('su.verify')}</Button>
        </form>
      ) : null}
      {account.totp_enrolled && canPasskey ? <p className="or">{t('su.or')}</p> : null}
      {canPasskey ? <Button variant="secondary" onClick={usePasskey} busy={busy}>{busy ? t('su.waiting') : t('su.passkey')}</Button> : null}
      <p className="hint">{t('su.fresh', { minutes: Math.round((meta?.step_up.freshness_seconds ?? 300) / 60) })}</p>
    </div>
  );
}

/** Standalone step-up page: /account/step-up?return=/account/ops/links */
export function StepUpPage() {
  const { t } = useI18n();
  const { query, navigate } = useRoute();
  const ret = safeReturn(query.get('return'));
  return (
    <>
      <h1>{t('su.title')}</h1>
      <Card title={t('su.title')}><StepUpPanel onDone={() => navigate(ret)} /></Card>
    </>
  );
}
