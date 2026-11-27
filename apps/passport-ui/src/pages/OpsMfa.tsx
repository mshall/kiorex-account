import { useEffect, useState } from 'react';
import { useApp } from '../app-context';
import { useI18n, type TKey } from '../i18n';
import { ApiError, type MfaChange, type MfaImpact, type MfaPolicyDoc, type MfaPolicyState, type MfaRule } from '../api';
import { Alert, Async, Badge, Button, Card, ConfirmDialog, Empty, Field, Ltr, useAction, useAsync, useToast } from '../ui';
import { fmtDate } from '../util';
import { navigate } from '../router';

const RETURN = '/account/ops/mfa';

/** One line per rule, in words: "owner, pharmacist in pharmacy organisations". */
function useDescribe(state: MfaPolicyState | undefined) {
  const { t } = useI18n();
  const roleLabel = (r: string) => (r === '*' ? t('mfa.roleAny') : r);
  return (rule: MfaRule): string => {
    const where = rule.scope === 'all' ? t('mfa.sum.all')
      : rule.scope === 'org_type' ? t('mfa.sum.type', { type: t(`mfa.orgType.${rule.value}` as TKey) })
        : t('mfa.sum.org', { org: state?.options.orgs.find((o) => o.org_id === rule.value)?.legal_name ?? rule.value ?? '' });
    return t('mfa.sum.line', { roles: rule.roles.map(roleLabel).join(', '), where });
  };
}

function PolicySummary({ policy, state }: { policy: MfaPolicyDoc; state: MfaPolicyState }) {
  const { t } = useI18n();
  const describe = useDescribe(state);
  return (
    <>
      <p><Badge kind={policy.enabled ? 'warning' : 'neutral'}>{policy.enabled ? t('mfa.summary.on') : t('mfa.summary.off')}</Badge> {t('mfa.summary.rules', { n: policy.rules.length })}</p>
      {policy.rules.length ? <ul className="list">{policy.rules.map((r, i) => <li key={i}>{describe(r)}</li>)}</ul> : null}
    </>
  );
}

function ImpactLine({ impact }: { impact: MfaImpact }) {
  const { t } = useI18n();
  return <p className="hint" role="status">{impact.people ? t('mfa.impact', { people: impact.people, without: impact.without_factor }) : t('mfa.impactNone')}</p>;
}

function RuleEditor({ rule, index, state, onChange, onRemove }: { rule: MfaRule; index: number; state: MfaPolicyState; onChange: (r: MfaRule) => void; onRemove: () => void }) {
  const { t } = useI18n();
  const roles = ['*', ...state.options.roles];
  const toggle = (r: string) => {
    const has = rule.roles.includes(r);
    const next = r === '*' ? (has ? [] : ['*']) : has ? rule.roles.filter((x) => x !== r) : [...rule.roles.filter((x) => x !== '*'), r];
    onChange({ ...rule, roles: next });
  };
  return (
    <fieldset className="rule" data-rule={index}>
      <legend>{t('mfa.rule', { n: index + 1 })}</legend>
      <Field label={t('mfa.scope')}>{(p) => (
        <select {...p} name={`scope-${index}`} value={rule.scope} onChange={(e) => {
          const scope = e.target.value as MfaRule['scope'];
          onChange({ scope, roles: rule.roles, ...(scope === 'org_type' ? { value: state.options.org_types[0] } : scope === 'org' ? { value: '' } : {}) });
        }}>
          <option value="all">{t('mfa.scope.all')}</option><option value="org_type">{t('mfa.scope.org_type')}</option><option value="org">{t('mfa.scope.org')}</option>
        </select>
      )}</Field>
      {rule.scope === 'org_type' ? (
        <Field label={t('mfa.orgType')}>{(p) => (
          <select {...p} name={`type-${index}`} value={rule.value ?? ''} onChange={(e) => onChange({ ...rule, value: e.target.value })}>
            {state.options.org_types.map((o) => <option key={o} value={o}>{t(`mfa.orgType.${o}` as TKey)}</option>)}
          </select>
        )}</Field>
      ) : null}
      {rule.scope === 'org' ? (
        <Field label={t('mfa.org')}>{(p) => (
          <select {...p} name={`org-${index}`} value={rule.value ?? ''} onChange={(e) => onChange({ ...rule, value: e.target.value })}>
            <option value="">{t('mfa.pickOrg')}</option>
            {state.options.orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.legal_name} ({o.types.map((x) => t(`mfa.orgType.${x}` as TKey)).join(', ')})</option>)}
          </select>
        )}</Field>
      ) : null}
      <fieldset className="checks" aria-label={t('mfa.roles')}>
        <legend>{t('mfa.roles')}</legend>
        {roles.map((r) => (
          <label key={r} className="check"><input type="checkbox" name={`role-${index}-${r}`} checked={rule.roles.includes(r)} onChange={() => toggle(r)} /><span>{r === '*' ? t('mfa.roleAny') : <Ltr>{r}</Ltr>}</span></label>
        ))}
      </fieldset>
      <Button variant="secondary" onClick={onRemove} aria-label={t('mfa.removeRule', { n: index + 1 })}>{t('app.remove')}</Button>
    </fieldset>
  );
}

