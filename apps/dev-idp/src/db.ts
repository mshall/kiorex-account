import pg from 'pg';

export type Pool = pg.Pool;

export function createPool(databaseUrl: string, schema: string): Pool {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`invalid schema name: ${schema}`);
  return new pg.Pool({ connectionString: databaseUrl, max: Number(process.env.DB_POOL_MAX) > 0 ? Number(process.env.DB_POOL_MAX) : 10, options: `-c search_path=${schema},public` });
}

export async function migrate(pool: Pool, schema: string): Promise<void> {
  if (schema !== 'public') await pool.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oidc_payloads (
      id text NOT NULL, model text NOT NULL, uid text, grant_id text, user_code text,
      payload jsonb NOT NULL, expires_at timestamptz, consumed_at timestamptz,
      PRIMARY KEY (model, id)
    );
    CREATE INDEX IF NOT EXISTS oidc_payloads_uid ON oidc_payloads (uid);
    CREATE INDEX IF NOT EXISTS oidc_payloads_grant ON oidc_payloads (grant_id);
    CREATE INDEX IF NOT EXISTS oidc_payloads_expires ON oidc_payloads (expires_at);

    CREATE TABLE IF NOT EXISTS accounts (
      sub text PRIMARY KEY, phone text UNIQUE, phone_verified boolean NOT NULL DEFAULT false,
      name text, locale text NOT NULL DEFAULT 'en', roles jsonb NOT NULL DEFAULT '["patient"]',
      status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
    );

    CREATE TABLE IF NOT EXISTS otp_challenges (
      id uuid PRIMARY KEY, interaction_uid text NOT NULL, phone text NOT NULL, salt text NOT NULL, hash text NOT NULL,
      locale text NOT NULL DEFAULT 'en', name text, ip text, attempts int NOT NULL DEFAULT 0, locked boolean NOT NULL DEFAULT false,
      expires_at timestamptz NOT NULL, verified_at timestamptz, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS otp_challenges_uid ON otp_challenges (interaction_uid, created_at DESC);

    CREATE TABLE IF NOT EXISTS otp_send_log (id bigserial PRIMARY KEY, phone text NOT NULL, ip text NOT NULL, at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS otp_send_phone ON otp_send_log (phone, at);
    CREATE INDEX IF NOT EXISTS otp_send_ip ON otp_send_log (ip, at);
    CREATE TABLE IF NOT EXISTS otp_lockouts (phone text PRIMARY KEY, until timestamptz NOT NULL);

    CREATE TABLE IF NOT EXISTS session_meta (
      session_uid text PRIMARY KEY, sub text NOT NULL, user_agent text, ip text,
      created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS session_meta_sub ON session_meta (sub);

    CREATE TABLE IF NOT EXISTS passkeys (
      credential_id text PRIMARY KEY, sub text NOT NULL, public_key bytea NOT NULL, counter bigint NOT NULL DEFAULT 0,
      transports jsonb, device_type text, backed_up boolean, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS passkeys_sub ON passkeys (sub);
    CREATE TABLE IF NOT EXISTS passkey_challenges (key text PRIMARY KEY, challenge text NOT NULL, expires_at timestamptz NOT NULL);

    CREATE TABLE IF NOT EXISTS signing_keys (kid text PRIMARY KEY, jwk jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());

    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'person';
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS dob date;
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS market text NOT NULL DEFAULT 'EG';
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS merged_into text;

    -- dev inbox: mock WhatsApp/SMS/email deliveries (CLAUDE.md: messaging is MOCKED; GET /dev/inbox)
    CREATE TABLE IF NOT EXISTS dev_inbox (
      id bigserial PRIMARY KEY, channel text NOT NULL, recipient text NOT NULL, template text NOT NULL, locale text NOT NULL DEFAULT 'en',
      body text NOT NULL, data jsonb NOT NULL DEFAULT '{}', state text NOT NULL DEFAULT 'delivered', created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS dev_inbox_recipient ON dev_inbox (recipient, id);

    -- delivery status of OTP / notification messages (provider status webhooks; forward-only). No codes, no raw phones.
    CREATE TABLE IF NOT EXISTS delivery_status (
      provider_ref text PRIMARY KEY, channel text NOT NULL, recipient_masked text NOT NULL, status text NOT NULL DEFAULT 'SENT',
      error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );

    -- events the IdP would publish to products (additive contracts: guardian.link.changed, membership.changed, account.merged)
    CREATE TABLE IF NOT EXISTS event_outbox (
      id bigserial PRIMARY KEY, type text NOT NULL, aggregate_type text NOT NULL, aggregate_id text NOT NULL,
      data jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now()
    );

    -- KA-06 guardian <-> dependant links
    CREATE TABLE IF NOT EXISTS guardian_links (
      id text PRIMARY KEY, guardian_sub text NOT NULL, dependant_sub text NOT NULL, relationship text NOT NULL,
      evidence jsonb NOT NULL, status text NOT NULL DEFAULT 'active', expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz, ended_reason text
    );
    CREATE INDEX IF NOT EXISTS guardian_links_guardian ON guardian_links (guardian_sub);
    CREATE INDEX IF NOT EXISTS guardian_links_dependant ON guardian_links (dependant_sub);

    -- gap closure: optional verified e-mail (claims email, email_verified); the flag is true only after the person returns a code sent to that address
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email text;
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false;
    CREATE TABLE IF NOT EXISTS email_verifications (
      sub text PRIMARY KEY, email text NOT NULL, code_hash text NOT NULL, attempts int NOT NULL DEFAULT 0,
      expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );

    -- KA-08 account linking / merge (never automatic)
    CREATE TABLE IF NOT EXISTS account_contacts (
      sub text NOT NULL, type text NOT NULL, value text NOT NULL, verified boolean NOT NULL DEFAULT true,
      source text NOT NULL DEFAULT 'merge', created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (type, value)
    );
    CREATE INDEX IF NOT EXISTS account_contacts_sub ON account_contacts (sub);
    CREATE TABLE IF NOT EXISTS link_requests (
      id text PRIMARY KEY, primary_sub text NOT NULL, secondary_sub text NOT NULL, secondary_phone text NOT NULL,
      status text NOT NULL, conflicts jsonb NOT NULL DEFAULT '[]', resolution jsonb, snapshot jsonb,
      requested_at timestamptz NOT NULL DEFAULT now(), verified_at timestamptz, reviewed_by text, reviewed_at timestamptz,
      review_note text, merged_at timestamptz, reversed_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS link_requests_status ON link_requests (status);

    -- demo-data tagging: every seeded demo person, dependant or organisation is durably marked DEMO so a removal script can never touch REAL rows.
    -- Real sign-ups, SCIM provisioning and API-created organisations take the default REAL.
    ALTER TABLE accounts ADD COLUMN IF NOT EXISTS data_class text NOT NULL DEFAULT 'REAL';
    CREATE INDEX IF NOT EXISTS accounts_data_class ON accounts (data_class) WHERE data_class <> 'REAL';

    -- KA-09 organisations and memberships (identity-level assertions only)
    CREATE TABLE IF NOT EXISTS organizations (
      org_id text PRIMARY KEY, legal_name text NOT NULL, country text NOT NULL, product_refs jsonb NOT NULL DEFAULT '{}',
      status text NOT NULL DEFAULT 'active', created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS edition text NOT NULL DEFAULT 'CLINIC';
    ALTER TABLE organizations ADD COLUMN IF NOT EXISTS data_class text NOT NULL DEFAULT 'REAL';
    CREATE TABLE IF NOT EXISTS memberships (
      id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(org_id), sub text NOT NULL, role_hint text NOT NULL,
      invited_by text, status text NOT NULL DEFAULT 'active', effective_from timestamptz NOT NULL DEFAULT now(), expires_at timestamptz,
      ended_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS memberships_sub ON memberships (sub);
    CREATE INDEX IF NOT EXISTS memberships_org ON memberships (org_id);
    CREATE TABLE IF NOT EXISTS invitations (
      id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(org_id), role_hint text NOT NULL, invitee_phone text NOT NULL,
      token_hash text NOT NULL UNIQUE, invited_by text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz,
      consumed_by text, revoked_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    );

    -- KA-10 TOTP + step-up
    CREATE TABLE IF NOT EXISTS totp_credentials (
      sub text PRIMARY KEY, secret text NOT NULL, confirmed_at timestamptz, last_step bigint NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS totp_attempts (key text NOT NULL, at timestamptz NOT NULL DEFAULT now());
    CREATE INDEX IF NOT EXISTS totp_attempts_key ON totp_attempts (key, at);
    CREATE TABLE IF NOT EXISTS interaction_state (
      uid text NOT NULL, kind text NOT NULL, sub text NOT NULL, data jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (uid, kind)
    );

    -- KA-11 federation
    CREATE TABLE IF NOT EXISTS federated_identities (
      upstream_id text NOT NULL, upstream_sub text NOT NULL, sub text NOT NULL, email text, display_name text,
      linked_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (upstream_id, upstream_sub)
    );
    CREATE INDEX IF NOT EXISTS federated_identities_sub ON federated_identities (sub);
    CREATE TABLE IF NOT EXISTS federation_txn (
      state text PRIMARY KEY, interaction_uid text NOT NULL, upstream_id text NOT NULL, nonce text NOT NULL,
      code_verifier text NOT NULL, result jsonb, expires_at timestamptz NOT NULL
    );

    -- KA-11 SCIM 2.0 provider-directory sync: per-org bearer tokens (hash only) and the org-scoped set of SCIM-provisioned users
    CREATE TABLE IF NOT EXISTS scim_tokens (
      id text PRIMARY KEY, org_id text NOT NULL REFERENCES organizations(org_id), token_hash text NOT NULL UNIQUE, label text NOT NULL,
      created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz, revoked_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS scim_tokens_org ON scim_tokens (org_id);
    CREATE TABLE IF NOT EXISTS scim_users (
      org_id text NOT NULL REFERENCES organizations(org_id), sub text NOT NULL, external_id text, user_name text NOT NULL,
      active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (org_id, sub)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS scim_users_name ON scim_users (org_id, lower(user_name));

    -- configurable second-factor policy (default: disabled = MFA optional) with a maker-checker change log
    CREATE TABLE IF NOT EXISTS mfa_policy (
      id int PRIMARY KEY CHECK (id = 1), policy jsonb NOT NULL, version int NOT NULL DEFAULT 0, updated_by text, updated_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS mfa_policy_changes (
      id text PRIMARY KEY, proposed_by text NOT NULL, policy jsonb NOT NULL, note text, base_version int NOT NULL,
      status text NOT NULL DEFAULT 'pending', decided_by text, decided_at timestamptz, decision_note text,
      applied_directly boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS mfa_policy_changes_status ON mfa_policy_changes (status, created_at DESC);

    CREATE TABLE IF NOT EXISTS audit_events (
      seq bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(), type text NOT NULL, sub text, data jsonb NOT NULL DEFAULT '{}',
      prev_hash text NOT NULL, hash text NOT NULL
    );
  `);
}

export async function dropSchema(pool: Pool, schema: string): Promise<void> {
  if (schema === 'public') throw new Error('refusing to drop public');
  await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
}
