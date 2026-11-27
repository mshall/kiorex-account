import { useState } from 'react';
import { useApp } from '../app-context';
import { useI18n, type TKey } from '../i18n';
import { ApiError, type SigninLimitsChange, type SigninLimitsDoc, type SigninLimitsState } from '../api';
import { Alert, Async, Badge, Button, Card, ConfirmDialog, Empty, Field, useAction, useAsync, useToast } from '../ui';
import { fmtDate } from '../util';
import { navigate } from '../router';

const RETURN = '/account/ops/limits';
const KEYS: Array<keyof SigninLimitsDoc> = ['maxSendsPerPhonePerHour', 'maxSendsPerIpPerHour', 'maxAttemptsPerChallenge', 'ttlSeconds', 'lockoutMinutesAfterExhaustedChallenge'];

function Numbers({ doc, state }: { doc: Partial<SigninLimitsDoc>; state: SigninLimitsState }) {
  const { t } = useI18n();
  return (
    <ul className="list">{KEYS.filter((k) => doc[k] !== undefined).map((k) => (
      <li key={k}><span>{t(`lim.${k}` as TKey)}</span>: <strong dir="ltr">{doc[k]}</strong> {state.stored[k] !== undefined ? <Badge kind="warning">{t('lim.custom')}</Badge> : <Badge kind="neutral">{t('lim.fromFile')}</Badge>}</li>
    ))}</ul>
  );
}

function Editor({ state, onDone }: { state: SigninLimitsState; onDone: () => void }) {
  const { api, withStepUp } = useApp();
  const { t, err } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const [draft, setDraft] = useState<Record<string, string>>(() => Object.fromEntries(KEYS.map((k) => [k, String(state.effective[k])])));
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState('');
  const [confirmDirect, setConfirmDirect] = useState(false);
  // only the numbers that differ from the file defaults are stored: leaving everything at the default stores nothing
  const toStore = (): Partial<SigninLimitsDoc> => Object.fromEntries(KEYS.map((k) => [k, Number(draft[k])]).filter(([k, v]) => v !== state.defaults[k as keyof SigninLimitsDoc])) as Partial<SigninLimitsDoc>;
  const inRange = (k: keyof SigninLimitsDoc) => { const v = Number(draft[k]); const [min, max] = state.ranges[k]; return Number.isInteger(v) && v >= min && v <= max; };
  const valid = KEYS.every(inRange);
  const send = (apply: boolean) => {
    setMsg('');
    return run(async () => {
      try { return await withStepUp(() => api.opsSigninLimitsPropose(toStore(), note, apply)); }
      catch (x) { const a = x as ApiError; if (a.code !== 'cancelled') setMsg(err(a.code, a.status)); throw x; }
    }, (c) => { setConfirmDirect(false); setNote(''); toast.ok(c.status === 'applied' ? t('lim.applied') : t('lim.submitted')); onDone(); });
  };
  return (
    <Card title={t('lim.editor')} lead={t('lim.editorLead')} id="lim-editor">
      <form onSubmit={(e) => { e.preventDefault(); void send(false); }}>
        {KEYS.map((k) => {
          const [min, max] = state.ranges[k];
          return (
            <Field key={k} label={t(`lim.${k}` as TKey)} hint={t('lim.range', { min, max, def: state.defaults[k] })} error={inRange(k) ? undefined : t('err.limit_out_of_range')}>{(p) => (
              <input {...p} name={k} type="number" inputMode="numeric" min={min} max={max} step={1} dir="ltr" value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} />
            )}</Field>
          );
        })}
        <Field label={t('lim.note')}>{(p) => <input {...p} name="lim-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        {msg ? <Alert kind="error">{msg}</Alert> : null}
        <div className="btn-row">
          <Button variant="secondary" onClick={() => setDraft(Object.fromEntries(KEYS.map((k) => [k, String(state.defaults[k])])))}>{t('lim.reset')}</Button>
          <Button type="submit" busy={busy} disabled={!valid}>{t('lim.submit')}</Button>
          {state.me.can_apply_directly ? <Button variant="danger" onClick={() => setConfirmDirect(true)} disabled={!valid}>{t('lim.applyNow')}</Button> : null}
        </div>
      </form>
      {confirmDirect ? <ConfirmDialog title={t('lim.applyTitle')} body={t('lim.applyBody')} confirmLabel={t('lim.applyNow')} danger busy={busy} onConfirm={() => void send(true)} onCancel={() => setConfirmDirect(false)} /> : null}
    </Card>
  );
}

