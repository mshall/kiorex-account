import { useState } from 'react';
import { useApp } from '../app-context';
import { useI18n } from '../i18n';
import { Alert, Button, Card, ConfirmDialog, DraftNote, Field, useAction, useToast } from '../ui';

export function PrivacyPage() {
  const { api, auth } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const exp = useAction(); const del = useAction();
  const [ack, setAck] = useState(false);
  const [word, setWord] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [exported, setExported] = useState(false);
  const expected = t('prv.word');
  const ready = ack && word.trim().toLowerCase() === expected.toLowerCase();

  const download = () => exp.run(() => api.exportData(), (data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'kiorex-passport-export.json'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExported(true); toast.ok(t('prv.exportReady'));
  });

  const doDelete = () => del.run(() => api.deleteAccount(), () => { auth.clear(); window.location.assign('/account?deleted=1'); });

  return (
    <>
      <h1>{t('prv.title')}</h1>
      <p className="lead">{t('prv.lead')}</p>
      <Card title={t('prv.export')} lead={t('prv.exportLead')} id="export">
        <p className="hint">{t('prv.exportIncludes')}</p>
        <DraftNote k="draft.export" />
        <Button onClick={() => void download()} busy={exp.busy}>{exp.busy ? t('prv.exportWorking') : t('prv.exportBtn')}</Button>
        {exported ? <Alert kind="success">{t('prv.exportReady')}</Alert> : null}
      </Card>
      <Card title={t('prv.delete')} lead={t('prv.deleteLead')} id="delete">
        <h3>{t('prv.consequences')}</h3>
        <ul className="consequences">{[1, 2, 3, 4, 5, 6, 7].map((n) => <li key={n}>{t(`prv.c${n}`)}</li>)}</ul>
        <DraftNote k="draft.deletion" />
        <form onSubmit={(e) => { e.preventDefault(); if (ready) setConfirm(true); }}>
          <label className="check"><input type="checkbox" name="ack" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>{t('prv.ack')}</span></label>
          <Field label={t('prv.typeWord', { word: expected })}>{(p) => <input {...p} name="confirm-word" autoComplete="off" value={word} onChange={(e) => setWord(e.target.value)} />}</Field>
          <Button type="submit" variant="danger" disabled={!ready}>{t('prv.deleteBtn')}</Button>
        </form>
      </Card>
      {confirm ? <ConfirmDialog title={t('prv.deleteTitle')} body={t('prv.deleteBody')} confirmLabel={t('prv.deleteBtn')} danger busy={del.busy} onConfirm={() => void doDelete()} onCancel={() => setConfirm(false)} /> : null}
    </>
  );
}
