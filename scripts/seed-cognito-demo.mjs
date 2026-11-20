#!/usr/bin/env node
/**
 * Kiorex Passport on AWS = Amazon Cognito. Seeds the synthetic demo personas (config/seed-users.json) into a NON-PRODUCTION user pool so the same
 * logins work on staging as locally (phone + OTP 000000 for the numbers in the stack's test_phone_numbers; see TEST_DATA.md "Seeding staging on AWS").
 * DEV/STAGING ONLY. Never run against production: the script refuses unless DEMO_SEED_ALLOWED=true, KIORLY_ENV/ENV_TAG is non-production and the pool
 * (name + tags) does not look like production. It creates users with AdminCreateUser (no message sent), a random permanent password that is never
 * printed or stored (sign-in is phone OTP), the verified phone, name, locale and custom:kx_roles. Existing users are updated, never duplicated.
 *
 *   DEMO_SEED_ALLOWED=true KIORLY_ENV=staging node scripts/seed-cognito-demo.mjs --user-pool-id eu-central-1_XXXX [--region eu-central-1] [--profile aws-kiorex-profile]
 *        [--dry-run] [--reset] [--out .seed/cognito-sub-map.json]
 *
 * Output: a { "+20100000xxxx": "<cognito sub>" } map (--out). Cognito subs are generated, so the Kiorly/Kiorex demo seeds take it as DEMO_SUB_MAP_JSON
 * (seed-staging.sh does this) to point their demo records at the real Cognito subs.
 * Not applicable to Cognito (the AWS Passport stack has no account DB yet): dependants, guardian links, organisations, invitations, link requests and
 * TOTP secrets of seed-demo.json (reported as `skipped`). Ops users must enrol TOTP in the Passport UI on first sign-in.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROD = new Set(["prod", "production", "prd", "live"]);
const NON_PROD = new Set(["dev", "development", "local", "test", "testing", "staging", "stage", "demo", "qa", "sandbox", "preview"]);

export function assertSeedAllowed(env = process.env) {
  if (env.DEMO_SEED_ALLOWED !== "true") throw new Error("Refusing: DEMO_SEED_ALLOWED=true is not set");
  const tags = [env.KIORLY_ENV, env.KIOREX_ENV, env.ENV_TAG].map((v) => v?.trim().toLowerCase()).filter(Boolean);
  if (tags.some((t) => PROD.has(t))) throw new Error("Refusing: this is a production environment");
  if (!tags.length) throw new Error("Refusing: declare the environment (KIORLY_ENV=staging)");
  const unknown = tags.find((t) => !NON_PROD.has(t));
  if (unknown) throw new Error(`Refusing: unknown environment "${unknown}"`);
}

/** The pool itself must not look like production (name or tags), whatever the environment variables say. */
export function assertPoolAllowed(pool) {
  const hay = [pool.name, ...Object.values(pool.tags ?? {})].join(" ").toLowerCase();
  if (/(^|[^a-z0-9])(prod|production|prd)([^a-z0-9]|$)/.test(hay)) throw new Error(`Refusing: user pool "${pool.name}" looks like production`);
  const env = (pool.tags?.Env ?? pool.tags?.env ?? "").toLowerCase();
  if (env && !NON_PROD.has(env)) throw new Error(`Refusing: user pool tag Env="${env}" is not a non-production environment`);
}

export function loadDemoUsers(file = join(root, "config", "seed-users.json")) {
  const users = JSON.parse(readFileSync(file, "utf8")).users;
  return users.filter((u) => u.phone && !u.sub.startsWith("01HZKX0")); // 01HZKX0... = the e2e fixtures (Amira/Hassan/ops): they are not demo records
}

export function attributesFor(u) {
  return {
    phone_number: u.phone,
    phone_number_verified: "true",
    name: u.name,
    locale: u.locale ?? "en",
    "custom:kx_roles": (u.roles ?? ["patient"]).join(","),
  };
}

const randomPassword = () => `Aa1!${randomBytes(18).toString("base64url")}`; // never printed or stored; sign-in is phone OTP

export async function seedCognito({ adapter, userPoolId, users, dryRun = false, reset = false, log = console.log }) {
  assertPoolAllowed(await adapter.describePool(userPoolId));
  const subMap = {};
  const result = { created: 0, updated: 0, deleted: 0, planned: users.length };
  for (const u of users) {
    const existing = await adapter.getUser(userPoolId, u.phone);
    if (reset && existing) {
      if (!dryRun) await adapter.deleteUser(userPoolId, u.phone);
      result.deleted += 1;
    }
    const exists = existing && !reset;
    if (dryRun) { log(`[dry-run] ${exists ? "update" : "create"} ${u.phone} ${u.name}`); continue; }
    if (exists) {
      const { phone_number: _p, ...rest } = attributesFor(u);
      await adapter.updateAttributes(userPoolId, u.phone, rest);
      subMap[u.phone] = existing.sub;
      result.updated += 1;
    } else {
      const c = await adapter.createUser(userPoolId, u.phone, attributesFor(u));
      await adapter.setPermanentPassword(userPoolId, u.phone, randomPassword());
      subMap[u.phone] = c.sub;
      result.created += 1;
    }
  }
  return { ...result, subMap, skipped: ["dependants", "guardian links", "organisations + invitations", "link requests", "TOTP secrets (enrol in the Passport UI)"] };
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

async function main() {
  assertSeedAllowed();
  const userPoolId = arg("user-pool-id", process.env.COGNITO_USER_POOL_ID);
  if (!userPoolId) throw new Error("--user-pool-id (or COGNITO_USER_POOL_ID) is required");
  const dryRun = process.argv.includes("--dry-run");
  const { createCognitoAdapter } = await import("./adapters/cognito-adapter.mjs");
  const adapter = await createCognitoAdapter({ region: arg("region", process.env.AWS_REGION ?? "eu-central-1"), profile: arg("profile", process.env.AWS_PROFILE) });
  console.log(`DEMO SEED (synthetic, NON-PRODUCTION ONLY): Kiorex Passport / Cognito pool ${userPoolId}${dryRun ? " [dry-run]" : ""}`);
  const r = await seedCognito({ adapter, userPoolId, users: loadDemoUsers(), dryRun, reset: process.argv.includes("--reset") });
  const out = arg("out");
  if (out && !dryRun) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify(r.subMap, null, 2)); }
  console.log(JSON.stringify({ created: r.created, updated: r.updated, deleted: r.deleted, planned: r.planned, skipped: r.skipped, subMapFile: out && !dryRun ? out : null }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
