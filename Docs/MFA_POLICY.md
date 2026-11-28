# Two-step verification (MFA) policy in Kiorex Passport

Founder decision, 27 Nov 2026: two-step verification stays **optional by default**. A Kiorex Passport admin or ops user can make it **mandatory** from the Passport web (Ops, MFA policy) for the roles, organisation types and organisations they choose, and can switch it off again. Nothing in this policy weakens an existing rule: it can only add requirements.

## What a real owner experiences

| Situation | Sign-in | Pharmacy / Lab privileged areas |
|---|---|---|
| Policy OFF (default), owner has no authenticator | Phone code only. Passport issues a basic session (`acr` = basic). | **Works** (changed 28 Nov 2026, see "Pharmacy and Lab follow the policy" below): the product asks Passport and sees that the factor is not mandatory for the organisation type. |
| Policy OFF, owner enrolled voluntarily (Passport, Security, Authenticator app) | Phone code, then Passport OFFERS the authenticator code with a "Skip for now" button. Entering it issues the MFA mark (`acr` = mfa, `amr` has `totp` and `mfa`). Skipping keeps the basic level. | Works either way. |
| Policy ON and the owner matches a rule | Phone code, then the authenticator page. A person without an authenticator is walked through setting one up (setup key, 6-digit code) and cannot skip. A passkey with user verification also satisfies it. The MFA mark is always issued. | Works. |
| Baseline roles (Passport roles `ops_admin`, `super_admin`, `owner`, `admin`, `finance`, and since 28 Nov 2026 the Kiorly-only roles `kiorly_ops` and `kiorly_admin`; `config/idp.json` `mfaPolicy.requiredForRoles`) | Always mandatory, as before. Not editable in the console. | n/a |

The policy applies at the NEXT sign-in of each person; an already signed-in session is not interrupted. Turning the policy off makes the factor optional again for everybody who is not in the baseline; people who enrolled keep their authenticator and are offered it (skippable) at sign-in.

## Pharmacy and Lab follow the policy (28 Nov 2026)

Founder decision: the policy for organisation types `pharmacy` and `lab` **stays OFF by default** and is turned on only by Passport admin/ops through the maker-checker page above. Before this change the Pharmacy and Lab APIs demanded the MFA claim from their privileged roles (Pharmacy OWNER, PHARMACIST, BRANCH_MANAGER, CHAIN_OPS; Lab OWNER, LAB_DIRECTOR, AUTHORIZED_SIGNATORY) in production on their own, so an owner without an authenticator got `403 MFA_REQUIRED` even though the policy was off. Now the product asks Passport:

- **Endpoint** `GET /.well-known/kiorex-mfa-policy` on the Passport host (no credentials; no person and no organisation id in the answer): `{ enabled, version, types: { clinic|nurse|pharmacy|lab: { mandatory: [role hints or "*"], partial: [...] } } }`. `mandatory` lists the role hints for which the factor is mandatory for the WHOLE organisation type (scope "organisations of one type" or "everyone"); `partial` lists the roles covered only for some organisations of that type (organisation-scoped rules). Pure function `coverageByType` (unit tested).
- **Product rule** (`src/auth/mfa-policy.ts` in Pharmacy and Lab, cached 15 s, 3 s timeout):
  - policy OFF, or the role not named by a rule for the type: a privileged owner/pharmacist/branch manager/lab director signs in with Passport (verified phone) **without an authenticator and works**; if they enrolled and entered the code the claim is simply present.
  - policy ON for the role: the privileged role needs the MFA claim. Passport already forces enrolment at the next sign-in; a session without the claim (for example one started before the policy was turned on) gets `403 MFA_REQUIRED` and the friendly screen.
  - **Fail closed**: Passport unreachable, malformed answer or no issuer configured = mandatory (exactly the old behaviour). `MFA_POLICY_SOURCE=always` pins "mandatory" regardless of Passport; `MFA_POLICY_URL` overrides the endpoint; `FORCE_PRIVILEGED_MFA=true` (Lab, tests) pins the hard rule.
  - **Passwords for privileged roles** (`AUTH_MODE=both` only, which is the only way a password route exists in a hosted process): allowed ONLY while the policy for the organisation type is OFF for that role. With the policy ON, only partly ON (some organisations covered: the password path takes the safe answer), or unreadable, the answer is `403 PASSPORT_REQUIRED_FOR_ROLE` and the person uses Passport. Other roles (cashier, technologist, ...) always may use a password. `AUTH_MODE=oidc` (pilot and production default) has no password route at all.
  - A password session never carries the MFA claim; when ops later turn the policy on, such a session is refused (`MFA_REQUIRED`) and the owner signs in again with Passport, where enrolment is forced.
- **Safety trade-off, accepted by the founder:** while the policy is OFF a pharmacy or lab owner can reach privileged areas (stock, dispensing sign-off, report sign-off) with a phone code alone (and, on environments with `both`, with a password). Turn the policy on for the types before real owners are onboarded if that is not wanted. The Passport baseline roles (`ops_admin`, `super_admin`, `owner`, `admin`, `finance` as Passport roles) are unaffected.

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

Unit (`apps/dev-idp/test/mfa-policy.test.ts`: matching, public coverage and the endpoint, maker-checker, mandatory enrolment, skip rules, validation), UI (`apps/passport-ui/test/mfa-policy.test.tsx`), Playwright (`apps/passport-ui/e2e/09-mfa-policy.spec.ts`: maker proposes, checker approves, owner is walked through enrolment, switching off), kx-test live (`e2e/kx-test/08-mfa-policy.spec.ts`).


## Kiorly-only roles (28 Nov 2026, ADR-062)

`kiorly_ops` (read, review, onboarding actions in the Kiorly admin) and `kiorly_admin` (changes within the Kiorly scope) are Passport roles for people who work only on the Kiorly side. Two-step verification is **mandatory for both, exactly like `ops_admin`** (they are in the baseline `requiredForRoles`, not editable in the console, and a person without an authenticator is walked through setting one up at the first sign-in; there is no skip).

- **Who grants:** only a `super_admin` (with a fresh MFA step-up) at Passport, **Ops, Kiorly roles** (`/account/ops/kiorly-roles`): the person's phone number, the role, and a reason of 3 to 300 characters. API: `GET /api/ops/kiorly-roles`, `POST /api/ops/kiorly-roles` (`{ phone | sub, role, note }`), `POST /api/ops/kiorly-roles/:sub/revoke` (`{ note }`). Every grant and revoke is written to the hash-chained audit log (`kiorly.role.granted`, `kiorly.role.revoked`, with target, role, previous roles and the reason) and every session of the person ends at once.
- **Separate accounts:** the same sign-in never holds Kiorex roles and Kiorly roles. A grant is refused (`409 mixed_roles`) when the account holds any role other than `patient`; the grant replaces `patient` with the Kiorly role and a revoke puts `patient` back. Nobody grants themselves (`409 cannot_grant_self`). One Kiorly role per account (granting the other level switches it). The person must have signed in to Passport once (`404 account_not_found`).
- **Tokens:** `kx_roles` carries only the Kiorly role. The platform API refuses a token that mixes a Kiorly role with any other role (`403 FORBIDDEN_MIXED_ROLES`) and is deny-by-default for these roles (explicit allow-list, see the platform `Docs/KIORLY_ADMIN.md`).
- Tests: `apps/dev-idp/test/kiorly-roles.test.ts` (pure rules, super admin only, audit and reason, sessions ended, mandatory enrolment and claim, mixed roles refused, level switch, list and revoke).
