import { useEffect, useState } from 'react';
import { useApp } from '../app-context';
import { useI18n, type TKey } from '../i18n';
import { ApiError, type Membership, type OrgMember, type PendingInvitation } from '../api';
import { Alert, Async, Badge, Button, Card, ConfirmDialog, Empty, Field, Ltr, useAction, useAsync, useToast } from '../ui';
import { E164, fmtDate, normPhone } from '../util';
import { useRoute } from '../router';

const hint = (t: (k: TKey) => string, r: string) => { const k = `org.hint.${r}` as TKey; const v = t(k); return v === k ? r : v; };
const roleName = (t: (k: TKey) => string, r: string) => hint(t, r).split(':')[0];
const MANAGERS = ['owner', 'admin'];

function Invitations({ onJoined }: { onJoined: () => void }) {
  const { api } = useApp();
  const { t, lang } = useI18n();
  const toast = useToast();
  const { query } = useRoute();
  const { busy, run } = useAction();
  const list = useAsync(() => api.pendingInvitations(), []);
  const [token, setToken] = useState(query.get('invite') ?? '');
  const [msg, setMsg] = useState('');
  useEffect(() => { const q = query.get('invite'); if (q) setToken(q); }, [query]);

  const answer = (i: PendingInvitation, accept: boolean) => run(async () => { if (accept) await api.acceptInvitation(i.invitation_id); else await api.declineInvitation(i.invitation_id); }, () => {
    toast.ok(accept ? t('org.accepted', { org: i.legal_name }) : t('org.declined')); list.reload(); if (accept) onJoined();
  });
  const { err } = useI18n();
  const acceptToken = async () => {
    setMsg('');
    await run(async () => { try { return await api.acceptInvitationToken(token.trim()); } catch (x) { const a = x as ApiError; setMsg(err(a.code, a.status)); throw new ApiError(0, 'cancelled'); } }, () => { toast.ok(t('org.joined')); setToken(''); list.reload(); onJoined(); });
  };

  return (
    <Card title={t('org.invites')} id="org-invitations">
      <Async state={list}>{(d) => d.length === 0 ? null : (
        <ul className="list">{d.map((i) => (
          <li key={i.invitation_id} className="row">
            <div><strong>{i.invited_by_name ? t('org.invitedAs', { by: i.invited_by_name, org: i.legal_name, role: roleName(t, i.role_hint) }) : t('org.invitedAsAnon', { org: i.legal_name, role: roleName(t, i.role_hint) })}</strong><div className="hint">{t('org.expires', { date: fmtDate(i.expires_at, lang) })}</div></div>
            <div className="btn-row"><Button busy={busy} onClick={() => void answer(i, true)} aria-label={`${t('app.accept')} - ${i.legal_name}`}>{t('app.accept')}</Button><Button variant="secondary" busy={busy} onClick={() => void answer(i, false)} aria-label={`${t('app.decline')} - ${i.legal_name}`}>{t('app.decline')}</Button></div>
          </li>))}
        </ul>
      )}</Async>
      <form onSubmit={(e) => { e.preventDefault(); void acceptToken(); }}>
        <Field label={`${t('org.token')} ${t('org.tokenField')}`} error={msg}>{(p) => <input {...p} name="invite-token" dir="ltr" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />}</Field>
        <Button type="submit" variant="secondary" busy={busy} disabled={token.trim().length < 16}>{t('org.tokenGo')}</Button>
      </form>
    </Card>
  );
}

function Manage({ m }: { m: Membership }) {
  const { api, meta, account } = useApp();
  const { t } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const members = useAsync<OrgMember[]>(() => api.orgMembers(m.org_id), [m.org_id]);
  const roles = meta?.orgs.role_hints ?? ['owner', 'admin', 'doctor', 'nurse', 'receptionist', 'finance', 'pharmacist', 'lab_technician', 'staff'];
  const [phone, setPhone] = useState(''); const [role, setRole] = useState('staff'); const [msg, setMsg] = useState('');
  const [removing, setRemoving] = useState<OrgMember | null>(null);
  const { err } = useI18n();
  const invite = async () => {
    const p = normPhone(phone);
    if (!E164.test(p)) { setMsg(err('invalid_phone')); return; }
    setMsg('');
    await run(async () => { try { await api.inviteMember(m.org_id, { phone: p, role_hint: role }); } catch (x) { const a = x as ApiError; setMsg(err(a.code, a.status)); throw new ApiError(0, 'cancelled'); } }, () => { toast.ok(t('org.invite.sent')); setPhone(''); });
  };
  const change = (mem: OrgMember, r: string) => run(() => api.changeRole(m.org_id, mem.sub, r), () => { toast.ok(t('org.roleChanged')); members.reload(); });
  const remove = () => removing && run(() => api.removeMember(m.org_id, removing.sub), () => { toast.ok(t('org.removed')); setRemoving(null); members.reload(); });
  return (
    <div className="manage">
      <h4>{t('org.members')}</h4>
      <Async state={members}>{(d) => (
        <ul className="list" aria-label={t('org.members')}>{d.filter((x) => x.status === 'active').map((x) => (
          <li key={x.membership_id} className="row">
            <span>{x.name ?? '-'} {x.sub === account.sub ? <Badge>{t('app.you')}</Badge> : null}</span>
            <span className="btn-row">
              <select aria-label={`${t('org.role')} - ${x.name ?? x.sub}`} value={x.role_hint} onChange={(e) => void change(x, e.target.value)} disabled={busy}>{roles.map((r) => <option key={r} value={r}>{roleName(t, r)}</option>)}</select>
              {x.sub !== account.sub ? <Button variant="ghost" onClick={() => setRemoving(x)} aria-label={`${t('org.removeMember')} - ${x.name ?? x.sub}`}>{t('org.removeMember')}</Button> : null}
            </span>
          </li>))}
        </ul>
      )}</Async>
      <h4>{t('org.invite')}</h4>
      {msg ? <Alert kind="error">{msg}</Alert> : null}
      <form onSubmit={(e) => { e.preventDefault(); void invite(); }} noValidate className="inline-form">
        <Field label={t('org.invite.phone')}>{(p) => <input {...p} name="invite-phone" className="phone" type="tel" dir="ltr" inputMode="tel" autoComplete="off" placeholder="+201000000003" value={phone} onChange={(e) => setPhone(e.target.value)} />}</Field>
        <Field label={t('org.invite.role')}>{(p) => <select {...p} name="invite-role" value={role} onChange={(e) => setRole(e.target.value)}>{roles.map((r) => <option key={r} value={r}>{roleName(t, r)}</option>)}</select>}</Field>
        <Button type="submit" busy={busy}>{t('org.invite.send')}</Button>
      </form>
      {removing ? <ConfirmDialog title={t('org.removeTitle')} body={removing.name ?? undefined} confirmLabel={t('org.removeMember')} danger busy={busy} onConfirm={() => void remove()} onCancel={() => setRemoving(null)} /> : null}
    </div>
  );
}

