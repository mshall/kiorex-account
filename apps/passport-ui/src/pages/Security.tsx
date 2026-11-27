import { useState } from 'react';
import { startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useApp } from '../app-context';
import { useI18n, translate, clientName } from '../i18n';
import { ApiError, type Passkey, type SecurityEvent } from '../api';
import { Alert, Async, Badge, Button, Card, ConfirmDialog, Empty, ErrorState, Field, Ltr, useAction, useAsync, useToast } from '../ui';
import { describeDevice, fmtDate } from '../util';
import { EmailCard } from './Email';

function PasskeysCard({ onChange }: { onChange: () => void }) {
  const { api, meta } = useApp();
  const { t, lang } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const list = useAsync<Passkey[] | 'disabled'>(async () => {
    if (meta && !meta.passkeys_enabled) return 'disabled';
    try { return await api.passkeys(); } catch (e) { if (e instanceof ApiError && e.code === 'feature_disabled') return 'disabled'; throw e; }
  }, []);
  const [removing, setRemoving] = useState<Passkey | null>(null);
  const supported = typeof window !== 'undefined' && browserSupportsWebAuthn();

  const add = () => run(async () => {
    try {
      const options = await api.passkeyOptions();
      const att = await startRegistration({ optionsJSON: options as never });
      await api.passkeyVerify(att);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      toast.info(t('pk.cancelled')); return false;
    }
    return true;
  }, (ok) => { if (ok) { toast.ok(t('pk.added')); list.reload(); onChange(); } });

  const remove = () => removing && run(() => api.passkeyRemove(removing.credential_id), () => { toast.ok(t('pk.removed')); setRemoving(null); list.reload(); onChange(); });

  return (
    <Card title={t('pk.title')} lead={t('pk.lead')} id="passkeys">
      <Async state={list}>{(d) => d === 'disabled' ? <Alert kind="info">{t('pk.disabled')}</Alert> : (
        <>
          {d.length === 0 ? <Empty>{t('pk.empty')}</Empty> : (
            <ul className="list" aria-label={t('pk.title')}>
              {d.map((p) => (
                <li key={p.credential_id} className="row">
                  <div><strong>{p.backed_up ? t('pk.synced') : t('pk.device')}</strong><div className="hint">{t('pk.createdOn', { date: fmtDate(p.created_at, lang) })} - <Ltr>{p.credential_id.slice(0, 8)}</Ltr></div></div>
                  <Button variant="secondary" onClick={() => setRemoving(p)} aria-label={`${t('app.remove')} - ${p.credential_id.slice(0, 8)}`}>{t('app.remove')}</Button>
                </li>
              ))}
            </ul>
          )}
          {supported ? <Button onClick={add} busy={busy}>{busy ? t('pk.adding') : t('pk.add')}</Button> : <Alert kind="info">{t('pk.unsupported')}</Alert>}
        </>
      )}</Async>
      {removing ? <ConfirmDialog title={t('pk.removeTitle')} body={t('pk.removeBody')} confirmLabel={t('app.remove')} danger busy={busy} onConfirm={() => void remove()} onCancel={() => setRemoving(null)} /> : null}
    </Card>
  );
}

function TotpCard({ onChange }: { onChange: () => void }) {
  const { api, account, reloadAccount, withStepUp } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const [enrol, setEnrol] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [confirmOff, setConfirmOff] = useState(false);
  const [err, setErr] = useState('');
  const { err: errText } = useI18n();

  const start = () => run(() => api.totpEnroll(), (e) => setEnrol(e));
  const confirm = async () => {
    setErr('');
    try { await api.totpConfirm(code.trim()); setEnrol(null); setCode(''); await reloadAccount(); onChange(); toast.ok(t('totp.enabled')); }
    catch (e) { const a = e as ApiError; setErr(errText(a.code, a.status)); }
  };
  const disable = () => run(() => withStepUp(() => api.totpDisable()), async () => { setConfirmOff(false); await reloadAccount(); onChange(); toast.ok(t('totp.disabled')); });

  return (
    <Card title={t('totp.title')} lead={t('totp.lead')} id="totp"
      actions={<Badge kind={account.totp_enrolled ? 'success' : 'neutral'}>{account.totp_enrolled ? t('home.sec.on') : t('home.sec.off')}</Badge>}>
      {account.totp_enrolled ? (
        <>
          <p>{t('totp.on')}</p>
          {account.mfa_required ? <Alert kind="info">{account.mfa_required_by === 'policy' ? t('totp.requiredPolicy') : t('totp.required')}</Alert> : <Button variant="secondary" onClick={() => setConfirmOff(true)}>{t('totp.disable')}</Button>}
        </>
      ) : enrol ? (
        <form onSubmit={(e) => { e.preventDefault(); void confirm(); }}>
          <p>{t('totp.enrolHint')}</p>
          <dl className="rows">
            <div><dt>{t('totp.key')}</dt><dd><code id="totp-secret" className="secret"><Ltr>{enrol.secret}</Ltr></code></dd></div>
            <div><dt>{t('totp.uri')}</dt><dd className="break"><a href={enrol.otpauth_uri}><Ltr>{enrol.otpauth_uri}</Ltr></a></dd></div>
          </dl>
          {err ? <Alert kind="error">{err}</Alert> : null}
          <Field label={t('totp.code')}>{(p) => <input {...p} name="totp-confirm" className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} />}</Field>
          <Button type="submit" disabled={code.replace(/\s/g, '').length < 6}>{t('totp.confirm')}</Button>
        </form>
      ) : (
        <>{account.mfa_required ? <Alert kind="warning">{t('totp.requiredNotEnrolled')}</Alert> : null}<p>{t('totp.off')}</p><Button onClick={() => void start()} busy={busy}>{t('totp.enrol')}</Button></>
      )}
      {confirmOff ? <ConfirmDialog title={t('totp.disableTitle')} body={t('totp.disableBody')} confirmLabel={t('totp.disable')} danger busy={busy} onConfirm={() => void disable()} onCancel={() => setConfirmOff(false)} /> : null}
    </Card>
  );
}