function Pending({ change, state, onDone }: { change: SigninLimitsChange; state: SigninLimitsState; onDone: () => void }) {
  const { api, withStepUp } = useApp();
  const { t, lang, err } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState('');
  const own = change.proposed_by === state.me.sub;
  const decide = (action: 'approve' | 'reject' | 'withdraw') => {
    setMsg('');
    return run(async () => {
      try { await withStepUp(() => api.opsSigninLimitsDecide(change.id, action)); } catch (x) { const a = x as ApiError; if (a.code !== 'cancelled') setMsg(err(a.code, a.status)); throw x; }
    }, () => { setConfirm(false); toast.ok(t(action === 'approve' ? 'lim.approved' : action === 'reject' ? 'lim.rejected' : 'lim.withdrawn')); onDone(); });
  };
  return (
    <li className="card inner" data-change={change.id}>
      {Object.keys(change.limits).length ? <Numbers doc={change.limits} state={{ ...state, stored: change.limits }} /> : <p>{t('lim.reset')}</p>}
      <p className="hint">{t('lim.by', { date: fmtDate(change.created_at, lang, true), name: change.proposed_by_name ?? change.proposed_by })}{change.note ? ` - ${change.note}` : ''}</p>
      {own ? <Alert kind="info">{t('lim.ownProposal')}</Alert> : null}
      {msg ? <Alert kind="error">{msg}</Alert> : null}
      <div className="btn-row">
        {own ? <Button variant="secondary" busy={busy} onClick={() => void decide('withdraw')}>{t('lim.withdraw')}</Button> : (
          <>
            <Button onClick={() => setConfirm(true)}>{t('lim.approve')}</Button>
            <Button variant="danger" busy={busy} onClick={() => void decide('reject')}>{t('lim.reject')}</Button>
          </>
        )}
      </div>
      {confirm ? <ConfirmDialog title={t('lim.confirmApprove')} body={t('lim.confirmApproveBody')} confirmLabel={t('lim.approve')} busy={busy} onConfirm={() => void decide('approve')} onCancel={() => setConfirm(false)} /> : null}
    </li>
  );
}

export function OpsLimitsPage() {
  const { api, account } = useApp();
  const { t, lang } = useI18n();
  const isOps = account.roles.some((r) => r === 'ops_admin' || r === 'super_admin');
  const state = useAsync(async () => {
    if (!isOps) return undefined as unknown as SigninLimitsState;
    try { return await api.opsSigninLimits(); } catch (e) {
      if (e instanceof ApiError && e.code === 'step_up_required') { navigate(`/account/step-up?return=${RETURN}`); return undefined as unknown as SigninLimitsState; }
      throw e;
    }
  }, [isOps]);
  if (!isOps) return <><h1>{t('lim.title')}</h1><Alert kind="warning">{t('lim.denied')}</Alert></>;
  return (
    <>
      <h1>{t('lim.title')}</h1>
      <p className="lead">{t('lim.lead')}</p>
      <Async state={state}>{(s) => !s ? null : (
        <>
          <Card title={t('lim.current')} id="lim-current">
            <Numbers doc={s.effective} state={s} />
            <p className="hint">{s.updated_at ? t('lim.updatedBy', { date: fmtDate(s.updated_at, lang, true), name: s.updated_by_name ?? '-' }) : t('lim.neverChanged')} - {t('lim.version', { v: s.version })}</p>
          </Card>
          <Editor state={s} onDone={state.reload} />
          <Card title={t('lim.pending')} id="lim-pending">
            {s.pending.length === 0 ? <Empty>{t('lim.pendingNone')}</Empty> : <ul className="stack">{s.pending.map((c) => <Pending key={c.id} change={c} state={s} onDone={state.reload} />)}</ul>}
          </Card>
          <Card title={t('lim.history')} id="lim-history">
            {s.changes.length === 0 ? <Empty>{t('lim.historyNone')}</Empty> : (
              <ul className="stack">{s.changes.map((c) => (
                <li key={c.id} className="card inner" data-change={c.id} data-status={c.status}>
                  {Object.keys(c.limits).length ? <Numbers doc={c.limits} state={{ ...s, stored: c.limits }} /> : <p>{t('lim.reset')}</p>}
                  <p className="hint">{t('lim.decidedBy', { status: t(`lim.status.${c.status}` as TKey), date: c.decided_at ? fmtDate(c.decided_at, lang, true) : '-', name: c.decided_by_name ?? c.decided_by ?? '-' })}{c.applied_directly ? ` ${t('lim.direct')}` : ''}</p>
                </li>
              ))}</ul>
            )}
          </Card>
        </>
      )}</Async>
    </>
  );
}
