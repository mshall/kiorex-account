import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'ar' | 'en';

/**
 * Copy keys whose wording needs legal / clinical review before launch (CLAUDE.md "stop and ask a human"; Docs/NEEDS_HUMAN.md #8, #13, #19).
 * They render with a visible "draft wording" note (<DraftNote/>) and are checked by test/i18n.test.tsx.
 */
export const NEEDS_HUMAN_KEYS = [
  'draft.consent', 'draft.deletion', 'draft.guardian', 'draft.majority', 'draft.merge', 'draft.export',
] as const;

const en = {
  // brand + shell
  'app.name': 'Kiorex Passport', 'app.skip': 'Skip to content', 'app.loading': 'Loading', 'app.retry': 'Try again', 'app.close': 'Close',
  'app.cancel': 'Cancel', 'app.confirm': 'Confirm', 'app.save': 'Save', 'app.remove': 'Remove', 'app.add': 'Add', 'app.accept': 'Accept', 'app.decline': 'Decline',
  'app.back': 'Back', 'app.copy': 'Copy', 'app.copied': 'Copied', 'app.none': 'None', 'app.yes': 'Yes', 'app.no': 'No', 'app.you': 'This device',
  'app.devNote': 'Development identity provider. Messages are mocked (dev inbox).', 'app.mainNav': 'Account sections', 'app.language': 'Language', 'app.theme': 'Theme',
  'theme.system': 'System', 'theme.light': 'Light', 'theme.dark': 'Dark', 'app.signOut': 'Sign out', 'app.openKiorex': 'Open Kiorex', 'app.notFound': 'This page does not exist.',
  'nav.home': 'Account', 'nav.security': 'Security', 'nav.family': 'Family', 'nav.linked': 'Linked accounts', 'nav.orgs': 'Organisations', 'nav.privacy': 'Data & privacy',
  'nav.apps': 'Connected apps', 'nav.ops': 'Link review',
  'draft.badge': 'Draft wording, pending legal review',
  'draft.consent': 'Draft wording about what connected apps may see. Final text needs legal review.',
  'draft.deletion': 'Draft wording about deletion and retention. Final text needs legal review.',
  'draft.guardian': 'Draft wording about guardian evidence and responsibility. Final text needs legal review.',
  'draft.majority': 'Draft wording about the age of majority. The age and the process per market need legal confirmation.',
  'draft.merge': 'Draft wording about merging accounts. The review policy needs operations and legal sign-off.',
  'draft.export': 'Draft wording about your data export. Final text needs legal review.',

  // sign-in
  'signin.title': 'Manage your Kiorex Passport', 'signin.lead': 'One account for Kiorex and Kiorly. Sign in with your mobile number, a passkey or an authenticator code.',
  'signin.cta': 'Sign in', 'signin.working': 'Signing you in', 'signin.failed': 'Sign-in could not be completed. Please try again.', 'signin.expired': 'Your session ended. Please sign in again.',
  'signin.deleted.title': 'Your account was deleted', 'signin.deleted.body': 'Your Kiorex Passport and its sign-in methods were removed. Products have been told to delete their link to you.',

  // home
  'home.title': 'Your account', 'home.hello': 'Hello, {name}', 'home.helloAnon': 'Welcome',
  'home.profile': 'Profile', 'home.name': 'Name', 'home.nameHint': 'Shown to doctors and clinics you book with.', 'home.language': 'Language', 'home.langAr': 'Arabic', 'home.langEn': 'English',
  'home.saved': 'Saved.', 'home.phone': 'Mobile number', 'home.verified': 'Verified', 'home.unverified': 'Not verified',
  'home.phoneHint': 'Your number is how you sign in. To merge a second number, use Linked accounts.', 'home.roles': 'Roles',
  'home.rolesHint': 'Role hints only. Each product decides what you may do.', 'home.attention': 'Needs your attention', 'home.allClear': 'Nothing needs your attention.',
  'home.attn.guardian': '{n} family invitation(s) waiting', 'home.attn.org': '{n} organisation invitation(s) waiting', 'home.attn.review': 'Link requests are waiting for review',
  'home.security': 'Security at a glance', 'home.sec.passkeys': 'Passkeys', 'home.sec.totp': 'Authenticator app', 'home.sec.sessions': 'Active sessions',
  'home.sec.on': 'On', 'home.sec.off': 'Off', 'home.sec.required': 'Required for your role', 'home.manage': 'Manage', 'home.shortcuts': 'Manage',
  'role.patient': 'Patient', 'role.ops_admin': 'Operations admin', 'role.super_admin': 'Super admin',

  // security
  'sec.title': 'Security',
  'pk.title': 'Passkeys', 'pk.lead': 'Sign in with your fingerprint, face or device PIN. Passkeys never leave your device and cannot be phished.', 'pk.empty': 'No passkeys yet.',
  'pk.add': 'Add a passkey', 'pk.adding': 'Waiting for your device', 'pk.added': 'Passkey added.', 'pk.removed': 'Passkey removed.', 'pk.synced': 'Synced passkey', 'pk.device': 'Device-bound passkey',
  'pk.createdOn': 'Added {date}', 'pk.removeTitle': 'Remove this passkey?', 'pk.removeBody': 'You will no longer be able to sign in with it. You can still use a code sent to your mobile number.',
  'pk.unsupported': 'This browser or device does not support passkeys.', 'pk.disabled': 'Passkeys are temporarily unavailable.', 'pk.cancelled': 'The passkey was not added.',
  'totp.title': 'Authenticator app (two-step verification)', 'totp.lead': 'A second factor that adds a 6-digit code from an authenticator app.',
  'totp.on': 'Authenticator app is on.', 'totp.off': 'Authenticator app is off.', 'totp.required': 'Your role requires two-step verification, so it cannot be turned off.',
  'totp.enrol': 'Set up', 'totp.key': 'Setup key', 'totp.uri': 'Setup link', 'totp.enrolHint': 'Add this key to your authenticator app, then enter the code it shows.',
  'totp.code': 'Authenticator code', 'totp.confirm': 'Confirm and turn on', 'totp.enabled': 'Authenticator app turned on.', 'totp.disable': 'Turn off',
  'totp.disableTitle': 'Turn off the authenticator app?', 'totp.disableBody': 'We will ask you for a fresh code first. Your account will be less protected.', 'totp.disabled': 'Authenticator app turned off.',
  'email.title': 'E-mail address (optional)', 'email.lead': 'Add an e-mail address and confirm it with a code we send you. It is never confirmed just by typing it.',
  'email.waiting': 'A code was sent to your address a moment ago. Enter it below, or use another address to get a new one.', 'email.none': 'No e-mail address on this account.', 'email.address': 'E-mail address', 'email.send': 'Send code', 'email.sent': 'We sent a 6-digit code to {email}. It expires in 10 minutes.',
  'email.code': 'E-mail code', 'email.verify': 'Confirm e-mail', 'email.verified': 'E-mail confirmed.', 'email.resend': 'Send a new code', 'email.change': 'Use another address', 'email.codeResent': 'A new code was sent.',
  'email.statusVerified': 'Confirmed', 'email.statusPending': 'Not confirmed yet', 'email.current': 'Current address', 'email.remove': 'Remove e-mail',
  'email.removeTitle': 'Remove this e-mail address?', 'email.removeBody': 'It will no longer be linked to your account. You can add it again later.', 'email.removed': 'E-mail removed.',
  'ev.email.verification.sent': 'E-mail code sent', 'ev.email.verification.failed': 'E-mail code rejected', 'ev.email.verified': 'E-mail confirmed', 'ev.email.removed': 'E-mail removed',
  'ses.title': 'Active sessions', 'ses.lead': 'Devices and apps where you are signed in.', 'ses.current': 'This session', 'ses.started': 'Signed in {date}', 'ses.lastSeen': 'Last active {date}',
  'ses.apps': 'Apps: {apps}', 'ses.revoke': 'Sign out', 'ses.revokeTitle': 'Sign this session out?', 'ses.revokeBody': 'The device will be signed out of every Kiorex app straight away.',
  'ses.revokeOthers': 'Sign out all other sessions', 'ses.revoked': 'Session signed out.', 'ses.revokedOthers': 'All other sessions signed out.', 'ses.empty': 'No sessions.', 'ses.unknownDevice': 'Unknown device',
  'ev.title': 'Recent sign-in activity', 'ev.lead': 'Security events on your account. If you do not recognise something, sign out other sessions.', 'ev.empty': 'No activity yet.',
  'ev.login.success': 'Signed in', 'ev.passkey.login': 'Signed in with a passkey', 'ev.passkey.login.failed': 'Passkey sign-in failed', 'ev.passkey.registered': 'Passkey added', 'ev.passkey.removed': 'Passkey removed',
  'ev.totp.enrolled': 'Authenticator app turned on', 'ev.totp.disabled': 'Authenticator app turned off', 'ev.totp.verified': 'Authenticator code accepted', 'ev.totp.failed': 'Authenticator code rejected',
  'ev.step_up.success': 'Extra verification passed', 'ev.step_up.failed': 'Extra verification failed', 'ev.session.revoked': 'Session signed out', 'ev.federation.login': 'Signed in with a provider account',
  'ev.account.link.requested': 'Account link requested', 'ev.account.link.verified': 'Account link verified', 'ev.account.link.merged': 'Accounts merged', 'ev.account.link.reversed': 'Account merge reversed',
  'ev.guardian.act_as': 'Acted on behalf of a family member', 'ev.app.access.revoked': 'App access removed', 'ev.account.profile.updated': 'Profile updated', 'ev.via': 'via {client}',
  'client.kiorex-web': 'Kiorex patient web', 'client.kiorex-ops': 'Kiorex ops console', 'client.kiorex-mobile': 'Kiorex mobile app', 'client.kiorly-clinic': 'Kiorly Clinic', 'client.kiorex-passport-web': 'Kiorex Passport',

  // family
  'fam.title': 'Family and guardians', 'fam.lead': 'Manage children and other dependants you are responsible for, and who else can act for them.',
  'fam.invites': 'Invitations to be a guardian', 'fam.invitedFor': 'You were invited to help look after {name}.', 'fam.accepted': 'You are now a guardian.', 'fam.declined': 'Invitation declined.',
  'fam.dependants': 'Your dependants', 'fam.empty': 'You have not added a dependant yet.', 'fam.age': 'Age {age}', 'fam.born': 'Born {date}', 'fam.relationship': 'Relationship', 'fam.evidence': 'Evidence',
  'fam.expires': 'Your access ends on {date}', 'fam.majority.soon': 'Turns {age} on {date}, in {days} day(s). Your access then ends and they manage their own Passport.',
  'fam.majority.later': 'Your guardian access ends automatically on {date}, when {name} reaches the age of majority ({age}).',
  'fam.add': 'Add a dependant', 'fam.add.name': 'Full name', 'fam.add.dob': 'Date of birth', 'fam.add.rel': 'Your relationship', 'fam.add.evidence': 'Evidence type', 'fam.add.ref': 'Document reference',
  'fam.add.refHint': 'An opaque reference only (for example a certificate number). Never enter a national ID number.', 'fam.add.submit': 'Add dependant', 'fam.add.done': 'Dependant added.',
  'fam.add.nationalId': 'This looks like a national ID number. Enter a document reference instead.', 'fam.add.dobFuture': 'Date of birth cannot be in the future.',
  'fam.add.adult': 'This person is already an adult and manages their own Passport.', 'fam.add.limit': 'You reached the maximum number of dependants.',
  'rel.parent': 'Parent', 'rel.legal_guardian': 'Legal guardian', 'rel.grandparent': 'Grandparent', 'rel.other_relative': 'Other relative',
  'evi.self_declared': 'Self-declared', 'evi.birth_certificate_ref': 'Birth certificate reference', 'evi.court_order_ref': 'Court order reference', 'evi.provider_attested': 'Attested by a provider',
  'fam.actAs': 'Act as {name}', 'fam.actAs.title': 'Act on behalf of {name}', 'fam.actAs.lead': 'Choose what you may do. The access is short-lived and shows you as the guardian everywhere.',
  'fam.actAs.start': 'Continue as guardian', 'fam.actAs.ready': 'Ready. You can act for {name} for {minutes} minute(s).', 'fam.actAs.scopes': 'Allowed actions', 'fam.actAs.token': 'Developer token (not shown to patients)',
  'fam.actAs.openKiorex': 'Open Kiorex as {name}', 'fam.actAs.expires': 'Expires {date}', 'fam.actAs.noScope': 'Select at least one action.',
  'scope.dependant:profile': 'View and update their profile', 'scope.dependant:booking': 'Book and manage appointments', 'scope.dependant:consent': 'Give and withdraw consent for them',
  'fam.co': 'Invite another guardian', 'fam.co.lead': 'The other person needs a Kiorex Passport. They must accept before they can act.', 'fam.co.phone': 'Their mobile number', 'fam.co.sent': 'Invitation sent.',
  'fam.revoke': 'Remove my access', 'fam.revokeTitle': 'Remove your guardian access to {name}?', 'fam.revokeBody': 'You will no longer be able to act for them. This cannot be undone from this page.', 'fam.revoked': 'Guardian access removed.',
  'fam.history': 'Ended and pending links', 'fam.status.active': 'Active', 'fam.status.pending': 'Waiting for acceptance', 'fam.status.revoked': 'Ended', 'fam.status.expired': 'Ended at majority',
  'fam.reason.age_of_majority': 'Ended automatically at the age of majority', 'fam.reason.revoked_by_guardian': 'Removed by the guardian', 'fam.reason.declined_by_invitee': 'Declined', 'fam.reason.guardian_deleted': 'Guardian account deleted',

  // linked
  'lnk.title': 'Linked accounts', 'lnk.lead': 'Have a second Kiorex Passport (for example an old number)? Ask to link it. A person on our team reviews every request. Accounts are never merged automatically.',
  'lnk.request': 'Link another account', 'lnk.phone': 'Mobile number of the other account', 'lnk.send': 'Send verification code', 'lnk.sentTo': 'We sent a code to the other number. Enter it to prove it is yours.',
  'lnk.code': 'Verification code', 'lnk.verify': 'Verify', 'lnk.verified': 'Verified. Your request is waiting for review.', 'lnk.requests': 'Your requests', 'lnk.empty': 'No link requests.',
  'lnk.cancel': 'Cancel request', 'lnk.cancelled': 'Request cancelled.', 'lnk.requestedOn': 'Requested {date}', 'lnk.conflicts': 'Differences found', 'lnk.noConflicts': 'No differences found.',
  'lnk.status.pending_verification': 'Waiting for the code', 'lnk.status.pending_review': 'Waiting for review', 'lnk.status.merged': 'Linked', 'lnk.status.rejected': 'Rejected',
  'lnk.status.reversed': 'Reversed', 'lnk.status.cancelled': 'Cancelled', 'lnk.resume': 'Enter the code', 'lnk.devInbox': 'Development only: read the code in the dev inbox',
  'cf.name_mismatch': 'The names differ', 'cf.locale_mismatch': 'The languages differ', 'cf.privileged_role_on_secondary': 'The other account has a privileged role. It is never carried over.',
  'cf.privileged_role_on_primary': 'The main account has a privileged role', 'cf.guardian_links_on_both': 'Both accounts have guardian links', 'cf.membership_role_conflict': 'Different roles in the same organisation',
  'cf.totp_on_both': 'Both accounts use an authenticator app', 'cf.blocking': 'Needs a decision', 'cf.info': 'For information',
  'fed.title': 'Provider accounts', 'fed.lead': 'Accounts from your hospital or employer that you use to sign in.', 'fed.empty': 'No provider accounts linked.', 'fed.unlink': 'Unlink', 'fed.unlinked': 'Provider account unlinked.',

  // ops review
  'ops.title': 'Account link review', 'ops.lead': 'Review verified link requests. Approving and reversing need a fresh two-step verification.', 'ops.denied': 'This page is for operations staff.',
  'ops.empty': 'Nothing in this queue.', 'ops.tab.pending_review': 'To review', 'ops.tab.merged': 'Merged', 'ops.tab.rejected': 'Rejected', 'ops.tab.reversed': 'Reversed',
  'ops.approve': 'Approve merge', 'ops.reject': 'Reject', 'ops.reverse': 'Reverse merge', 'ops.note': 'Note for the record (optional)', 'ops.resolution': 'Decision needed',
  'ops.nameKeep': 'Which name should the account keep?', 'ops.namePrimary': 'Main account: {name}', 'ops.nameSecondary': 'Other account: {name}', 'ops.roleKeep': 'Role in organisation {org}',
  'ops.rolePrimary': 'Main: {role}', 'ops.roleSecondary': 'Other: {role}', 'ops.approved': 'Merge approved.', 'ops.rejected': 'Request rejected.', 'ops.reversed': 'Merge reversed.',
  'ops.confirmApprove': 'Approve this merge?', 'ops.confirmApproveBody': 'Only identity data moves. Products merge patient records separately. You can reverse this later.',
  'ops.confirmReverse': 'Reverse this merge?', 'ops.confirmReverseBody': 'The other account is restored with what it had before the merge.', 'ops.confirmReject': 'Reject this request?',
  'ops.mainAccount': 'Main account', 'ops.otherAccount': 'Other account', 'ops.reviewedBy': 'Reviewed {date}',

  // orgs
  'org.title': 'Organisations', 'org.lead': 'Clinics, nursing practices and agencies, pharmacies and labs you belong to. You can belong to more than one, for example your own nursing practice and an agency. A role here is only a hint; each product decides what you can do.',
  'org.edition': 'Product edition', 'org.edition.CLINIC': 'Kiorly Clinic', 'org.edition.NURSE': 'Kiorly Nurse', 'org.edition.note': 'A display label only. Your profession, licence and what you may practise are kept and checked inside Kiorly, never in Kiorex Passport.', 'org.edition.create': 'Edition',
  'org.empty': 'You are not a member of an organisation.', 'org.role': 'Role', 'org.since': 'Member since {date}', 'org.invites': 'Invitations', 'org.invitedAs': '{by} invited you to join {org} as {role}.',
  'org.invitedAsAnon': 'You were invited to join {org} as {role}.', 'org.expires': 'Expires {date}', 'org.accepted': 'You joined {org}.', 'org.joined': 'You joined the organisation.', 'org.declined': 'Invitation declined.',
  'org.token': 'Have an invitation code?', 'org.tokenField': 'Invitation code', 'org.tokenGo': 'Accept invitation', 'org.members': 'Members', 'org.manage': 'Manage members',
  'org.invite': 'Invite someone', 'org.invite.phone': 'Their mobile number', 'org.invite.role': 'Role hint', 'org.invite.send': 'Send invitation', 'org.invite.sent': 'Invitation sent by mock WhatsApp.',
  'org.removeMember': 'Remove', 'org.removeTitle': 'Remove this member?', 'org.removed': 'Member removed.', 'org.leave': 'Leave organisation', 'org.leaveTitle': 'Leave {org}?', 'org.left': 'You left the organisation.',
  'org.roleChanged': 'Role updated.', 'org.create': 'Create an organisation', 'org.create.name': 'Legal name', 'org.create.country': 'Country (2 letters)', 'org.create.submit': 'Create', 'org.created': 'Organisation created.',
  'org.hint.owner': 'Owner: can invite and remove anyone.', 'org.hint.admin': 'Admin: can invite and manage members.', 'org.hint.doctor': 'Doctor', 'org.hint.physiotherapist': 'Physiotherapist', 'org.hint.nurse': 'Nurse', 'org.hint.dispatcher': 'Dispatcher', 'org.hint.assistant': 'Assistant', 'org.hint.front_desk': 'Front desk', 'org.hint.receptionist': 'Receptionist',
  'org.hint.finance': 'Finance', 'org.hint.pharmacist': 'Pharmacist', 'org.hint.lab_technician': 'Lab technician', 'org.hint.staff': 'Staff', 'org.hintNote': 'A role hint does not grant clinical access.',
  'org.sent': 'Sent invitations', 'org.sent.empty': 'No invitations sent yet.', 'org.sent.to': 'To {phone}', 'org.sent.expires': 'Expires {date}', 'org.sent.revoke': 'Revoke', 'org.sent.revokeTitle': 'Revoke this invitation?', 'org.sent.revokeBody': 'The person will no longer be able to use it. You can send a new one later.', 'org.sent.revoked': 'Invitation revoked.',
  'org.sent.status.pending': 'Pending', 'org.sent.status.accepted': 'Accepted', 'org.sent.status.expired': 'Expired', 'org.sent.status.revoked': 'Revoked',
  'org.status.active': 'Active', 'org.status.revoked': 'Ended', 'org.status.merged': 'Merged',

  // privacy
  'prv.title': 'Data and privacy', 'prv.lead': 'Download what Kiorex Passport holds about you, or delete your account.',
  'prv.export': 'Export your data', 'prv.exportLead': 'A JSON file with your identity data. Clinical records are never held by Passport; ask each product for those.', 'prv.exportBtn': 'Download my data',
  'prv.exportWorking': 'Preparing', 'prv.exportReady': 'Your file was downloaded.', 'prv.exportIncludes': 'Included: profile, sessions, passkeys, dependants, organisation memberships, linked accounts.',
  'prv.delete': 'Delete your account', 'prv.deleteLead': 'This is permanent. Read what will happen first.', 'prv.consequences': 'What happens when you delete your account',
  'prv.c1': 'You are signed out everywhere, immediately.', 'prv.c2': 'Your passkeys, authenticator app and linked contacts are deleted.', 'prv.c3': 'Your guardian links end. Your dependants keep their records in the products, but nobody can act for them through you.',
  'prv.c4': 'Your organisation memberships end.', 'prv.c5': 'Open account link requests are cancelled.', 'prv.c6': 'Every Kiorex and Kiorly product is told to remove its link to you. What each product keeps by law is described in its own notice.',
  'prv.c7': 'You cannot undo this. You can create a new account later with the same number, but it will not have your old data.',
  'prv.ack': 'I understand that my account will be deleted permanently.', 'prv.typeWord': 'Type {word} to confirm', 'prv.word': 'DELETE', 'prv.deleteBtn': 'Delete my account permanently',
  'prv.deleteTitle': 'Delete your account now?', 'prv.deleteBody': 'This will sign you out everywhere and cannot be undone.', 'prv.deleting': 'Deleting',

  // apps
  'app2.title': 'Connected apps', 'app2.lead': 'Apps that can sign you in with Kiorex Passport and what they were allowed to see.', 'app2.empty': 'No connected apps.',
  'app2.granted': 'Allowed {date}', 'app2.current': 'This app (Passport)', 'app2.revoke': 'Remove access', 'app2.revokeTitle': 'Remove access for {app}?', 'app2.revokeBody': 'It will be signed out. You can allow it again by signing in to it.',
  'app2.revoked': 'Access removed.', 'app2.scopes': 'It can see',
  'sc.openid': 'That it is you (a private identifier)', 'sc.profile': 'Your name and language', 'sc.phone': 'Your mobile number', 'sc.kx': 'Role hints on your account', 'sc.kx_org': 'Your organisation memberships',
  'sc.offline_access': 'Stay signed in without asking again',

  // step-up
  'su.title': 'Extra verification', 'su.card': 'Confirm it is you', 'su.lead': 'This action needs a fresh two-step check, so we know it is really you.', 'su.totp': 'Authenticator code', 'su.verify': 'Verify', 'su.passkey': 'Use a passkey',
  'su.or': 'or', 'su.done': 'Verified. You can continue.', 'su.noMethod': 'You have no second factor yet. Turn on the authenticator app in Security first.', 'su.setup': 'Go to Security',
  'su.fresh': 'Verification stays valid for {minutes} minutes.', 'su.waiting': 'Waiting for your device',

  // errors
  'err.unknown': 'Something went wrong. Please try again.', 'err.network': 'Could not reach Kiorex Passport. Check your connection.', 'err.401': 'Your session ended. Please sign in again.',
  'err.feature_disabled': 'This feature is temporarily unavailable.', 'err.step_up_required': 'Extra verification is needed.',
  'err.invalid_email': 'Enter a valid e-mail address.', 'err.email_code_resend_too_soon': 'A code was sent a moment ago. Wait a minute before asking for another.', 'err.email_in_use': 'This e-mail address is already verified on another account.', 'err.no_pending_email_verification': 'There is no code waiting. Ask for a new one.', 'err.too_many_attempts': 'Too many wrong codes. Ask for a new code later.', 'err.invalid_code': 'That code is not right.',
  'err.invalid_name': 'Enter a name up to 80 characters.', 'err.invalid_locale': 'Choose Arabic or English.', 'err.invalid_dob': 'Enter a valid date of birth.', 'err.dob_in_future': 'Date of birth cannot be in the future.',
  'err.already_adult': 'This person is already an adult and manages their own Passport.', 'err.invalid_evidence_type': 'Choose an evidence type.', 'err.invalid_evidence_reference': 'Enter a document reference, not a national ID number.',
  'err.evidence_reference_required': 'This evidence type needs a document reference.', 'err.invalid_relationship': 'Choose your relationship.', 'err.guardian_must_be_verified_adult_account': 'Only a verified adult account can be a guardian.',
  'err.too_many_dependants': 'You reached the maximum number of dependants.', 'err.link_not_found': 'We could not find that request.', 'err.no_active_guardian_link': 'You are not an active guardian for this person.',
  'err.invalid_phone': 'Enter a mobile number in international format, for example +201000000001.', 'err.guardian_account_not_found': 'That person does not have a Kiorex Passport yet.', 'err.cannot_invite_self': 'You cannot invite yourself.',
  'err.link_exists': 'That person is already a guardian or has a pending invitation.', 'err.account_not_found': 'No account uses that number.', 'err.cannot_link_to_self': 'That is your own number.', 'err.request_exists': 'There is already an open request for that account.',
  'err.too_many_open_requests': 'You have too many open requests. Cancel one first.', 'err.otp_wrong': 'That code is not correct.', 'err.otp_expired': 'That code expired.', 'err.otp_locked': 'Too many attempts. Try again in a few minutes.',
  'err.otp_invalid': 'Enter the numeric code.', 'err.otp_no_challenge': 'Request a code first.', 'err.phone_rate_limited': 'Too many codes for that number. Try again later.', 'err.ip_rate_limited': 'Too many requests. Try again later.',
  'err.send_failed': 'We could not send the code.', 'err.wrong_state': 'This request already moved on. Refresh the page.', 'err.resolution_required': 'Choose how to resolve every difference that needs a decision.',
  'err.reviewer_must_be_independent': 'You cannot review a request that involves your own account.', 'err.ops_role_required': 'This page is for operations staff.',
  'err.totp_wrong': 'That code is not correct.', 'err.totp_invalid': 'Enter the 6-digit code.', 'err.totp_locked': 'Too many wrong codes. Try again in a few minutes.', 'err.totp_not_enrolled': 'Set up the authenticator app first.',
  'err.totp_required_for_role': 'Your role requires two-step verification.', 'err.already_enrolled': 'The authenticator app is already on.', 'err.passkey_not_found': 'That passkey no longer exists.', 'err.passkey_invalid': 'The passkey could not be verified.',
  'err.invitation_not_found': 'That invitation was not found.', 'err.invitation_used': 'That invitation was already used.', 'err.invitation_expired': 'That invitation expired.', 'err.invitation_revoked': 'That invitation was withdrawn.',
  'err.token_not_found': 'That access token was not found.',
  'err.invitation_not_for_this_account': 'That invitation was sent to a different number.', 'err.invalid_token': 'Enter the invitation code.', 'err.already_member': 'You are already a member.', 'err.insufficient_membership': 'You need to be an owner or admin for that.',
  'err.last_owner': 'An organisation needs at least one owner.', 'err.invalid_edition': 'Choose Kiorly Clinic or Kiorly Nurse.', 'err.invalid_legal_name': 'Enter the legal name (up to 120 characters).', 'err.invalid_country': 'Enter a 2-letter country code, for example EG.', 'err.invalid_role_hint': 'Choose a role.',
  'err.only_owner_can_invite_owner': 'Only an owner can invite an owner.', 'err.only_owner_can_change_owner': 'Only an owner can change an owner.', 'err.only_owner_can_remove_owner': 'Only an owner can remove an owner.',
  'err.cannot_revoke_current_app': 'This is the app you are using. Sign out instead.', 'err.app_not_found': 'That app no longer has access.', 'err.not_found': 'We could not find that.', 'err.membership_not_found': 'That member was not found.', 'err.not_enrolled': 'The authenticator app is not on.', 'err.invalid_product_ref': 'That product reference is not allowed.', 'err.org_not_found': 'We could not find that organisation.',
} as const;

