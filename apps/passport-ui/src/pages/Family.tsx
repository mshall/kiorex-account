import { useState } from 'react';
import { useApp } from '../app-context';
import { useI18n, type TKey } from '../i18n';
import { ApiError, type ActAsResult, type Dependant } from '../api';
import { Alert, Async, Badge, Button, Card, ConfirmDialog, Dialog, DraftNote, Empty, Field, Ltr, useAction, useAsync, useToast } from '../ui';
import { E164, NATIONAL_ID_LIKE, ageFromDob, daysUntil, fmtDate, normPhone } from '../util';

const rel = (t: (k: TKey) => string, r: string) => t(`rel.${r}` as TKey);
const evi = (t: (k: TKey) => string, r: string) => t(`evi.${r}` as TKey);

function EvidenceFields({ types, type, setType, reference, setReference, error }: { types: string[]; type: string; setType: (v: string) => void; reference: string; setReference: (v: string) => void; error?: string }) {
  const { t } = useI18n();
  return (
    <>
      <Field label={t('fam.add.evidence')}>{(p) => <select {...p} name="evidence" value={type} onChange={(e) => setType(e.target.value)}>{types.map((x) => <option key={x} value={x}>{evi(t, x)}</option>)}</select>}</Field>
      {type !== 'self_declared' ? <Field label={t('fam.add.ref')} hint={t('fam.add.refHint')} error={error}>{(p) => <input {...p} name="reference" maxLength={64} autoComplete="off" value={reference} onChange={(e) => setReference(e.target.value)} />}</Field> : null}
    </>
  );
}

