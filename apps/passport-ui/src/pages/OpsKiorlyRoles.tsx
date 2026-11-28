import { useState } from 'react';
import { useApp } from '../app-context';
import { useI18n, type TKey } from '../i18n';
import { ApiError, type KiorlyRoleHolder, type KiorlyRolesState } from '../api';
import { Alert, Async, Badge, Button, Card, ConfirmDialog, Empty, Field, useAction, useAsync, useToast } from '../ui';
import { fmtDate } from '../util';
import { navigate } from '../router';

const RETURN = '/account/ops/kiorly-roles';
const ROLES = ['kiorly_ops', 'kiorly_admin'] as const;

function Grant({ onDone }: { onDone: () => void }) {
  const { api, withStepUp } = useApp();
  const { t, err } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<(typeof ROLES)[number]>('kiorly_ops');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState(false);
  const valid = /^\+[1-9][0-9 \-()]{7,20}$/.test(phone.trim()) && note.trim().length >= 3;
  const send = () => {
    setMsg('');
    return run(async () => {
      try { return await withStepUp(() => api.opsKiorlyRoleGrant({ phone: phone.replace(/[\s\-()]/g, ''), role, note: note.trim() })); }
      catch (x) { const a = x as ApiError; if (a.code !== 'cancelled') setMsg(err(a.code, a.status)); setConfirm(false); throw x; }
    }, () => { setConfirm(false); setPhone(''); setNote(''); toast.ok(t('kr.granted')); onDone(); });
  };
  return (
    <Card title={t('kr.grant')} id="kr-grant">
      <p className="hint">{t('kr.rules')}</p>
      <form onSubmit={(e) => { e.preventDefault(); if (valid) setConfirm(true); }}>
        <Field label={t('kr.phone')}>{(p) => <input {...p} name="kr-phone" type="tel" dir="ltr" autoComplete="off" placeholder="+20…" value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
        <Field label={t('kr.role')}>{(p) => (
          <select {...p} name="kr-role" value={role} onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}>
            {ROLES.map((r) => <option key={r} value={r}>{t(`kr.role.${r}` as TKey)}</option>)}
          </select>
        )}</Field>
        <Field label={t('kr.note')}>{(p) => <input {...p} name="kr-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        {msg ? <Alert kind="error">{msg}</Alert> : null}
        <div className="btn-row"><Button type="submit" disabled={!valid} busy={busy}>{t('kr.submit')}</Button></div>
      </form>
      {confirm ? <ConfirmDialog title={t('kr.confirmTitle')} body={t('kr.confirmBody')} confirmLabel={t('kr.submit')} busy={busy} onConfirm={() => void send()} onCancel={() => setConfirm(false)} /> : null}
    </Card>
  );
}

function Holder({ h, onDone }: { h: KiorlyRoleHolder; onDone: () => void }) {
  const { api, withStepUp } = useApp();
  const { t, err } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const revoke = () => {
    setMsg('');
    return run(async () => {
      try { await withStepUp(() => api.opsKiorlyRoleRevoke(h.sub, note.trim())); }
      catch (x) { const a = x as ApiError; if (a.code !== 'cancelled') setMsg(err(a.code, a.status)); throw x; }
    }, () => { setOpen(false); setNote(''); toast.ok(t('kr.revoked')); onDone(); });
  };
  return (
    <li className="card inner" data-holder={h.sub}>
      <p><strong>{h.name ?? '-'}</strong> <span dir="ltr">{h.phone ?? ''}</span> <Badge kind="neutral">{t(`kr.role.${h.role}` as TKey)}</Badge>{h.test ? <> <Badge kind="warning">{t('kr.test')}</Badge></> : null}</p>
      <div className="btn-row"><Button variant="danger" onClick={() => setOpen(true)}>{t('kr.revoke')}</Button></div>
      {open ? (
        <ConfirmDialog title={t('kr.revokeTitle')} body={t('kr.revokeBody')} confirmLabel={t('kr.revoke')} danger busy={busy} onConfirm={() => { if (note.trim().length >= 3) void revoke(); else setMsg(err('reason_required', 400)); }} onCancel={() => setOpen(false)}>
          <Field label={t('kr.note')}>{(p) => <input {...p} name="kr-revoke-note" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          {msg ? <Alert kind="error">{msg}</Alert> : null}
        </ConfirmDialog>
      ) : null}
    </li>
  );
}

export function OpsKiorlyRolesPage() {
  const { api, account } = useApp();
  const { t, lang } = useI18n();
  const isSuper = account.roles.includes('super_admin');
  const state = useAsync(async () => {
    if (!isSuper) return undefined as unknown as KiorlyRolesState;
    try { return await api.opsKiorlyRoles(); } catch (e) {
      if (e instanceof ApiError && e.code === 'step_up_required') { navigate(`/account/step-up?return=${RETURN}`); return undefined as unknown as KiorlyRolesState; }
      throw e;
    }
  }, [isSuper]);
  if (!isSuper) return <><h1>{t('kr.title')}</h1><Alert kind="warning">{t('kr.denied')}</Alert></>;
  return (
    <>
      <h1>{t('kr.title')}</h1>
      <p className="lead">{t('kr.lead')}</p>
      <Async state={state}>{(s) => !s ? null : (
        <>
          <Grant onDone={state.reload} />
          <Card title={t('kr.holders')} id="kr-holders">
            {s.holders.length === 0 ? <Empty>{t('kr.holdersNone')}</Empty> : <ul className="stack">{s.holders.map((h) => <Holder key={h.sub} h={h} onDone={state.reload} />)}</ul>}
          </Card>
          <Card title={t('kr.history')} id="kr-history">
            {s.history.length === 0 ? <Empty>{t('kr.historyNone')}</Empty> : (
              <ul className="stack">{s.history.map((e, i) => (
                <li key={`${e.at}-${i}`} className="card inner" data-event={e.type}>
                  <p>{t(e.type === 'kiorly.role.granted' ? 'kr.event.granted' : 'kr.event.revoked', { actor: e.actor_name ?? e.actor ?? '-', role: e.role ? t(`kr.role.${e.role}` as TKey) : '-', target: e.target_name ?? e.target ?? '-' })}</p>
                  <p className="hint">{fmtDate(e.at, lang, true)}{e.note ? ` - ${e.note}` : ''}</p>
                </li>
              ))}</ul>
            )}
          </Card>
        </>
      )}</Async>
    </>
  );
}
