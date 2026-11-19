import { useState } from 'react';
import { useApp } from '../app-context';
import { useI18n, type TKey } from '../i18n';
import { ApiError, type LinkView, type Resolution } from '../api';
import { Alert, Async, Badge, Button, Card, ConfirmDialog, DraftNote, Empty, Field, Ltr, useAction, useAsync, useToast } from '../ui';
import { fmtDate } from '../util';
import { navigate } from '../router';
import { ConflictList, statusKind } from './Linked';

const TABS = ['pending_review', 'merged', 'rejected', 'reversed'] as const;

function Item({ link, onChanged }: { link: LinkView; onChanged: () => void }) {
  const { api, withStepUp } = useApp();
  const { t, err, lang } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const [note, setNote] = useState('');
  const [name, setName] = useState<'primary' | 'secondary' | ''>('');
  const [roles, setRoles] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState<'approve' | 'reject' | 'reverse' | null>(null);
  const [msg, setMsg] = useState('');
  const blocking = link.conflicts.filter((c) => c.severity === 'blocking');
  const nameConflict = blocking.find((c) => c.code === 'name_mismatch');
  const roleConflicts = blocking.filter((c) => c.code === 'membership_role_conflict');
  const complete = (!nameConflict || !!name) && roleConflicts.every((c) => !!roles[String(c.detail.org_id)]);

  const act = (action: 'approve' | 'reject' | 'reverse') => {
    const resolution: Resolution = {};
    if (nameConflict && name) resolution.name = name;
    if (roleConflicts.length) resolution.membership_roles = roles;
    setMsg('');
    return run(async () => {
      try { await withStepUp(() => api.opsLinkAction(link.link_id, action, { ...(action === 'approve' ? { resolution } : {}), ...(note.trim() ? { note: note.trim() } : {}) })); }
      catch (x) { const a = x as ApiError; if (a.code !== 'cancelled') setMsg(err(a.code, a.status)); throw x; }
    }, () => { setConfirm(null); toast.ok(t(action === 'approve' ? 'ops.approved' : action === 'reject' ? 'ops.rejected' : 'ops.reversed')); onChanged(); });
  };

  return (
    <li className="card inner" data-link={link.link_id} data-status={link.status}>
      <div className="row"><Badge kind={statusKind(link.status)}>{t(`lnk.status.${link.status}` as TKey)}</Badge><span className="hint">{fmtDate(link.requested_at, lang, true)}</span></div>
      <dl className="rows">
        <div><dt>{t('ops.mainAccount')}</dt><dd><Ltr>{link.primary_sub}</Ltr></dd></div>
        <div><dt>{t('ops.otherAccount')}</dt><dd><Ltr>{link.secondary_sub}</Ltr></dd></div>
      </dl>
      <ConflictList conflicts={link.conflicts} />
      {msg ? <Alert kind="error">{msg}</Alert> : null}
      {link.status === 'pending_review' ? (
        <>
          {blocking.length ? (
            <fieldset className="decision"><legend>{t('ops.resolution')}</legend>
              {nameConflict ? (
                <div role="radiogroup" aria-label={t('ops.nameKeep')} className="checks">
                  <span className="label">{t('ops.nameKeep')}</span>
                  {(['primary', 'secondary'] as const).map((w) => (
                    <label key={w} className="check"><input type="radio" name={`name-${link.link_id}`} checked={name === w} onChange={() => setName(w)} /><span>{t(w === 'primary' ? 'ops.namePrimary' : 'ops.nameSecondary', { name: String(nameConflict.detail[w] ?? '') })}</span></label>
                  ))}
                </div>
              ) : null}
              {roleConflicts.map((c) => {
                const org = String(c.detail.org_id);
                return (
                  <div key={org} role="radiogroup" aria-label={t('ops.roleKeep', { org })} className="checks">
                    <span className="label">{t('ops.roleKeep', { org })}</span>
                    {(['primary', 'secondary'] as const).map((w) => {
                      const role = String(c.detail[`${w}_role`]);
                      return <label key={w} className="check"><input type="radio" name={`role-${link.link_id}-${org}`} checked={roles[org] === role} onChange={() => setRoles((r) => ({ ...r, [org]: role }))} /><span>{t(w === 'primary' ? 'ops.rolePrimary' : 'ops.roleSecondary', { role })}</span></label>;
                    })}
                  </div>
                );
              })}
            </fieldset>
          ) : null}
          <Field label={t('ops.note')}>{(p) => <input {...p} name={`note-${link.link_id}`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          <div className="btn-row">
            <Button onClick={() => setConfirm('approve')} disabled={!complete}>{t('ops.approve')}</Button>
            <Button variant="danger" onClick={() => setConfirm('reject')}>{t('ops.reject')}</Button>
          </div>
        </>
      ) : null}
      {link.status === 'merged' ? (
        <>
          <Field label={t('ops.note')}>{(p) => <input {...p} name={`note-${link.link_id}`} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          <Button variant="danger" onClick={() => setConfirm('reverse')}>{t('ops.reverse')}</Button>
        </>
      ) : null}
      {link.reviewed_at ? <p className="hint">{t('ops.reviewedBy', { date: fmtDate(link.reviewed_at, lang, true) })}{link.review_note ? ` - ${link.review_note}` : ''}</p> : null}
      {confirm ? (
        <ConfirmDialog
          title={t(confirm === 'approve' ? 'ops.confirmApprove' : confirm === 'reverse' ? 'ops.confirmReverse' : 'ops.confirmReject')}
          body={confirm === 'approve' ? t('ops.confirmApproveBody') : confirm === 'reverse' ? t('ops.confirmReverseBody') : undefined}
          confirmLabel={t(confirm === 'approve' ? 'ops.approve' : confirm === 'reverse' ? 'ops.reverse' : 'ops.reject')} danger={confirm !== 'approve'} busy={busy}
          onConfirm={() => void act(confirm)} onCancel={() => setConfirm(null)} />
      ) : null}
    </li>
  );
}

export function OpsLinksPage() {
  const { api, account } = useApp();
  const { t } = useI18n();
  const [tab, setTab] = useState<(typeof TABS)[number]>('pending_review');
  const isOps = account.roles.some((r) => r === 'ops_admin' || r === 'super_admin');
  const queue = useAsync(async () => {
    if (!isOps) return [];
    try { return await api.opsLinks(tab); } catch (e) {
      // the queue needs a fresh MFA step-up: send the reviewer to the step-up page and come back here
      if (e instanceof ApiError && e.code === 'step_up_required') { navigate('/account/step-up?return=/account/ops/links'); return []; }
      throw e;
    }
  }, [tab, isOps]);
  if (!isOps) return <><h1>{t('ops.title')}</h1><Alert kind="warning">{t('ops.denied')}</Alert></>;
  return (
    <>
      <h1>{t('ops.title')}</h1>
      <p className="lead">{t('ops.lead')}</p>
      <div className="seg" role="tablist" aria-label={t('ops.title')}>
        {TABS.map((s) => <button key={s} type="button" role="tab" aria-selected={tab === s} className={tab === s ? 'seg-btn on' : 'seg-btn'} onClick={() => setTab(s)}>{t(`ops.tab.${s}` as TKey)}</button>)}
      </div>
      <Card title={t(`ops.tab.${tab}` as TKey)}>
        <Async state={queue}>{(d) => d.length === 0 ? <Empty>{t('ops.empty')}</Empty> : <ul className="stack">{d.map((l) => <Item key={l.link_id} link={l} onChanged={queue.reload} />)}</ul>}</Async>
        <DraftNote k="draft.merge" />
      </Card>
    </>
  );
}
