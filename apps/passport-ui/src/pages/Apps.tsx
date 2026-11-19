import { useState } from 'react';
import { useApp } from '../app-context';
import { useI18n, type TKey } from '../i18n';
import { type ConnectedApp } from '../api';
import { Async, Badge, Button, Card, ConfirmDialog, DraftNote, Empty, useAction, useAsync, useToast } from '../ui';
import { fmtDate } from '../util';

export function AppsPage() {
  const { api, cfg } = useApp();
  const { t, lang } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const apps = useAsync(() => api.connectedApps(), []);
  const [target, setTarget] = useState<ConnectedApp | null>(null);
  const revoke = () => target && run(() => api.revokeApp(target.client_id), () => { toast.ok(t('app2.revoked')); setTarget(null); apps.reload(); });
  return (
    <>
      <h1>{t('app2.title')}</h1>
      <p className="lead">{t('app2.lead')}</p>
      <Card title={t('app2.title')} id="apps">
        <Async state={apps}>{(d) => d.length === 0 ? <Empty>{t('app2.empty')}</Empty> : (
          <ul className="stack">{d.map((a) => {
            const current = a.client_id === cfg.clientId;
            return (
              <li key={a.client_id} className="card inner" aria-label={a.name} data-client={a.client_id}>
                <div className="row">
                  <div><h3>{a.name}</h3><p className="hint">{t('app2.granted', { date: fmtDate(a.last_granted_at, lang) })}</p></div>
                  {current ? <Badge kind="info">{t('app2.current')}</Badge> : <Button variant="secondary" onClick={() => setTarget(a)} aria-label={`${t('app2.revoke')} - ${a.name}`}>{t('app2.revoke')}</Button>}
                </div>
                <p className="label">{t('app2.scopes')}</p>
                <ul>{a.scopes.map((s) => <li key={s}>{(() => { const k = `sc.${s}` as TKey; const v = t(k); return v === k ? s : v; })()}</li>)}</ul>
              </li>
            );
          })}</ul>
        )}</Async>
        <DraftNote k="draft.consent" />
      </Card>
      {target ? <ConfirmDialog title={t('app2.revokeTitle', { app: target.name })} body={t('app2.revokeBody')} confirmLabel={t('app2.revoke')} danger busy={busy} onConfirm={() => void revoke()} onCancel={() => setTarget(null)} /> : null}
    </>
  );
}