type Key = keyof typeof en;

const ar: Record<Key, string> = {
  'app.name': 'كيوريكس باسبورت', 'app.skip': 'انتقل إلى المحتوى', 'app.loading': 'جارٍ التحميل', 'app.retry': 'حاول مرة أخرى', 'app.close': 'إغلاق',
  'app.cancel': 'إلغاء', 'app.confirm': 'تأكيد', 'app.save': 'حفظ', 'app.remove': 'إزالة', 'app.add': 'إضافة', 'app.accept': 'قبول', 'app.decline': 'رفض',
  'app.back': 'رجوع', 'app.copy': 'نسخ', 'app.copied': 'تم النسخ', 'app.none': 'لا شيء', 'app.yes': 'نعم', 'app.no': 'لا', 'app.you': 'هذا الجهاز',
  'app.devNote': 'مزوّد هوية للتطوير. الرسائل تجريبية (صندوق التطوير).', 'app.mainNav': 'أقسام الحساب', 'app.language': 'اللغة', 'app.theme': 'المظهر',
  'theme.system': 'حسب النظام', 'theme.light': 'فاتح', 'theme.dark': 'داكن', 'app.signOut': 'تسجيل الخروج', 'app.openKiorex': 'افتح كيوريكس', 'app.notFound': 'هذه الصفحة غير موجودة.',
  'nav.home': 'الحساب', 'nav.security': 'الأمان', 'nav.family': 'العائلة', 'nav.linked': 'الحسابات المرتبطة', 'nav.orgs': 'المؤسسات', 'nav.privacy': 'البيانات والخصوصية',
  'nav.apps': 'التطبيقات المتصلة', 'nav.ops': 'مراجعة الربط',
  'draft.badge': 'صياغة مبدئية بانتظار المراجعة القانونية',
  'draft.consent': 'صياغة مبدئية عمّا يمكن للتطبيقات المتصلة رؤيته. النص النهائي يحتاج مراجعة قانونية.',
  'draft.deletion': 'صياغة مبدئية عن الحذف والاحتفاظ بالبيانات. النص النهائي يحتاج مراجعة قانونية.',
  'draft.guardian': 'صياغة مبدئية عن إثبات الولاية والمسؤولية. النص النهائي يحتاج مراجعة قانونية.',
  'draft.majority': 'صياغة مبدئية عن سن الرشد. السن والإجراء لكل سوق يحتاجان تأكيدًا قانونيًا.',
  'draft.merge': 'صياغة مبدئية عن دمج الحسابات. سياسة المراجعة تحتاج موافقة العمليات والقانونية.',
  'draft.export': 'صياغة مبدئية عن تصدير بياناتك. النص النهائي يحتاج مراجعة قانونية.',

  'signin.title': 'إدارة كيوريكس باسبورت الخاص بك', 'signin.lead': 'حساب واحد لكيوريكس وكيورلي. سجّل الدخول برقم هاتفك أو بمفتاح مرور أو برمز من تطبيق المصادقة.',
  'signin.cta': 'تسجيل الدخول', 'signin.working': 'جارٍ تسجيل دخولك', 'signin.failed': 'تعذّر إكمال تسجيل الدخول. حاول مرة أخرى.', 'signin.expired': 'انتهت جلستك. سجّل الدخول مرة أخرى.',
  'signin.deleted.title': 'تم حذف حسابك', 'signin.deleted.body': 'تمت إزالة كيوريكس باسبورت وطرق الدخول الخاصة بك. أُبلغت المنتجات بحذف ارتباطها بك.',

  'home.title': 'حسابك', 'home.hello': 'مرحبًا، {name}', 'home.helloAnon': 'أهلًا بك',
  'home.profile': 'الملف الشخصي', 'home.name': 'الاسم', 'home.nameHint': 'يظهر للأطباء والعيادات التي تحجز لديهم.', 'home.language': 'اللغة', 'home.langAr': 'العربية', 'home.langEn': 'English',
  'home.saved': 'تم الحفظ.', 'home.phone': 'رقم الهاتف المحمول', 'home.verified': 'موثّق', 'home.unverified': 'غير موثّق',
  'home.phoneHint': 'رقمك هو وسيلة دخولك. لدمج رقم ثانٍ استخدم «الحسابات المرتبطة».', 'home.roles': 'الأدوار',
  'home.rolesHint': 'إشارات للأدوار فقط. كل منتج يحدد ما يُسمح لك به.', 'home.attention': 'يحتاج انتباهك', 'home.allClear': 'لا شيء يحتاج انتباهك.',
  'home.attn.guardian': '{n} دعوة عائلية بانتظارك', 'home.attn.org': '{n} دعوة مؤسسة بانتظارك', 'home.attn.review': 'طلبات ربط بانتظار المراجعة',
  'home.security': 'الأمان بنظرة', 'home.sec.passkeys': 'مفاتيح المرور', 'home.sec.totp': 'تطبيق المصادقة', 'home.sec.sessions': 'الجلسات النشطة',
  'home.sec.on': 'مفعّل', 'home.sec.off': 'غير مفعّل', 'home.sec.required': 'مطلوب لدورك', 'home.manage': 'إدارة', 'home.shortcuts': 'إدارة',
  'role.patient': 'مريض', 'role.ops_admin': 'مسؤول العمليات', 'role.super_admin': 'مسؤول عام',

  'sec.title': 'الأمان',
  'pk.title': 'مفاتيح المرور', 'pk.lead': 'سجّل الدخول ببصمتك أو وجهك أو رمز جهازك. مفاتيح المرور لا تغادر جهازك ولا يمكن سرقتها بالتصيّد.', 'pk.empty': 'لا توجد مفاتيح مرور بعد.',
  'pk.add': 'إضافة مفتاح مرور', 'pk.adding': 'بانتظار جهازك', 'pk.added': 'تمت إضافة مفتاح المرور.', 'pk.removed': 'تمت إزالة مفتاح المرور.', 'pk.synced': 'مفتاح مرور متزامن', 'pk.device': 'مفتاح مرور مرتبط بالجهاز',
  'pk.createdOn': 'أُضيف {date}', 'pk.removeTitle': 'إزالة مفتاح المرور هذا؟', 'pk.removeBody': 'لن تتمكن من الدخول به بعد الآن. يمكنك استخدام الرمز المرسل إلى هاتفك.',
  'pk.unsupported': 'هذا المتصفح أو الجهاز لا يدعم مفاتيح المرور.', 'pk.disabled': 'مفاتيح المرور غير متاحة مؤقتًا.', 'pk.cancelled': 'لم تتم إضافة مفتاح المرور.',
  'totp.title': 'تطبيق المصادقة (التحقق بخطوتين)', 'totp.lead': 'عامل ثانٍ يضيف رمزًا من 6 أرقام من تطبيق المصادقة.',
  'totp.on': 'تطبيق المصادقة مفعّل.', 'totp.off': 'تطبيق المصادقة غير مفعّل.', 'totp.required': 'دورك يتطلب التحقق بخطوتين، لذلك لا يمكن إيقافه.',
  'totp.enrol': 'إعداد', 'totp.key': 'مفتاح الإعداد', 'totp.uri': 'رابط الإعداد', 'totp.enrolHint': 'أضف هذا المفتاح إلى تطبيق المصادقة ثم أدخل الرمز الظاهر.',
  'totp.code': 'رمز المصادقة', 'totp.confirm': 'تأكيد وتفعيل', 'totp.enabled': 'تم تفعيل تطبيق المصادقة.', 'totp.disable': 'إيقاف',
  'totp.disableTitle': 'إيقاف تطبيق المصادقة؟', 'totp.disableBody': 'سنطلب منك رمزًا جديدًا أولًا. سيصبح حسابك أقل حماية.', 'totp.disabled': 'تم إيقاف تطبيق المصادقة.',
  'email.title': 'عنوان البريد الإلكتروني (اختياري)', 'email.lead': 'أضف عنوان بريد إلكتروني وأكّده برمز نرسله إليك. لا يُعتمد العنوان بمجرد كتابته.',
  'email.waiting': 'أُرسل رمز إلى عنوانك قبل لحظات. أدخله أدناه، أو استخدم عنوانًا آخر للحصول على رمز جديد.', 'email.none': 'لا يوجد بريد إلكتروني على هذا الحساب.', 'email.address': 'عنوان البريد الإلكتروني', 'email.send': 'إرسال الرمز', 'email.sent': 'أرسلنا رمزًا من 6 أرقام إلى {email}. تنتهي صلاحيته خلال 10 دقائق.',
  'email.code': 'رمز البريد الإلكتروني', 'email.verify': 'تأكيد البريد', 'email.verified': 'تم تأكيد البريد الإلكتروني.', 'email.resend': 'إرسال رمز جديد', 'email.change': 'استخدام عنوان آخر', 'email.codeResent': 'أُرسل رمز جديد.',
  'email.statusVerified': 'مؤكَّد', 'email.statusPending': 'لم يُؤكَّد بعد', 'email.current': 'العنوان الحالي', 'email.remove': 'إزالة البريد',
  'email.removeTitle': 'إزالة عنوان البريد هذا؟', 'email.removeBody': 'لن يظل مرتبطًا بحسابك. يمكنك إضافته مرة أخرى لاحقًا.', 'email.removed': 'تمت إزالة البريد الإلكتروني.',
  'ev.email.verification.sent': 'إرسال رمز البريد', 'ev.email.verification.failed': 'رفض رمز البريد', 'ev.email.verified': 'تأكيد البريد الإلكتروني', 'ev.email.removed': 'إزالة البريد الإلكتروني',
  'ses.title': 'الجلسات النشطة', 'ses.lead': 'الأجهزة والتطبيقات التي سجّلت الدخول منها.', 'ses.current': 'هذه الجلسة', 'ses.started': 'تسجيل الدخول {date}', 'ses.lastSeen': 'آخر نشاط {date}',
  'ses.apps': 'التطبيقات: {apps}', 'ses.revoke': 'تسجيل الخروج', 'ses.revokeTitle': 'تسجيل خروج هذه الجلسة؟', 'ses.revokeBody': 'سيُسجَّل خروج الجهاز من كل تطبيقات كيوريكس فورًا.',
  'ses.revokeOthers': 'تسجيل الخروج من كل الجلسات الأخرى', 'ses.revoked': 'تم تسجيل خروج الجلسة.', 'ses.revokedOthers': 'تم تسجيل الخروج من كل الجلسات الأخرى.', 'ses.empty': 'لا توجد جلسات.', 'ses.unknownDevice': 'جهاز غير معروف',
  'ev.title': 'نشاط الدخول الأخير', 'ev.lead': 'أحداث الأمان على حسابك. إن لم تتعرّف على شيء فسجّل الخروج من الجلسات الأخرى.', 'ev.empty': 'لا يوجد نشاط بعد.',
  'ev.login.success': 'تسجيل دخول', 'ev.passkey.login': 'تسجيل دخول بمفتاح مرور', 'ev.passkey.login.failed': 'فشل الدخول بمفتاح المرور', 'ev.passkey.registered': 'إضافة مفتاح مرور', 'ev.passkey.removed': 'إزالة مفتاح مرور',
  'ev.totp.enrolled': 'تفعيل تطبيق المصادقة', 'ev.totp.disabled': 'إيقاف تطبيق المصادقة', 'ev.totp.verified': 'قبول رمز المصادقة', 'ev.totp.failed': 'رفض رمز المصادقة',
  'ev.step_up.success': 'نجح التحقق الإضافي', 'ev.step_up.failed': 'فشل التحقق الإضافي', 'ev.session.revoked': 'تسجيل خروج جلسة', 'ev.federation.login': 'تسجيل دخول بحساب مزوّد',
  'ev.account.link.requested': 'طلب ربط حساب', 'ev.account.link.verified': 'توثيق طلب ربط', 'ev.account.link.merged': 'دمج حسابات', 'ev.account.link.reversed': 'التراجع عن دمج حسابات',
  'ev.guardian.act_as': 'تصرّف نيابة عن أحد أفراد العائلة', 'ev.app.access.revoked': 'إزالة صلاحية تطبيق', 'ev.account.profile.updated': 'تحديث الملف الشخصي', 'ev.via': 'عبر {client}',
  'client.kiorex-web': 'موقع كيوريكس للمرضى', 'client.kiorex-ops': 'لوحة عمليات كيوريكس', 'client.kiorex-mobile': 'تطبيق كيوريكس للجوال', 'client.kiorly-clinic': 'كيورلي كلينك', 'client.kiorex-passport-web': 'كيوريكس باسبورت',

  'fam.title': 'العائلة والأوصياء', 'fam.lead': 'أدر الأطفال وغيرهم ممن أنت مسؤول عنهم، ومن يمكنه التصرف نيابة عنهم.',
  'fam.invites': 'دعوات للانضمام كوصي', 'fam.invitedFor': 'دُعيت للمشاركة في رعاية {name}.', 'fam.accepted': 'أصبحت وصيًا.', 'fam.declined': 'تم رفض الدعوة.',
  'fam.dependants': 'المُعالون', 'fam.empty': 'لم تضف أي مُعال بعد.', 'fam.age': 'العمر {age}', 'fam.born': 'تاريخ الميلاد {date}', 'fam.relationship': 'صلة القرابة', 'fam.evidence': 'الإثبات',
  'fam.expires': 'تنتهي صلاحيتك في {date}', 'fam.majority.soon': 'يبلغ {age} في {date}، أي بعد {days} يومًا. تنتهي صلاحيتك حينها ويدير حسابه بنفسه.',
  'fam.majority.later': 'تنتهي صلاحيتك كوصي تلقائيًا في {date} حين يبلغ {name} سن الرشد ({age}).',
  'fam.add': 'إضافة مُعال', 'fam.add.name': 'الاسم الكامل', 'fam.add.dob': 'تاريخ الميلاد', 'fam.add.rel': 'صلة قرابتك به', 'fam.add.evidence': 'نوع الإثبات', 'fam.add.ref': 'مرجع المستند',
  'fam.add.refHint': 'مرجع مجرّد فقط (مثل رقم شهادة). لا تُدخل رقمًا قوميًا أبدًا.', 'fam.add.submit': 'إضافة المُعال', 'fam.add.done': 'تمت إضافة المُعال.',
  'fam.add.nationalId': 'يبدو هذا كرقم قومي. أدخل مرجع مستند بدلًا منه.', 'fam.add.dobFuture': 'لا يمكن أن يكون تاريخ الميلاد في المستقبل.',
  'fam.add.adult': 'هذا الشخص بالغ بالفعل ويدير كيوريكس باسبورت الخاص به.', 'fam.add.limit': 'وصلت إلى الحد الأقصى لعدد المُعالين.',
  'rel.parent': 'أحد الوالدين', 'rel.legal_guardian': 'وصي قانوني', 'rel.grandparent': 'جد أو جدة', 'rel.other_relative': 'قريب آخر',
  'evi.self_declared': 'إقرار ذاتي', 'evi.birth_certificate_ref': 'مرجع شهادة ميلاد', 'evi.court_order_ref': 'مرجع حكم محكمة', 'evi.provider_attested': 'إفادة من مقدّم خدمة',
  'fam.actAs': 'التصرف نيابة عن {name}', 'fam.actAs.title': 'التصرف نيابة عن {name}', 'fam.actAs.lead': 'اختر ما يُسمح لك به. الصلاحية قصيرة المدة وتظهر باسمك كوصي في كل مكان.',
  'fam.actAs.start': 'المتابعة كوصي', 'fam.actAs.ready': 'جاهز. يمكنك التصرف نيابة عن {name} لمدة {minutes} دقيقة.', 'fam.actAs.scopes': 'الإجراءات المسموحة', 'fam.actAs.token': 'رمز للمطورين (لا يظهر للمرضى)',
  'fam.actAs.openKiorex': 'افتح كيوريكس باسم {name}', 'fam.actAs.expires': 'تنتهي {date}', 'fam.actAs.noScope': 'اختر إجراءً واحدًا على الأقل.',
  'scope.dependant:profile': 'عرض ملفه الشخصي وتحديثه', 'scope.dependant:booking': 'حجز المواعيد وإدارتها', 'scope.dependant:consent': 'منح الموافقات وسحبها نيابة عنه',
  'fam.co': 'دعوة وصي آخر', 'fam.co.lead': 'يحتاج الشخص الآخر إلى كيوريكس باسبورت، ويجب أن يقبل قبل أن يتصرف.', 'fam.co.phone': 'رقم هاتفه المحمول', 'fam.co.sent': 'تم إرسال الدعوة.',
  'fam.revoke': 'إزالة صلاحيتي', 'fam.revokeTitle': 'إزالة صلاحيتك كوصي على {name}؟', 'fam.revokeBody': 'لن تتمكن من التصرف نيابة عنه بعد الآن. لا يمكن التراجع من هذه الصفحة.', 'fam.revoked': 'تمت إزالة صلاحية الوصاية.',
  'fam.history': 'الروابط المنتهية والمعلّقة', 'fam.status.active': 'نشط', 'fam.status.pending': 'بانتظار القبول', 'fam.status.revoked': 'منتهٍ', 'fam.status.expired': 'انتهى عند سن الرشد',
  'fam.reason.age_of_majority': 'انتهى تلقائيًا عند سن الرشد', 'fam.reason.revoked_by_guardian': 'أزاله الوصي', 'fam.reason.declined_by_invitee': 'تم الرفض', 'fam.reason.guardian_deleted': 'حُذف حساب الوصي',

  'lnk.title': 'الحسابات المرتبطة', 'lnk.lead': 'لديك كيوريكس باسبورت آخر (مثل رقم قديم)؟ اطلب ربطه. يراجع أحد فريقنا كل طلب، ولا تُدمج الحسابات تلقائيًا أبدًا.',
  'lnk.request': 'ربط حساب آخر', 'lnk.phone': 'رقم هاتف الحساب الآخر', 'lnk.send': 'إرسال رمز التحقق', 'lnk.sentTo': 'أرسلنا رمزًا إلى الرقم الآخر. أدخله لإثبات أنه لك.',
  'lnk.code': 'رمز التحقق', 'lnk.verify': 'تحقق', 'lnk.verified': 'تم التحقق. طلبك بانتظار المراجعة.', 'lnk.requests': 'طلباتك', 'lnk.empty': 'لا توجد طلبات ربط.',
  'lnk.cancel': 'إلغاء الطلب', 'lnk.cancelled': 'تم إلغاء الطلب.', 'lnk.requestedOn': 'طُلب {date}', 'lnk.conflicts': 'اختلافات وُجدت', 'lnk.noConflicts': 'لا توجد اختلافات.',
  'lnk.status.pending_verification': 'بانتظار الرمز', 'lnk.status.pending_review': 'بانتظار المراجعة', 'lnk.status.merged': 'تم الربط', 'lnk.status.rejected': 'مرفوض',
  'lnk.status.reversed': 'تم التراجع', 'lnk.status.cancelled': 'ملغى', 'lnk.resume': 'أدخل الرمز', 'lnk.devInbox': 'للتطوير فقط: اقرأ الرمز في صندوق التطوير',
  'cf.name_mismatch': 'الاسمان مختلفان', 'cf.locale_mismatch': 'اللغتان مختلفتان', 'cf.privileged_role_on_secondary': 'للحساب الآخر دور بصلاحيات خاصة. لا يُنقل أبدًا.',
  'cf.privileged_role_on_primary': 'للحساب الرئيسي دور بصلاحيات خاصة', 'cf.guardian_links_on_both': 'في كلا الحسابين روابط وصاية', 'cf.membership_role_conflict': 'دوران مختلفان في المؤسسة نفسها',
  'cf.totp_on_both': 'كلا الحسابين يستخدم تطبيق مصادقة', 'cf.blocking': 'يحتاج قرارًا', 'cf.info': 'للعلم',
  'fed.title': 'حسابات المزوّدين', 'fed.lead': 'حسابات من مستشفاك أو جهة عملك تستخدمها لتسجيل الدخول.', 'fed.empty': 'لا توجد حسابات مزوّدين مرتبطة.', 'fed.unlink': 'إلغاء الربط', 'fed.unlinked': 'تم إلغاء ربط حساب المزوّد.',

  'ops.title': 'مراجعة ربط الحسابات', 'ops.lead': 'راجع طلبات الربط الموثّقة. الموافقة والتراجع يحتاجان تحققًا جديدًا بخطوتين.', 'ops.denied': 'هذه الصفحة لفريق العمليات.',
  'ops.empty': 'لا شيء في هذه القائمة.', 'ops.tab.pending_review': 'للمراجعة', 'ops.tab.merged': 'تم الدمج', 'ops.tab.rejected': 'مرفوض', 'ops.tab.reversed': 'تم التراجع',
  'ops.approve': 'الموافقة على الدمج', 'ops.reject': 'رفض', 'ops.reverse': 'التراجع عن الدمج', 'ops.note': 'ملاحظة للسجل (اختياري)', 'ops.resolution': 'قرار مطلوب',
  'ops.nameKeep': 'أي اسم يحتفظ به الحساب؟', 'ops.namePrimary': 'الحساب الرئيسي: {name}', 'ops.nameSecondary': 'الحساب الآخر: {name}', 'ops.roleKeep': 'الدور في المؤسسة {org}',
  'ops.rolePrimary': 'الرئيسي: {role}', 'ops.roleSecondary': 'الآخر: {role}', 'ops.approved': 'تمت الموافقة على الدمج.', 'ops.rejected': 'تم رفض الطلب.', 'ops.reversed': 'تم التراجع عن الدمج.',
  'ops.confirmApprove': 'الموافقة على هذا الدمج؟', 'ops.confirmApproveBody': 'تنتقل بيانات الهوية فقط. تدمج المنتجات سجلات المرضى بشكل منفصل. يمكنك التراجع لاحقًا.',
  'ops.confirmReverse': 'التراجع عن هذا الدمج؟', 'ops.confirmReverseBody': 'يُستعاد الحساب الآخر كما كان قبل الدمج.', 'ops.confirmReject': 'رفض هذا الطلب؟',
  'ops.mainAccount': 'الحساب الرئيسي', 'ops.otherAccount': 'الحساب الآخر', 'ops.reviewedBy': 'روجع {date}',

  'org.title': 'المؤسسات', 'org.lead': 'العيادات ومراكز وشركات التمريض والصيدليات والمعامل التي تنتمي إليها. يمكنك الانتماء لأكثر من مؤسسة، مثل ممارستك التمريضية الخاصة ووكالة تمريض. الدور هنا إشارة فقط؛ كل منتج يحدد ما يمكنك فعله.',
  'org.edition': 'إصدار المنتج', 'org.edition.CLINIC': 'كيورلي كلينك', 'org.edition.NURSE': 'كيورلي نيرس', 'org.edition.note': 'تسمية للعرض فقط. مهنتك وترخيصك وما يحق لك ممارسته تُحفظ وتُراجع داخل كيورلي، وليس في جواز كيوريكس.', 'org.edition.create': 'الإصدار',
  'org.empty': 'لست عضوًا في أي مؤسسة.', 'org.role': 'الدور', 'org.since': 'عضو منذ {date}', 'org.invites': 'الدعوات', 'org.invitedAs': 'دعاك {by} للانضمام إلى {org} بدور {role}.',
  'org.invitedAsAnon': 'دُعيت للانضمام إلى {org} بدور {role}.', 'org.expires': 'تنتهي {date}', 'org.accepted': 'انضممت إلى {org}.', 'org.joined': 'انضممت إلى المؤسسة.', 'org.declined': 'تم رفض الدعوة.',
  'org.token': 'لديك رمز دعوة؟', 'org.tokenField': 'رمز الدعوة', 'org.tokenGo': 'قبول الدعوة', 'org.members': 'الأعضاء', 'org.manage': 'إدارة الأعضاء',
  'org.invite': 'دعوة شخص', 'org.invite.phone': 'رقم هاتفه المحمول', 'org.invite.role': 'إشارة الدور', 'org.invite.send': 'إرسال الدعوة', 'org.invite.sent': 'تم إرسال الدعوة عبر واتساب التجريبي.',
  'org.removeMember': 'إزالة', 'org.removeTitle': 'إزالة هذا العضو؟', 'org.removed': 'تمت إزالة العضو.', 'org.leave': 'مغادرة المؤسسة', 'org.leaveTitle': 'مغادرة {org}؟', 'org.left': 'غادرت المؤسسة.',
  'org.roleChanged': 'تم تحديث الدور.', 'org.create': 'إنشاء مؤسسة', 'org.create.name': 'الاسم القانوني', 'org.create.country': 'الدولة (حرفان)', 'org.create.submit': 'إنشاء', 'org.created': 'تم إنشاء المؤسسة.',
  'org.hint.owner': 'مالك: يمكنه دعوة أي شخص وإزالته.', 'org.hint.admin': 'مدير: يمكنه دعوة الأعضاء وإدارتهم.', 'org.hint.doctor': 'طبيب', 'org.hint.physiotherapist': 'أخصائي علاج طبيعي', 'org.hint.nurse': 'ممرض', 'org.hint.dispatcher': 'منسّق زيارات', 'org.hint.assistant': 'مساعد', 'org.hint.front_desk': 'مكتب الاستقبال', 'org.hint.receptionist': 'موظف استقبال',
  'org.hint.finance': 'مالية', 'org.hint.pharmacist': 'صيدلي', 'org.hint.lab_technician': 'فني معمل', 'org.hint.staff': 'موظف', 'org.hintNote': 'إشارة الدور لا تمنح صلاحية الاطلاع على البيانات الطبية.',
  'org.sent': 'الدعوات المرسلة', 'org.sent.empty': 'لم تُرسل أي دعوات بعد.', 'org.sent.to': 'إلى {phone}', 'org.sent.expires': 'تنتهي {date}', 'org.sent.revoke': 'سحب الدعوة', 'org.sent.revokeTitle': 'سحب هذه الدعوة؟', 'org.sent.revokeBody': 'لن يتمكن الشخص من استخدامها بعد الآن. يمكنك إرسال دعوة جديدة لاحقًا.', 'org.sent.revoked': 'تم سحب الدعوة.',
  'org.sent.status.pending': 'قيد الانتظار', 'org.sent.status.accepted': 'مقبولة', 'org.sent.status.expired': 'منتهية', 'org.sent.status.revoked': 'مسحوبة',
  'org.status.active': 'نشط', 'org.status.revoked': 'منتهٍ', 'org.status.merged': 'مدمج',

  'prv.title': 'البيانات والخصوصية', 'prv.lead': 'نزّل ما يحتفظ به كيوريكس باسبورت عنك، أو احذف حسابك.',
  'prv.export': 'تصدير بياناتك', 'prv.exportLead': 'ملف JSON ببيانات هويتك. لا يحتفظ باسبورت بالسجلات الطبية أبدًا؛ اطلبها من كل منتج.', 'prv.exportBtn': 'تنزيل بياناتي',
  'prv.exportWorking': 'جارٍ التجهيز', 'prv.exportReady': 'تم تنزيل ملفك.', 'prv.exportIncludes': 'يشمل: الملف الشخصي والجلسات ومفاتيح المرور والمُعالين وعضويات المؤسسات والحسابات المرتبطة.',
  'prv.delete': 'حذف حسابك', 'prv.deleteLead': 'هذا الإجراء نهائي. اقرأ ما سيحدث أولًا.', 'prv.consequences': 'ماذا يحدث عند حذف حسابك',
  'prv.c1': 'يُسجَّل خروجك من كل مكان فورًا.', 'prv.c2': 'تُحذف مفاتيح المرور وتطبيق المصادقة وجهات الاتصال المرتبطة.', 'prv.c3': 'تنتهي روابط الوصاية. يحتفظ المُعالون بسجلاتهم في المنتجات لكن لا يستطيع أحد التصرف نيابة عنهم عبرك.',
  'prv.c4': 'تنتهي عضوياتك في المؤسسات.', 'prv.c5': 'تُلغى طلبات ربط الحسابات المفتوحة.', 'prv.c6': 'يُبلَّغ كل منتج من كيوريكس وكيورلي بإزالة ارتباطه بك. ما يحتفظ به كل منتج بحكم القانون موضّح في إشعاره الخاص.',
  'prv.c7': 'لا يمكنك التراجع. يمكنك إنشاء حساب جديد لاحقًا بالرقم نفسه لكنه لن يحتوي بياناتك القديمة.',
  'prv.ack': 'أفهم أن حسابي سيُحذف نهائيًا.', 'prv.typeWord': 'اكتب {word} للتأكيد', 'prv.word': 'حذف', 'prv.deleteBtn': 'حذف حسابي نهائيًا',
  'prv.deleteTitle': 'حذف حسابك الآن؟', 'prv.deleteBody': 'سيُسجَّل خروجك من كل مكان ولا يمكن التراجع.', 'prv.deleting': 'جارٍ الحذف',

  'app2.title': 'التطبيقات المتصلة', 'app2.lead': 'التطبيقات التي يمكنها تسجيل دخولك عبر كيوريكس باسبورت وما سُمح لها برؤيته.', 'app2.empty': 'لا توجد تطبيقات متصلة.',
  'app2.granted': 'سُمح لها {date}', 'app2.current': 'هذا التطبيق (باسبورت)', 'app2.revoke': 'إزالة الصلاحية', 'app2.revokeTitle': 'إزالة صلاحية {app}؟', 'app2.revokeBody': 'سيُسجَّل خروجه. يمكنك السماح له مجددًا بتسجيل الدخول إليه.',
  'app2.revoked': 'تمت إزالة الصلاحية.', 'app2.scopes': 'يمكنه رؤية',
  'sc.openid': 'أنك أنت (معرّف خاص)', 'sc.profile': 'اسمك ولغتك', 'sc.phone': 'رقم هاتفك المحمول', 'sc.kx': 'إشارات الأدوار على حسابك', 'sc.kx_org': 'عضويات مؤسساتك',
  'sc.offline_access': 'البقاء مسجّلًا دون سؤالك مجددًا',

  'su.title': 'تحقق إضافي', 'su.card': 'تأكيد هويتك', 'su.lead': 'يحتاج هذا الإجراء إلى تحقق جديد بخطوتين لنتأكد أنك أنت.', 'su.totp': 'رمز المصادقة', 'su.verify': 'تحقق', 'su.passkey': 'استخدم مفتاح مرور',
  'su.or': 'أو', 'su.done': 'تم التحقق. يمكنك المتابعة.', 'su.noMethod': 'ليس لديك عامل ثانٍ بعد. فعّل تطبيق المصادقة من «الأمان» أولًا.', 'su.setup': 'اذهب إلى الأمان',
  'su.fresh': 'يبقى التحقق صالحًا لمدة {minutes} دقائق.', 'su.waiting': 'بانتظار جهازك',

  'err.unknown': 'حدث خطأ ما. حاول مرة أخرى.', 'err.network': 'تعذّر الاتصال بكيوريكس باسبورت. تحقق من اتصالك.', 'err.401': 'انتهت جلستك. سجّل الدخول مرة أخرى.',
  'err.feature_disabled': 'هذه الميزة غير متاحة مؤقتًا.', 'err.step_up_required': 'مطلوب تحقق إضافي.',
  'err.invalid_email': 'أدخل عنوان بريد إلكتروني صحيحًا.', 'err.email_code_resend_too_soon': 'أُرسل رمز قبل لحظات. انتظر دقيقة قبل طلب رمز آخر.', 'err.email_in_use': 'عنوان البريد هذا موثّق بالفعل على حساب آخر.', 'err.no_pending_email_verification': 'لا يوجد رمز بانتظارك. اطلب رمزًا جديدًا.', 'err.too_many_attempts': 'محاولات خاطئة كثيرة. اطلب رمزًا جديدًا لاحقًا.', 'err.invalid_code': 'هذا الرمز غير صحيح.',
  'err.invalid_name': 'أدخل اسمًا لا يزيد عن 80 حرفًا.', 'err.invalid_locale': 'اختر العربية أو الإنجليزية.', 'err.invalid_dob': 'أدخل تاريخ ميلاد صحيحًا.', 'err.dob_in_future': 'لا يمكن أن يكون تاريخ الميلاد في المستقبل.',
  'err.already_adult': 'هذا الشخص بالغ بالفعل ويدير كيوريكس باسبورت الخاص به.', 'err.invalid_evidence_type': 'اختر نوع الإثبات.', 'err.invalid_evidence_reference': 'أدخل مرجع مستند وليس رقمًا قوميًا.',
  'err.evidence_reference_required': 'نوع الإثبات هذا يحتاج مرجع مستند.', 'err.invalid_relationship': 'اختر صلة القرابة.', 'err.guardian_must_be_verified_adult_account': 'يمكن لحساب بالغ موثّق فقط أن يكون وصيًا.',
  'err.too_many_dependants': 'وصلت إلى الحد الأقصى لعدد المُعالين.', 'err.link_not_found': 'لم نجد هذا الطلب.', 'err.no_active_guardian_link': 'لست وصيًا نشطًا على هذا الشخص.',
  'err.invalid_phone': 'أدخل رقمًا بالصيغة الدولية، مثال: ‎+201000000001.', 'err.guardian_account_not_found': 'هذا الشخص ليس لديه كيوريكس باسبورت بعد.', 'err.cannot_invite_self': 'لا يمكنك دعوة نفسك.',
  'err.link_exists': 'هذا الشخص وصي بالفعل أو لديه دعوة معلّقة.', 'err.account_not_found': 'لا يوجد حساب بهذا الرقم.', 'err.cannot_link_to_self': 'هذا رقمك أنت.', 'err.request_exists': 'يوجد طلب مفتوح لهذا الحساب بالفعل.',
  'err.too_many_open_requests': 'لديك طلبات مفتوحة كثيرة. ألغِ أحدها أولًا.', 'err.otp_wrong': 'الرمز غير صحيح.', 'err.otp_expired': 'انتهت صلاحية الرمز.', 'err.otp_locked': 'محاولات كثيرة. حاول بعد دقائق.',
  'err.otp_invalid': 'أدخل الرمز الرقمي.', 'err.otp_no_challenge': 'اطلب رمزًا أولًا.', 'err.phone_rate_limited': 'رموز كثيرة لهذا الرقم. حاول لاحقًا.', 'err.ip_rate_limited': 'طلبات كثيرة. حاول لاحقًا.',
  'err.send_failed': 'تعذّر إرسال الرمز.', 'err.wrong_state': 'تغيّرت حالة هذا الطلب. حدّث الصفحة.', 'err.resolution_required': 'اختر طريقة حل كل اختلاف يحتاج قرارًا.',
  'err.reviewer_must_be_independent': 'لا يمكنك مراجعة طلب يخص حسابك.', 'err.ops_role_required': 'هذه الصفحة لفريق العمليات.',
  'err.totp_wrong': 'الرمز غير صحيح.', 'err.totp_invalid': 'أدخل الرمز المكوّن من 6 أرقام.', 'err.totp_locked': 'رموز خاطئة كثيرة. حاول بعد دقائق.', 'err.totp_not_enrolled': 'فعّل تطبيق المصادقة أولًا.',
  'err.totp_required_for_role': 'دورك يتطلب التحقق بخطوتين.', 'err.already_enrolled': 'تطبيق المصادقة مفعّل بالفعل.', 'err.passkey_not_found': 'مفتاح المرور هذا لم يعد موجودًا.', 'err.passkey_invalid': 'تعذّر التحقق من مفتاح المرور.',
  'err.token_not_found': 'لم نجد رمز الوصول هذا.',
  'err.invitation_not_found': 'لم نجد هذه الدعوة.', 'err.invitation_used': 'استُخدمت هذه الدعوة بالفعل.', 'err.invitation_expired': 'انتهت صلاحية هذه الدعوة.', 'err.invitation_revoked': 'سُحبت هذه الدعوة.',
  'err.invitation_not_for_this_account': 'أُرسلت هذه الدعوة إلى رقم آخر.', 'err.invalid_token': 'أدخل رمز الدعوة.', 'err.already_member': 'أنت عضو بالفعل.', 'err.insufficient_membership': 'يجب أن تكون مالكًا أو مديرًا لفعل ذلك.',
  'err.last_owner': 'تحتاج المؤسسة إلى مالك واحد على الأقل.', 'err.invalid_edition': 'اختر كيورلي كلينك أو كيورلي نيرس.', 'err.invalid_legal_name': 'أدخل الاسم القانوني (حتى 120 حرفًا).', 'err.invalid_country': 'أدخل رمز دولة من حرفين، مثال: EG.', 'err.invalid_role_hint': 'اختر دورًا.',
  'err.only_owner_can_invite_owner': 'المالك وحده يمكنه دعوة مالك.', 'err.only_owner_can_change_owner': 'المالك وحده يمكنه تغيير مالك.', 'err.only_owner_can_remove_owner': 'المالك وحده يمكنه إزالة مالك.',
  'err.cannot_revoke_current_app': 'هذا هو التطبيق الذي تستخدمه. سجّل الخروج بدلًا من ذلك.', 'err.app_not_found': 'هذا التطبيق لم تعد له صلاحية.', 'err.not_found': 'لم نجد ما طلبته.', 'err.membership_not_found': 'لم نجد هذا العضو.', 'err.not_enrolled': 'تطبيق المصادقة غير مفعّل.', 'err.invalid_product_ref': 'مرجع المنتج هذا غير مسموح.', 'err.org_not_found': 'لم نجد هذه المؤسسة.',
};