function AddDependant({ onAdded }: { onAdded: () => void }) {
  const { api, meta } = useApp();
  const { t, err } = useI18n();
  const toast = useToast();
  const g = meta?.guardian;
  const [name, setName] = useState(''); const [dob, setDob] = useState('');
  const [relationship, setRelationship] = useState('parent'); const [type, setType] = useState('self_declared'); const [reference, setReference] = useState('');
  const [errs, setErrs] = useState<{ name?: string; dob?: string; ref?: string; form?: string }>({});
  const { busy, run } = useAction();
  const today = new Date().toISOString().slice(0, 10);

  const submit = async () => {
    const e: typeof errs = {};
    if (!name.trim()) e.name = err('invalid_name');
    if (!dob) e.dob = err('invalid_dob'); else if (dob > today) e.dob = t('fam.add.dobFuture');
    if (type !== 'self_declared' && !reference.trim()) e.ref = err('evidence_reference_required');
    else if (NATIONAL_ID_LIKE.test(reference.replace(/\s/g, ''))) e.ref = t('fam.add.nationalId');
    setErrs(e);
    if (Object.keys(e).length) return;
    await run(async () => {
      try { await api.addDependant({ name: name.trim(), dob, relationship, evidence: { type, ...(type !== 'self_declared' ? { reference: reference.trim() } : {}) } }); }
      catch (x) { const a = x as ApiError; setErrs({ form: err(a.code, a.status) }); throw new ApiError(0, 'cancelled'); }
    }, () => { toast.ok(t('fam.add.done')); setName(''); setDob(''); setReference(''); onAdded(); });
  };
  return (
    <Card title={t('fam.add')} id="add-dependant">
      <form onSubmit={(ev) => { ev.preventDefault(); void submit(); }} noValidate>
        {errs.form ? <Alert kind="error">{errs.form}</Alert> : null}
        <Field label={t('fam.add.name')} error={errs.name}>{(p) => <input {...p} name="dep-name" maxLength={80} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={t('fam.add.dob')} error={errs.dob}>{(p) => <input {...p} name="dob" type="date" max={today} value={dob} onChange={(e) => setDob(e.target.value)} />}</Field>
        <Field label={t('fam.add.rel')}>{(p) => <select {...p} name="relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)}>{(g?.relationships ?? ['parent', 'legal_guardian', 'grandparent', 'other_relative']).map((r) => <option key={r} value={r}>{rel(t, r)}</option>)}</select>}</Field>
        <EvidenceFields types={g?.evidence_types ?? ['self_declared']} type={type} setType={setType} reference={reference} setReference={setReference} error={errs.ref} />
        <DraftNote k="draft.guardian" />
        <Button type="submit" busy={busy}>{t('fam.add.submit')}</Button>
      </form>
    </Card>
  );
}

function CoGuardianDialog({ dep, onClose }: { dep: Dependant; onClose: () => void }) {
  const { api, meta } = useApp();
  const { t, err } = useI18n();
  const toast = useToast();
  const [phone, setPhone] = useState(''); const [relationship, setRelationship] = useState('parent'); const [type, setType] = useState('self_declared'); const [reference, setReference] = useState('');
  const [msg, setMsg] = useState('');
  const { busy, run } = useAction();
  const submit = () => {
    const p = normPhone(phone);
    if (!E164.test(p)) { setMsg(err('invalid_phone')); return; }
    setMsg('');
    void run(async () => {
      try { await api.inviteCoGuardian(dep.dependant_sub, { phone: p, relationship, evidence: { type, ...(type !== 'self_declared' ? { reference: reference.trim() } : {}) } }); }
      catch (x) { const a = x as ApiError; setMsg(err(a.code, a.status)); throw new ApiError(0, 'cancelled'); }
    }, () => { toast.ok(t('fam.co.sent')); onClose(); });
  };
  return (
    <Dialog title={`${t('fam.co')} - ${dep.name}`} onClose={onClose}>
      <p>{t('fam.co.lead')}</p>
      {msg ? <Alert kind="error">{msg}</Alert> : null}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label={t('fam.co.phone')}>{(p) => <input {...p} name="co-phone" className="phone" type="tel" dir="ltr" inputMode="tel" autoComplete="off" placeholder="+201000000002" value={phone} onChange={(e) => setPhone(e.target.value)} data-autofocus />}</Field>
        <Field label={t('fam.add.rel')}>{(p) => <select {...p} name="co-rel" value={relationship} onChange={(e) => setRelationship(e.target.value)}>{(meta?.guardian.relationships ?? ['parent']).map((r) => <option key={r} value={r}>{rel(t, r)}</option>)}</select>}</Field>
        <EvidenceFields types={meta?.guardian.evidence_types ?? ['self_declared']} type={type} setType={setType} reference={reference} setReference={setReference} />
        <div className="dialog-actions"><Button variant="secondary" onClick={onClose}>{t('app.cancel')}</Button><Button type="submit" busy={busy}>{t('fam.co')}</Button></div>
      </form>
    </Dialog>
  );
}

function ActAsDialog({ dep, onClose }: { dep: Dependant; onClose: () => void }) {
  const { api, meta, cfg } = useApp();
  const { t, lang } = useI18n();
  const scopes = meta?.guardian.act_scopes ?? ['dependant:profile', 'dependant:booking', 'dependant:consent'];
  const [picked, setPicked] = useState<string[]>(scopes);
  const [res, setRes] = useState<ActAsResult | null>(null);
  const [copied, setCopied] = useState(false);
  const { busy, run } = useAction();
  const start = () => run(() => api.actAs(dep.dependant_sub, picked), setRes);
  return (
    <Dialog title={t('fam.actAs.title', { name: dep.name })} onClose={onClose}>
      {!res ? (
        <form onSubmit={(e) => { e.preventDefault(); if (picked.length) void start(); }}>
          <p>{t('fam.actAs.lead')}</p>
          <fieldset className="checks"><legend>{t('fam.actAs.scopes')}</legend>
            {scopes.map((s) => (
              <label key={s} className="check"><input type="checkbox" name="scope" value={s} checked={picked.includes(s)} onChange={(e) => setPicked((p) => e.target.checked ? [...p, s] : p.filter((x) => x !== s))} />
                <span>{t(`scope.${s}` as TKey)}</span></label>
            ))}
          </fieldset>
          {picked.length === 0 ? <Alert kind="warning">{t('fam.actAs.noScope')}</Alert> : null}
          <DraftNote k="draft.guardian" />
          <div className="dialog-actions"><Button variant="secondary" onClick={onClose}>{t('app.cancel')}</Button><Button type="submit" busy={busy} disabled={!picked.length}>{t('fam.actAs.start')}</Button></div>
        </form>
      ) : (
        <div data-testid="act-as-ready">
          <Alert kind="success">{t('fam.actAs.ready', { name: dep.name, minutes: Math.max(1, Math.round(res.expires_in / 60)) })}</Alert>
          <p className="hint">{t('fam.actAs.expires', { date: fmtDate(Date.now() + res.expires_in * 1000, lang, true) })}</p>
          <ul>{res.scope.split(' ').map((s) => <li key={s}>{t(`scope.${s}` as TKey)}</li>)}</ul>
          {cfg.kiorexWebUrl ? <a className="btn btn-primary" href={cfg.kiorexWebUrl}>{t('fam.actAs.openKiorex', { name: dep.name })}</a> : null}
          <details className="dev-token"><summary>{t('fam.actAs.token')}</summary>
            <textarea readOnly aria-label={t('fam.actAs.token')} dir="ltr" rows={4} value={res.access_token} />
            <Button variant="secondary" onClick={() => { void navigator.clipboard?.writeText(res.access_token); setCopied(true); }}>{copied ? t('app.copied') : t('app.copy')}</Button>
          </details>
          <div className="dialog-actions"><Button variant="secondary" onClick={onClose}>{t('app.close')}</Button></div>
        </div>
      )}
    </Dialog>
  );
}

function DependantCard({ dep, onChanged }: { dep: Dependant; onChanged: () => void }) {
  const { meta } = useApp();
  const { api } = useApp();
  const { t, lang } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const [dialog, setDialog] = useState<'act' | 'co' | 'revoke' | null>(null);
  const age = ageFromDob(dep.dob);
  const days = daysUntil(dep.expires_at);
  const majority = meta?.guardian.age_of_majority[meta.guardian.default_market] ?? 18;
  const soon = days <= 90;
  const revoke = () => run(() => api.revokeDependant(dep.dependant_sub), () => { toast.ok(t('fam.revoked')); setDialog(null); onChanged(); });
  return (
    <li className="card inner" aria-label={dep.name}>
      <div className="row">
        <div>
          <h3>{dep.name}</h3>
          <p className="hint">{t('fam.age', { age })} - {t('fam.born', { date: fmtDate(dep.dob, lang) })} - {rel(t, dep.relationship)} - {evi(t, dep.evidence_type)}</p>
        </div>
        <Badge kind="success">{t('fam.status.active')}</Badge>
      </div>
      <Alert kind={soon ? 'warning' : 'info'} role="status">
        {soon ? t('fam.majority.soon', { age: majority, date: fmtDate(dep.expires_at, lang), days: Math.max(days, 0) }) : t('fam.majority.later', { name: dep.name, date: fmtDate(dep.expires_at, lang), age: majority })}
        <DraftNote k="draft.majority" />
      </Alert>
      <div className="btn-row">
        <Button onClick={() => setDialog('act')}>{t('fam.actAs', { name: dep.name })}</Button>
        <Button variant="secondary" onClick={() => setDialog('co')}>{t('fam.co')}</Button>
        <Button variant="ghost" onClick={() => setDialog('revoke')}>{t('fam.revoke')}</Button>
      </div>
      {dialog === 'act' ? <ActAsDialog dep={dep} onClose={() => setDialog(null)} /> : null}
      {dialog === 'co' ? <CoGuardianDialog dep={dep} onClose={() => { setDialog(null); onChanged(); }} /> : null}
      {dialog === 'revoke' ? <ConfirmDialog title={t('fam.revokeTitle', { name: dep.name })} body={t('fam.revokeBody')} confirmLabel={t('fam.revoke')} danger busy={busy} onConfirm={() => void revoke()} onCancel={() => setDialog(null)} /> : null}
    </li>
  );
}

export function FamilyPage() {
  const { api } = useApp();
  const { t, lang } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const deps = useAsync(() => api.dependants(), []);
  const answer = (d: Dependant, accept: boolean) => run(() => accept ? api.acceptGuardianLink(d.link_id) : api.declineGuardianLink(d.link_id), () => { toast.ok(t(accept ? 'fam.accepted' : 'fam.declined')); deps.reload(); });
  return (
    <>
      <h1>{t('fam.title')}</h1>
      <p className="lead">{t('fam.lead')}</p>
      <Async state={deps}>{(all) => {
        const pending = all.filter((d) => d.status === 'pending');
        const active = all.filter((d) => d.status === 'active');
        const ended = all.filter((d) => d.status === 'revoked' || d.status === 'expired');
        return (
          <>
            {pending.length ? (
              <Card title={t('fam.invites')} id="guardian-invites">
                <ul className="list">{pending.map((d) => (
                  <li key={d.link_id} className="row">
                    <div><strong>{t('fam.invitedFor', { name: d.name })}</strong><div className="hint">{rel(t, d.relationship)} - {evi(t, d.evidence_type)}</div></div>
                    <div className="btn-row"><Button busy={busy} onClick={() => void answer(d, true)} aria-label={`${t('app.accept')} - ${d.name}`}>{t('app.accept')}</Button><Button variant="secondary" busy={busy} onClick={() => void answer(d, false)} aria-label={`${t('app.decline')} - ${d.name}`}>{t('app.decline')}</Button></div>
                  </li>))}
                </ul>
                <DraftNote k="draft.guardian" />
              </Card>
            ) : null}
            <Card title={t('fam.dependants')} id="dependants">
              {active.length === 0 ? <Empty>{t('fam.empty')}</Empty> : <ul className="stack">{active.map((d) => <DependantCard key={d.link_id} dep={d} onChanged={deps.reload} />)}</ul>}
            </Card>
            <AddDependant onAdded={deps.reload} />
            {ended.length ? (
              <Card title={t('fam.history')}>
                <ul className="list">{ended.map((d) => (
                  <li key={d.link_id} className="row"><span>{d.name}</span><span className="hint">{t(`fam.status.${d.status}` as TKey)}{d.ended_reason ? ` - ${t(`fam.reason.${d.ended_reason}` as TKey)}` : ''} <Ltr>{fmtDate(d.expires_at, lang)}</Ltr></span></li>))}
                </ul>
              </Card>
            ) : null}
          </>
        );
      }}</Async>
    </>
  );
}