function MembershipCard({ m, onChanged }: { m: Membership; onChanged: () => void }) {
  const { api, account } = useApp();
  const { t, lang } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const [open, setOpen] = useState(false);
  const [leave, setLeave] = useState(false);
  const manager = MANAGERS.includes(m.role_hint) && m.status === 'active';
  const doLeave = () => run(() => api.removeMember(m.org_id, account.sub), () => { setLeave(false); toast.ok(t('org.left')); onChanged(); });
  return (
    <li className="card inner" aria-label={m.legal_name}>
      <div className="row">
        <div><h3>{m.legal_name} <span className="hint"><Ltr>{m.country}</Ltr></span></h3>
          <p className="hint">{t('org.since', { date: fmtDate(m.effective_from, lang) })}</p></div>
        <div><span className="hint">{t('org.role')}: </span><Badge kind="info">{roleName(t, m.role_hint)}</Badge> <Badge kind={m.status === 'active' ? 'success' : 'neutral'}>{t(`org.status.${m.status}` as TKey)}</Badge></div>
      </div>
      <p className="hint">{hint(t, m.role_hint)} {t('org.hintNote')}</p>
      {m.status === 'active' ? (
        <div className="btn-row">
          {manager ? <Button variant="secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>{t('org.manage')}</Button> : null}
          <Button variant="ghost" onClick={() => setLeave(true)}>{t('org.leave')}</Button>
        </div>
      ) : null}
      {open && manager ? <Manage m={m} /> : null}
      {leave ? <ConfirmDialog title={t('org.leaveTitle', { org: m.legal_name })} confirmLabel={t('org.leave')} danger busy={busy} onConfirm={() => void doLeave()} onCancel={() => setLeave(false)} /> : null}
    </li>
  );
}

function CreateOrg({ onCreated }: { onCreated: () => void }) {
  const { api } = useApp();
  const { t, err } = useI18n();
  const toast = useToast();
  const { busy, run } = useAction();
  const [name, setName] = useState(''); const [country, setCountry] = useState('EG'); const [msg, setMsg] = useState('');
  const submit = () => {
    setMsg('');
    void run(async () => { try { await api.createOrg({ legal_name: name.trim(), country: country.trim() }); } catch (x) { const a = x as ApiError; setMsg(err(a.code, a.status)); throw new ApiError(0, 'cancelled'); } }, () => { toast.ok(t('org.created')); setName(''); onCreated(); });
  };
  return (
    <Card title={t('org.create')} id="org-create">
      {msg ? <Alert kind="error">{msg}</Alert> : null}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} noValidate>
        <Field label={t('org.create.name')}>{(p) => <input {...p} name="org-name" maxLength={120} autoComplete="organization" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label={t('org.create.country')}>{(p) => <input {...p} name="org-country" maxLength={2} dir="ltr" autoComplete="country" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} />}</Field>
        <Button type="submit" busy={busy} disabled={!name.trim()}>{t('org.create.submit')}</Button>
      </form>
    </Card>
  );
}

export function OrgsPage() {
  const { api } = useApp();
  const { t } = useI18n();
  const mine = useAsync(() => api.orgs(), []);
  return (
    <>
      <h1>{t('org.title')}</h1>
      <p className="lead">{t('org.lead')}</p>
      <Invitations onJoined={mine.reload} />
      <Card title={t('org.title')} id="memberships">
        <Async state={mine}>{(d) => d.length === 0 ? <Empty>{t('org.empty')}</Empty> : <ul className="stack">{d.map((m) => <MembershipCard key={m.membership_id} m={m} onChanged={mine.reload} />)}</ul>}</Async>
      </Card>
      <CreateOrg onCreated={mine.reload} />
    </>
  );
}