function Editor({ state, onDone }: { state: MfaPolicyState; onDone: () => void }) {
  const { api, withStepUp } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const [draft, setDraft] = useState<MfaPolicyDoc>(() => structuredClone(state.policy));
  const [note, setNote] = useState('');
  const [impact, setImpact] = useState<MfaImpact | null>(null);
  const [confirmDirect, setConfirmDirect] = useState(false);
  const [msg, setMsg] = useState('');
  const { err } = useI18n();
  useEffect(() => { setDraft(structuredClone(state.policy)); setImpact(null); }, [state.version]); // eslint-disable-line react-hooks/exhaustive-deps

  const valid = draft.rules.every((r) => r.roles.length > 0 && (r.scope === 'all' || !!r.value));
  const send = (apply: boolean) => {
    setMsg('');
    return run(async () => {
      try { return await withStepUp(() => api.opsMfaPropose(draft, note, apply)); }
      catch (x) { const a = x as ApiError; if (a.code !== 'cancelled') setMsg(err(a.code, a.status)); throw x; }
    }, (c) => { setConfirmDirect(false); setNote(''); toast.ok(c.status === 'applied' ? t('mfa.applied') : t('mfa.submitted')); onDone(); });
  };
  const preview = () => run(() => withStepUp(() => api.opsMfaPreview(draft)), (r) => setImpact(r.impact));

  return (
    <Card title={t('mfa.editor')} lead={t('mfa.editorLead')} id="mfa-editor">
      <form onSubmit={(e) => { e.preventDefault(); void send(false); }}>
        <label className="check"><input type="checkbox" name="mfa-enabled" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} aria-describedby="mfa-enabled-hint" /><span><strong>{t('mfa.switch')}</strong></span></label>
        <div className="hint" id="mfa-enabled-hint">{t('mfa.switchHint')}</div>
        <h3>{t('mfa.rules')}</h3>
        {draft.rules.length === 0 ? <Empty>{t('mfa.noRules')}</Empty> : null}
        {draft.rules.map((r, i) => (
          <RuleEditor key={i} rule={r} index={i} state={state}
            onChange={(nr) => setDraft({ ...draft, rules: draft.rules.map((x, j) => (j === i ? nr : x)) })}
            onRemove={() => setDraft({ ...draft, rules: draft.rules.filter((_, j) => j !== i) })} />
        ))}
        <Button variant="secondary" onClick={() => setDraft({ ...draft, rules: [...draft.rules, { scope: 'all', roles: [] }] })}>{t('mfa.addRule')}</Button>
        <Field label={t('mfa.note')}>{(p) => <input {...p} name="mfa-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
        {msg ? <Alert kind="error">{msg}</Alert> : null}
        {impact ? <ImpactLine impact={impact} /> : null}
        <div className="btn-row">
          <Button variant="secondary" onClick={() => void preview()} busy={busy} disabled={!valid}>{t('mfa.preview')}</Button>
          <Button type="submit" busy={busy} disabled={!valid}>{t('mfa.submit')}</Button>
          {state.me.can_apply_directly ? <Button variant="danger" onClick={() => setConfirmDirect(true)} disabled={!valid}>{t('mfa.applyNow')}</Button> : null}
        </div>
      </form>
      {confirmDirect ? <ConfirmDialog title={t('mfa.applyTitle')} body={t('mfa.applyBody')} confirmLabel={t('mfa.applyNow')} danger busy={busy} onConfirm={() => void send(true)} onCancel={() => setConfirmDirect(false)} /> : null}
    </Card>
  );
}

