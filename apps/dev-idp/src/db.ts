import pg from 'pg';

export type Pool = pg.Pool;

export function createPool(databaseUrl: string, schema: string): Pool {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error(`invalid schema name: ${schema}`);
  return new pg.Pool({ connectionString: databaseUrl, max: 10, options: `-c search_path=${schema},public` });
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
