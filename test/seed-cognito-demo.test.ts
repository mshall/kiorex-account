import { describe, expect, it } from "vitest";
// @ts-expect-error plain ESM script
import { assertPoolAllowed, assertSeedAllowed, attributesFor, loadDemoUsers, seedCognito } from "../scripts/seed-cognito-demo.mjs";

const fakeAdapter = (pool: { name: string; tags: Record<string, string> }) => {
  const users = new Map<string, { sub: string }>();
  const calls: string[] = [];
  return {
    calls, users,
    describePool: async () => pool,
    getUser: async (_p: string, name: string) => users.get(name) ?? null,
    createUser: async (_p: string, name: string) => { calls.push(`create ${name}`); const u = { sub: `sub-${users.size + 1}` }; users.set(name, u); return u; },
    setPermanentPassword: async (_p: string, name: string, pw: string) => { calls.push(`pw ${name}`); expect(pw.length).toBeGreaterThan(20); },
    updateAttributes: async (_p: string, name: string) => { calls.push(`update ${name}`); },
    deleteUser: async (_p: string, name: string) => { calls.push(`delete ${name}`); users.delete(name); },
  };
};

describe("seed-cognito-demo (Q10)", () => {
  it("refuses unless DEMO_SEED_ALLOWED=true and the environment is non-production", () => {
    expect(() => assertSeedAllowed({ KIORLY_ENV: "staging" })).toThrow(/DEMO_SEED_ALLOWED/);
    expect(() => assertSeedAllowed({ DEMO_SEED_ALLOWED: "true", KIORLY_ENV: "prod" })).toThrow(/production/);
    expect(() => assertSeedAllowed({ DEMO_SEED_ALLOWED: "true", KIORLY_ENV: "staging", ENV_TAG: "production" })).toThrow(/production/);
    expect(() => assertSeedAllowed({ DEMO_SEED_ALLOWED: "true" })).toThrow(/declare/);
    expect(() => assertSeedAllowed({ DEMO_SEED_ALLOWED: "true", KIORLY_ENV: "staging" })).not.toThrow();
  });
  it("refuses a production-looking pool by name or tag", () => {
    expect(() => assertPoolAllowed({ name: "kiorex-account-prod", tags: {} })).toThrow(/production/);
    expect(() => assertPoolAllowed({ name: "kiorex-account-staging", tags: { Env: "prod" } })).toThrow(/production|not a non-production/);
    expect(() => assertPoolAllowed({ name: "kiorex-account-staging", tags: { Env: "staging", Product: "kiorex-account" } })).not.toThrow();
  });
  it("loads the demo personas but not the e2e fixtures, with Cognito attributes", () => {
    const users = loadDemoUsers();
    expect(users.length).toBeGreaterThan(30);
    expect(users.some((u: { phone: string }) => u.phone === "+201000001001")).toBe(true);
    expect(users.some((u: { phone: string }) => u.phone === "+201000000001")).toBe(false);
    expect(attributesFor(users[0])).toMatchObject({ phone_number_verified: "true" });
  });
  it("creates then updates idempotently, returns the sub map, never touches a prod pool", async () => {
    const a = fakeAdapter({ name: "kiorex-account-staging", tags: { Env: "staging" } });
    const users = loadDemoUsers().slice(0, 3);
    const first = await seedCognito({ adapter: a, userPoolId: "p", users, log: () => {} });
    expect(first).toMatchObject({ created: 3, updated: 0 });
    expect(Object.keys(first.subMap)).toHaveLength(3);
    const second = await seedCognito({ adapter: a, userPoolId: "p", users, log: () => {} });
    expect(second).toMatchObject({ created: 0, updated: 3 });
    const dry = fakeAdapter({ name: "kiorex-account-staging", tags: { Env: "staging" } });
    await seedCognito({ adapter: dry, userPoolId: "p", users, dryRun: true, log: () => {} });
    expect(dry.calls).toEqual([]);
    await expect(seedCognito({ adapter: fakeAdapter({ name: "kiorex-account-prod", tags: {} }), userPoolId: "p", users, log: () => {} })).rejects.toThrow(/production/);
  });
});
