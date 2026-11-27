# Two-step verification (MFA) policy in Kiorex Passport

Founder decision, 27 Nov 2026: two-step verification stays **optional by default**. A Kiorex Passport admin or ops user can make it **mandatory** from the Passport web (Ops, MFA policy) for the roles, organisation types and organisations they choose, and can switch it off again. Nothing in this policy weakens an existing rule: it can only add requirements.

## What a real owner experiences

| Situation | Sign-in | Pharmacy / Lab privileged areas |
|---|---|---|
| Policy OFF (default), owner has no authenticator | Phone code only. Passport issues a basic session (`acr` = basic). | `403 MFA_REQUIRED` on `/auth/me` in production mode. The web app shows a friendly screen "set up two-step verification" with a link to Passport Security; after setting it up the owner signs out and signs in again. |
| Policy OFF, owner enrolled voluntarily (Passport, Security, Authenticator app) | Phone code, then Passport OFFERS the authenticator code with a "Skip for now" button. Entering it issues the MFA mark (`acr` = mfa, `amr` has `totp` and `mfa`). Skipping keeps the basic level. | Works when the code was entered; the friendly screen when skipped. |
| Policy ON and the owner matches a rule | Phone code, then the authenticator page. A person without an authenticator is walked through setting one up (setup key, 6-digit code) and cannot skip. A passkey with user verification also satisfies it. The MFA mark is always issued. | Works. |
| Baseline roles (Passport roles `ops_admin`, `super_admin`, `owner`, `admin`, `finance`; `config/idp.json` `mfaPolicy.requiredForRoles`) | Always mandatory, as before. Not editable in the console. | n/a |

The policy applies at the NEXT sign-in of each person; an already signed-in session is not interrupted. Turning the policy off makes the factor optional again for everybody who is not in the baseline; people who enrolled keep their authenticator and are offered it (skippable) at sign-in.

Pharmacy and Lab are unchanged: in production mode (`NODE_ENV=production`, `AUTH_MODE=oidc`) they still require the MFA claim for their privileged staff roles (Pharmacy OWNER, PHARMACIST, BRANCH_MANAGER, CHAIN_OPS; Lab OWNER, LAB_DIRECTOR, AUTHORIZED_SIGNATORY) and answer `403 MFA_REQUIRED` without it. The new friendly screen only explains that answer; it grants nothing. **Consequence of keeping MFA optional:** real pharmacy and lab owners who never enrol get `403 MFA_REQUIRED` in those areas. To avoid that on a launch day, turn the policy on for organisation types `pharmacy` and `lab` (roles owner, pharmacist, branch_manager, chain_ops, lab_director, authorized_signatory, or `*`) a few days before, so owners are enrolled at their next sign-in.

Note the two role vocabularies: the Pharmacy and Lab privileged roles live in their own staff tables; Passport only knows MEMBERSHIP role hints (`owner`, `admin`, `finance`, `doctor`, `pharmacist`, ... plus the extra names `branch_manager`, `chain_ops`, `lab_director`, `authorized_signatory` that a policy may name) and Passport roles. A policy rule matches when the person holds an ACTIVE membership of a matching organisation with a role in the rule (or a Passport role in an `all` rule). Choose the role `*` ("every member") to cover a whole organisation or organisation type regardless of the hint.

## How to turn it on (ops console)

1. Sign in to Passport as `ops_admin` or `super_admin` (these roles always use an authenticator). Open **MFA policy** in the top navigation (`/account/ops/mfa`).
2. In **Propose a change** tick "Make two-step verification mandatory for the rules below", press **Add a rule** and choose: scope (everyone / organisations of one type / one organisation), the organisation type (clinic, nurse, pharmacy, lab) or the organisation, and the roles. Optionally write the reason.
3. **Show who is affected** previews how many people are covered and how many have no authenticator yet. **Submit for approval**.
4. A DIFFERENT `ops_admin` or `super_admin` opens the same page, reviews the proposal under **Waiting for approval** and presses **Approve and apply** (or Reject). The proposer can only withdraw their own proposal. A proposal made on an older version of the policy cannot be applied ("stale"): propose again.
5. A `super_admin` may use **Apply now** (break-glass, one person). It is recorded as `mfa.policy.applied_direct` and marked "applied directly" in the history.
6. To go back to optional: untick the switch (rules stay saved) and apply the same way.

Every step writes the hash-chained audit log (`mfa.policy.proposed`, `.applied`, `.applied_direct`, `.rejected`, `.withdrawn`; the applied events carry the rules, the proposer and the new version). Reading and changing the policy needs the ops role AND a fresh MFA step-up (the console sends the operator to the step-up page). The page is bilingual (EN and AR with RTL) and axe-clean.

API (operator, not in the public OpenAPI): `GET /api/ops/mfa-policy`, `POST /api/ops/mfa-policy/preview`, `POST /api/ops/mfa-policy/changes` (`{ policy, note?, apply? }`), `POST /api/ops/mfa-policy/changes/:id/{approve,reject,withdraw}`. Policy document: `{ "enabled": false, "rules": [ { "scope": "all" | "org_type" | "org", "value": "<type or org id>", "roles": ["owner", "pharmacist"] } ] }`; `roles: ["*"]` = every member. Storage: tables `mfa_policy` (one row, versioned) and `mfa_policy_changes` (the maker-checker log).

## Voluntary enrolment

Any person can enrol at Passport, **Security**, **Authenticator app** (setup key or link, confirm with a code) and remove it again unless the policy or their role requires it. At sign-in an enrolled person is offered the code; the MFA mark is issued only when it is entered.

## Tests

Unit (`apps/dev-idp/test/mfa-policy.test.ts`: matching, maker-checker, mandatory enrolment, skip rules, validation), UI (`apps/passport-ui/test/mfa-policy.test.tsx`), Playwright (`apps/passport-ui/e2e/09-mfa-policy.spec.ts`: maker proposes, checker approves, owner is walked through enrolment, switching off), kx-test live (`e2e/kx-test/08-mfa-policy.spec.ts`).