export const clientName = (lang: Lang, id: string): string => { const k = `client.${id}`; const v = (DICTS[lang] as Record<string, string>)[k]; return v ?? id; };

export const DICTS = { en, ar } as const;
export type TKey = Key;
export type Vars = Record<string, string | number>;

export function translate(lang: Lang, key: string, vars?: Vars): string {
  const d = DICTS[lang] as Record<string, string>;
  let s = d[key] ?? (DICTS.en as Record<string, string>)[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Maps an API error code (HTTP body `error`) to a localized message; unknown codes fall back to a generic message. */
export function errorMessage(lang: Lang, code: string | undefined, status?: number): string {
  if (code && (DICTS.en as Record<string, string>)[`err.${code}`]) return translate(lang, `err.${code}`);
  if (status === 401) return translate(lang, 'err.401');
  return translate(lang, 'err.unknown');
}

interface I18nValue { lang: Lang; dir: 'rtl' | 'ltr'; t: (key: TKey | (string & {}), vars?: Vars) => string; setLang: (l: Lang) => void; err: (code?: string, status?: number) => string }
const Ctx = createContext<I18nValue | null>(null);

function initialLang(): Lang {
  try { const v = localStorage.getItem('kx-lang'); if (v === 'ar' || v === 'en') return v; } catch { /* storage unavailable */ }
  return 'ar';
}

export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(initial ?? initialLang());
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = dir; }, [lang, dir]);
  const setLang = useCallback((l: Lang) => { setLangState(l); try { localStorage.setItem('kx-lang', l); } catch { /* ignore */ } }, []);
  const value = useMemo<I18nValue>(() => ({
    lang, dir, setLang,
    t: (k, v) => translate(lang, k, v),
    err: (code, status) => errorMessage(lang, code, status),
  }), [lang, dir, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useI18n outside I18nProvider');
  return v;
}
