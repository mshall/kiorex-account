import { useState } from 'react';
import { useApp } from '../app-context';
import { useI18n, type TKey } from '../i18n';
import { Link } from '../router';
import { Alert, Async, Badge, Button, Card, Field, Ltr, useAction, useAsync, useToast } from '../ui';

export function HomePage() {
  const { api, account, reloadAccount, meta, cfg } = useApp();
  const { t, setLang } = useI18n();
  const toast = useToast();
  const [name, setName] = useState(account.name ?? '');
  const [locale, setLocale] = useState<'ar' | 'en'>(account.locale);
  const { busy, run } = useAction();
  const isOps = account.roles.some((r) => r === 'ops_admin' || r === 'super_admin');

  const summary = useAsync(async () => {
    const [sessions, passkeys, deps, invites, review] = await Promise.all([
      api.sessions().catch(() => []),
      meta?.passkeys_enabled ? api.passkeys().catch(() => []) : Promise.resolve([]),
      api.dependants().catch(() => []),
      api.pendingInvitations().catch(() => []),
      isOps ? api.opsLinks('pending_review').catch(() => []) : Promise.resolve([]),
    ]);
    return { sessions: sessions.length, passkeys: passkeys.length, guardian: deps.filter((d) => d.status === 'pending').length, org: invites.length, review: review.length };
  }, [account.sub]);

  const save = () => run(() => api.updateProfile({ name: name.trim(), locale }), async () => { await reloadAccount(); setLang(locale); toast.ok(t('home.saved')); });

  const attention: Array<{ key: string; to: string; text: string }> = [];
  const s = summary.data;
  if (s?.guardian) attention.push({ key: 'g', to: '/account/family', text: t('home.attn.guardian', { n: s.guardian }) });
  if (s?.org) attention.push({ key: 'o', to: '/account/orgs', text: t('home.attn.org', { n: s.org }) });
  if (s?.review) attention.push({ key: 'r', to: '/account/ops/links', text: t('home.attn.review') });

  return (
    <>
      <h1>{account.name ? t('home.hello', { name: account.name }) : t('home.helloAnon')}</h1>
      <div className="grid">
        <Card title={t('home.profile')}>
          <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <Field label={t('home.name')} hint={t('home.nameHint')}>{(p) => <input {...p} name="name" autoComplete="name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
            <Field label={t('home.language')}>{(p) => (
              <select {...p} name="locale" value={locale} onChange={(e) => setLocale(e.target.value as 'ar' | 'en')}>
                <option value="ar">{t('home.langAr')}</option><option value="en">{t('home.langEn')}</option>
              </select>
            )}</Field>
            <Button type="submit" busy={busy}>{t('app.save')}</Button>
          </form>
        </Card>
        <Card title={t('home.phone')} lead={t('home.phoneHint')}>
          <p className="big"><Ltr>{account.phone ?? '-'}</Ltr> <Badge kind={account.phone_verified ? 'success' : 'warning'}>{account.phone_verified ? t('home.verified') : t('home.unverified')}</Badge></p>
          <h3>{t('home.roles')}</h3>
          <p>{account.roles.map((r) => <Badge key={r} kind={r === 'patient' ? 'neutral' : 'info'}>{t(`role.${r}` as TKey) === `role.${r}` ? r : t(`role.${r}` as TKey)}</Badge>)}</p>
          <p className="hint">{t('home.rolesHint')}</p>
        </Card>
        <Card title={t('home.attention')}>
          <Async state={summary}>{() => attention.length
            ? <ul className="list">{attention.map((a) => <li key={a.key}><Link to={a.to}>{a.text}</Link></li>)}</ul>
            : <p className="empty">{t('home.allClear')}</p>}</Async>
        </Card>
        <Card title={t('home.security')} actions={<Link to="/account/security" className="btn btn-secondary">{t('home.manage')}</Link>}>
          <Async state={summary}>{(d) => (
            <dl className="rows">
              {meta?.passkeys_enabled ? <div><dt>{t('home.sec.passkeys')}</dt><dd>{d.passkeys}</dd></div> : null}
              <div><dt>{t('home.sec.totp')}</dt><dd>{account.totp_enrolled ? <Badge kind="success">{t('home.sec.on')}</Badge> : <Badge>{account.mfa_required ? t('home.sec.required') : t('home.sec.off')}</Badge>}</dd></div>
              <div><dt>{t('home.sec.sessions')}</dt><dd>{d.sessions}</dd></div>
            </dl>
          )}</Async>
        </Card>
      </div>
      <nav className="shortcuts" aria-label={t('home.shortcuts')}>
        <Link to="/account/family" className="shortcut">{t('nav.family')}</Link>
        <Link to="/account/linked" className="shortcut">{t('nav.linked')}</Link>
        <Link to="/account/orgs" className="shortcut">{t('nav.orgs')}</Link>
        <Link to="/account/privacy" className="shortcut">{t('nav.privacy')}</Link>
        <Link to="/account/apps" className="shortcut">{t('nav.apps')}</Link>
        {cfg.kiorexWebUrl ? <a href={cfg.kiorexWebUrl} className="shortcut">{t('app.openKiorex')}</a> : null}
      </nav>
      {summary.error ? <Alert kind="warning">{t('err.unknown')}</Alert> : null}
    </>
  );
}
