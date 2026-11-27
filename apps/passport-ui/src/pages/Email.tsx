import { useState } from 'react';
import { useApp } from '../app-context';
import { useI18n } from '../i18n';
import { ApiError } from '../api';
import { Alert, Async, Badge, Button, Card, ConfirmDialog, Field, Ltr, useAction, useAsync, useToast } from '../ui';

/**
 * Optional verified e-mail (the `email` and `email_verified` claims). The address is never trusted by being typed: the IdP sends a six-digit code
 * (mock e-mail channel in development) and only the code makes it verified. States: none -> code sent (pending) -> confirmed.
 */
export function EmailCard({ onChange }: { onChange: () => void }) {
  const { api } = useApp();
  const { t, err: errText } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const state = useAsync(() => api.emailState(), []);
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null); // set once a code was requested in this view
  const [err, setErr] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const fail = (e: unknown) => { const a = e as ApiError; setErr(errText(a.code, a.status)); };
  const send = async (resend: boolean) => {
    setErr('');
    const target = resend ? (sentTo ?? '') : address;
    try { await api.emailStart(target.trim()); setSentTo(target.trim().toLowerCase()); setCode(''); if (resend) toast.ok(t('email.codeResent')); state.reload(); }
    catch (e) { fail(e); }
  };
  const verify = async () => {
    setErr('');
    try { await api.emailVerify(code.trim()); setSentTo(null); setCode(''); setAddress(''); toast.ok(t('email.verified')); state.reload(); onChange(); }
    catch (e) { fail(e); }
  };
  const remove = () => run(() => api.emailRemove(), () => { setConfirmRemove(false); setSentTo(null); toast.ok(t('email.removed')); state.reload(); onChange(); });
  const reset = () => { setSentTo(null); setCode(''); setErr(''); };

  return (
    <Card title={t('email.title')} lead={t('email.lead')} id="email">
      <Async state={state}>{(d) => {
        const waiting = sentTo !== null || d.pending;
        return (
          <>
            {d.email ? (
              <dl className="rows">
                <div><dt>{t('email.current')}</dt><dd><Ltr>{d.email}</Ltr> <Badge kind={d.email_verified ? 'success' : 'warning'}>{d.email_verified ? t('email.statusVerified') : t('email.statusPending')}</Badge></dd></div>
              </dl>
            ) : <p>{t('email.none')}</p>}
            {err ? <Alert kind="error">{err}</Alert> : null}
            {waiting ? (
              <form onSubmit={(e) => { e.preventDefault(); void verify(); }}>
                <p>{sentTo ? t('email.sent', { email: sentTo }) : t('email.waiting')}</p>
                <Field label={t('email.code')}>{(p) => <input {...p} name="email-code" className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
                <div className="btn-row">
                  <Button type="submit" disabled={code.trim().length < 6}>{t('email.verify')}</Button>
                  <Button variant="secondary" onClick={() => void send(true)} disabled={!sentTo}>{t('email.resend')}</Button>
                  <Button variant="ghost" onClick={reset}>{t('email.change')}</Button>
                </div>
              </form>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); void send(false); }}>
                <Field label={t('email.address')}>{(p) => <input {...p} name="email" type="email" dir="ltr" autoComplete="email" maxLength={254} value={address} onChange={(e) => setAddress(e.target.value)} />}</Field>
                <div className="btn-row">
                  <Button type="submit" disabled={!address.includes('@')}>{t('email.send')}</Button>
                  {d.email ? <Button variant="secondary" onClick={() => setConfirmRemove(true)}>{t('email.remove')}</Button> : null}
                </div>
              </form>
            )}
          </>
        );
      }}</Async>
      {confirmRemove ? <ConfirmDialog title={t('email.removeTitle')} body={t('email.removeBody')} confirmLabel={t('app.remove')} danger busy={busy} onConfirm={() => void remove()} onCancel={() => setConfirmRemove(false)} /> : null}
    </Card>
  );
}
