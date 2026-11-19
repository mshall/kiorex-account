import { useState } from 'react';
import { useApp } from '../app-context';
import { useI18n, type TKey } from '../i18n';
import { ApiError, type Conflict, type FederatedIdentity, type LinkView } from '../api';
import { Alert, Async, Badge, Button, Card, DraftNote, Empty, Field, Ltr, useAction, useAsync, useToast } from '../ui';
import { E164, fmtDate, normPhone } from '../util';

const STATUS_KIND: Record<string, 'neutral' | 'success' | 'warning' | 'info' | 'danger'> = {
  pending_verification: 'warning', pending_review: 'info', merged: 'success', rejected: 'danger', reversed: 'neutral', cancelled: 'neutral',
};
export const statusKind = (s: string) => STATUS_KIND[s] ?? 'neutral';

export function ConflictList({ conflicts }: { conflicts: Conflict[] }) {
  const { t } = useI18n();
  if (!conflicts.length) return <p className="hint">{t('lnk.noConflicts')}</p>;
  return (
    <ul className="conflicts" aria-label={t('lnk.conflicts')}>
      {conflicts.map((c, i) => (
        <li key={`${c.code}-${i}`}><Badge kind={c.severity === 'blocking' ? 'warning' : 'neutral'}>{t(c.severity === 'blocking' ? 'cf.blocking' : 'cf.info')}</Badge> {t(`cf.${c.code}` as TKey)}</li>
      ))}
    </ul>
  );
}

function RequestCard({ onDone }: { onDone: () => void }) {
  const { api } = useApp();
  const { t, err } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const [phone, setPhone] = useState(''); const [other, setOther] = useState('');
  const [pending, setPending] = useState<{ id: string; phone: string } | null>(null);
  const [code, setCode] = useState(''); const [msg, setMsg] = useState('');
  const send = async () => {
    const p = normPhone(phone);
    if (!E164.test(p)) { setMsg(err('invalid_phone')); return; }
    setMsg('');
    await run(async () => { try { return await api.requestLink(p); } catch (x) { const a = x as ApiError; setMsg(err(a.code, a.status)); throw new ApiError(0, 'cancelled'); } }, (r) => { setPending({ id: r.link_id, phone: p }); setOther(p); onDone(); });
  };
  const verify = async () => {
    if (!pending) return;
    setMsg('');
    await run(async () => { try { return await api.verifyLink(pending.id, code.trim()); } catch (x) { const a = x as ApiError; setMsg(err(a.code === 'wrong_state' ? 'wrong_state' : a.code, a.status)); throw new ApiError(0, 'cancelled'); } }, () => { toast.ok(t('lnk.verified')); setPending(null); setCode(''); setPhone(''); onDone(); });
  };
  return (
    <Card title={t('lnk.request')} id="link-request">
      {msg ? <Alert kind="error">{msg}</Alert> : null}
      {!pending ? (
        <form onSubmit={(e) => { e.preventDefault(); void send(); }} noValidate>
          <Field label={t('lnk.phone')}>{(p) => <input {...p} name="link-phone" className="phone" type="tel" dir="ltr" inputMode="tel" autoComplete="off" placeholder="+201000000002" value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
          <Button type="submit" busy={busy}>{t('lnk.send')}</Button>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); void verify(); }}>
          <p>{t('lnk.sentTo')} <Ltr>{other}</Ltr></p>
          <p className="hint"><a href={`/dev/inbox?to=${encodeURIComponent(other)}`} target="_blank" rel="noreferrer">{t('lnk.devInbox')}</a></p>
          <Field label={t('lnk.code')}>{(p) => <input {...p} name="link-code" className="code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value)} data-autofocus />}</Field>
          <Button type="submit" busy={busy} disabled={!code.trim()}>{t('lnk.verify')}</Button>
        </form>
      )}
      <DraftNote k="draft.merge" />
    </Card>
  );
}

function RequestsCard({ links, onChanged, onResume }: { links: LinkView[]; onChanged: () => void; onResume: (l: LinkView) => void }) {
  const { api } = useApp();
  const { t, lang } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const cancel = (l: LinkView) => run(() => api.cancelLink(l.link_id), () => { toast.ok(t('lnk.cancelled')); onChanged(); });
  return (
    <Card title={t('lnk.requests')} id="link-requests">
      {links.length === 0 ? <Empty>{t('lnk.empty')}</Empty> : (
        <ul className="stack">{links.map((l) => (
          <li key={l.link_id} className="card inner" data-status={l.status}>
            <div className="row"><div><Badge kind={statusKind(l.status)}>{t(`lnk.status.${l.status}` as TKey)}</Badge><div className="hint">{t('lnk.requestedOn', { date: fmtDate(l.requested_at, lang, true) })}</div></div>
              {l.status === 'pending_verification' || l.status === 'pending_review' ? <Button variant="secondary" busy={busy} onClick={() => void cancel(l)}>{t('lnk.cancel')}</Button> : null}</div>
            {l.status !== 'pending_verification' ? <ConflictList conflicts={l.conflicts} /> : <p className="hint">{t('lnk.sentTo')}</p>}
            {l.status === 'pending_verification' ? <Button variant="ghost" onClick={() => onResume(l)}>{t('lnk.resume')}</Button> : null}
          </li>))}
        </ul>
      )}
    </Card>
  );
}

function FederationCard() {
  const { api } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const ids = useAsync<FederatedIdentity[] | null>(async () => { try { return await api.federationIdentities(); } catch (e) { if (e instanceof ApiError && e.status !== 401) return null; throw e; } }, []);
  return (
    <Async state={ids}>{(d) => d === null ? null : (
      <Card title={t('fed.title')} lead={t('fed.lead')} id="federation">
        {d.length === 0 ? <Empty>{t('fed.empty')}</Empty> : (
          <ul className="list">{d.map((f) => (
            <li key={`${f.upstream_id}:${f.upstream_sub}`} className="row"><span>{f.display_name ?? f.email ?? f.upstream_sub} <span className="hint">({f.upstream_id})</span></span>
              <Button variant="secondary" busy={busy} onClick={() => void run(() => api.federationUnlink(f.upstream_id, f.upstream_sub), () => { toast.ok(t('fed.unlinked')); ids.reload(); })}>{t('fed.unlink')}</Button></li>))}
          </ul>
        )}
      </Card>
    )}</Async>
  );
}

export function LinkedPage() {
  const { api } = useApp();
  const { t } = useI18n();
  const links = useAsync(() => api.links(), []);
  return (
    <>
      <h1>{t('lnk.title')}</h1>
      <p className="lead">{t('lnk.lead')}</p>
      <RequestCard onDone={links.reload} />
      <Async state={links}>{(d) => <RequestsCard links={d} onChanged={links.reload} onResume={() => document.getElementById('link-request')?.scrollIntoView()} />}</Async>
      <FederationCard />
    </>
  );
}