function Pending({ change, state, onDone }: { change: MfaChange; state: MfaPolicyState; onDone: () => void }) {
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
      try { await withStepUp(() => api.opsMfaDecide(change.id, action)); } catch (x) { const a = x as ApiError; if (a.code !== 'cancelled') setMsg(err(a.code, a.status)); throw x; }
    }, () => { setConfirm(false); toast.ok(t(action === 'approve' ? 'mfa.approved' : action === 'reject' ? 'mfa.rejected' : 'mfa.withdrawn')); onDone(); });
  };
  return (
    <li className="card inner" data-change={change.id}>
      <PolicySummary policy={change.policy} state={state} />
      <p className="hint">{t('mfa.by', { date: fmtDate(change.created_at, lang, true), name: change.proposed_by_name ?? change.proposed_by })}{change.note ? ` - ${change.note}` : ''}</p>
      {change.impact ? <ImpactLine impact={change.impact} /> : null}
      {own ? <Alert kind="info">{t('mfa.ownProposal')}</Alert> : null}
      {msg ? <Alert kind="error">{msg}</Alert> : null}
      <div className="btn-row">
        {own ? <Button variant="secondary" busy={busy} onClick={() => void decide('withdraw')}>{t('mfa.withdraw')}</Button> : (
          <>
            <Button onClick={() => setConfirm(true)}>{t('mfa.approve')}</Button>
            <Button variant="danger" busy={busy} onClick={() => void decide('reject')}>{t('mfa.reject')}</Button>
          </>
        )}
      </div>
      {confirm ? <ConfirmDialog title={t('mfa.confirmApprove')} body={t('mfa.confirmApproveBody')} confirmLabel={t('mfa.approve')} busy={busy} onConfirm={() => void decide('approve')} onCancel={() => setConfirm(false)} /> : null}
    </li>
  );
}

export function OpsMfaPage() {
  const { api, account } = useApp();
  const { t, lang } = useI18n();
  const isOps = account.roles.some((r) => r === 'ops_admin' || r === 'super_admin');
  const state = useAsync(async () => {
    if (!isOps) return undefined as unknown as MfaPolicyState;
    try { return await api.opsMfaPolicy(); } catch (e) {
      // the policy needs a fresh MFA step-up: send the operator to the step-up page and come back here
      if (e instanceof ApiError && e.code === 'step_up_required') { navigate(`/account/step-up?return=${RETURN}`); return undefined as unknown as MfaPolicyState; }
      throw e;
    }
  }, [isOps]);
  if (!isOps) return <><h1>{t('mfa.title')}</h1><Alert kind="warning">{t('mfa.denied')}</Alert></>;
  return (
    <>
      <h1>{t('mfa.title')}</h1>
      <p className="lead">{t('mfa.lead')}</p>
      <Async state={state}>{(s) => !s ? null : (
        <>
          <Card title={t('mfa.current')} id="mfa-current">
            <PolicySummary policy={s.policy} state={s} />
            <p className="hint">{s.updated_at ? t('mfa.updatedBy', { date: fmtDate(s.updated_at, lang, true), name: s.updated_by_name ?? '-' }) : t('mfa.neverChanged')} - {t('mfa.version', { v: s.version })}</p>
            {s.policy.enabled ? <ImpactLine impact={s.impact} /> : null}
            <p className="hint">{t('mfa.baseline', { roles: s.options.baseline_roles.join(', ') })}</p>
            <p className="hint">{t('mfa.how')}</p>
          </Card>
          <Editor state={s} onDone={state.reload} />
          <Card title={t('mfa.pending')} id="mfa-pending">
            {s.pending.length === 0 ? <Empty>{t('mfa.pendingNone')}</Empty> : <ul className="stack">{s.pending.map((c) => <Pending key={c.id} change={c} state={s} onDone={state.reload} />)}</ul>}
          </Card>
          <Card title={t('mfa.history')} id="mfa-history">
            {s.changes.length === 0 ? <Empty>{t('mfa.historyNone')}</Empty> : (
              <ul className="stack">{s.changes.map((c) => (
                <li key={c.id} className="card inner" data-change={c.id} data-status={c.status}>
                  <PolicySummary policy={c.policy} state={s} />
                  <p className="hint">{t('mfa.decidedBy', { status: t(`mfa.status.${c.status}` as TKey), date: c.decided_at ? fmtDate(c.decided_at, lang, true) : '-', name: c.decided_by_name ?? c.decided_by ?? '-' })}{c.applied_directly ? ` (${t('mfa.direct')})` : ''}{c.note ? ` - ${c.note}` : ''}</p>
                </li>
              ))}</ul>
            )}
          </Card>
        </>
      )}</Async>
    </>
  );
}