function SessionsCard({ onChange }: { onChange: () => void }) {
  const { api } = useApp();
  const { t, lang } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const list = useAsync(() => api.sessions(), []);
  const [target, setTarget] = useState<string | null>(null);
  const revoke = () => target && run(() => api.revokeSession(target), () => { setTarget(null); toast.ok(t('ses.revoked')); list.reload(); onChange(); });
  const revokeOthers = () => run(() => api.revokeOtherSessions(), () => { toast.ok(t('ses.revokedOthers')); list.reload(); onChange(); });
  return (
    <Card title={t('ses.title')} lead={t('ses.lead')} id="sessions"
      actions={<Async state={list}>{(d) => d.some((s) => !s.current) ? <Button variant="secondary" busy={busy} onClick={() => void revokeOthers()}>{t('ses.revokeOthers')}</Button> : null}</Async>}>
      <Async state={list}>{(d) => d.length === 0 ? <Empty>{t('ses.empty')}</Empty> : (
        <ul className="list" aria-label={t('ses.title')}>
          {d.map((s) => (
            <li key={s.session_id} className="row" data-current={s.current || undefined}>
              <div>
                <strong>{describeDevice(s.device) ?? t('ses.unknownDevice')}</strong> {s.current ? <Badge kind="success">{t('ses.current')}</Badge> : null}
                <div className="hint">{s.created_at ? t('ses.started', { date: fmtDate(s.created_at, lang, true) }) : ''}{s.ip ? <> - <Ltr>{s.ip}</Ltr></> : null}</div>
                <div className="hint">{t('ses.apps', { apps: s.clients.map((c) => clientName(lang, c)).join(', ') || '-' })}</div>
              </div>
              {s.current ? null : <Button variant="secondary" onClick={() => setTarget(s.session_id)}>{t('ses.revoke')}</Button>}
            </li>
          ))}
        </ul>
      )}</Async>
      {target ? <ConfirmDialog title={t('ses.revokeTitle')} body={t('ses.revokeBody')} confirmLabel={t('ses.revoke')} danger busy={busy} onConfirm={() => void revoke()} onCancel={() => setTarget(null)} /> : null}
    </Card>
  );
}

export function eventLabel(lang: 'ar' | 'en', e: SecurityEvent): string {
  const k = `ev.${e.type}`;
  const base = translate(lang, k) === k ? e.type : translate(lang, k);
  return e.data.client ? `${base} (${translate(lang, 'ev.via', { client: clientName(lang, e.data.client) })})` : base;
}

function EventsCard({ tick }: { tick: number }) {
  const { api } = useApp();
  const { t, lang } = useI18n();
  const ev = useAsync(() => api.securityEvents(15), [tick]);
  return (
    <Card title={t('ev.title')} lead={t('ev.lead')} id="events">
      {ev.error ? <ErrorState error={ev.error} onRetry={ev.reload} /> : (
        <Async state={ev}>{(d) => d.length === 0 ? <Empty>{t('ev.empty')}</Empty> : (
          <ul className="list" aria-label={t('ev.title')}>
            {d.map((e) => <li key={e.id} className="row"><span>{eventLabel(lang, e)}</span><time className="hint" dateTime={e.at}>{fmtDate(e.at, lang, true)}</time></li>)}
          </ul>
        )}</Async>
      )}
    </Card>
  );
}

export function SecurityPage() {
  const { t } = useI18n();
  const [tick, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  return (
    <>
      <h1>{t('sec.title')}</h1>
      <PasskeysCard onChange={bump} />
      <TotpCard onChange={bump} />
      <EmailCard onChange={bump} />
      <SessionsCard onChange={bump} />
      <EventsCard tick={tick} />
    </>
  );
}


