/**
 * IDENTITY_PROMOTION_MODE: what happens to identities when an environment is promoted (for example kx-test to kx-pilot / kx-pro).
 *   ask       DEFAULT. Undecided. The promotion tooling (npm run identity:export, identity:promote) REFUSES to run until a mode is chosen.
 *   carry     identities (accounts, contacts, organisations, memberships, guardian links) of the source environment may be exported and imported
 *             into the target, subs preserved, demo-tagged rows excluded unless --include-demo. Passkeys, TOTP secrets, sessions are never carried.
 *   separate  every environment keeps its own identities; the tooling refuses (nothing is ever copied).
 * The setting belongs to the environment the tool runs against (the TARGET for an import, the SOURCE for an export). An unknown value is an error,
 * never silently treated as a mode. This is not a production switch: the dev IdP still refuses production (guard.ts).
 */
export const PROMOTION_MODES = ['ask', 'carry', 'separate'] as const;
export type PromotionMode = (typeof PROMOTION_MODES)[number];
export const DEFAULT_PROMOTION_MODE: PromotionMode = 'ask';

export function parsePromotionMode(env: NodeJS.ProcessEnv = process.env): PromotionMode {
  const raw = env.IDENTITY_PROMOTION_MODE?.trim().toLowerCase();
  if (raw === undefined || raw === '') return DEFAULT_PROMOTION_MODE;
  if ((PROMOTION_MODES as readonly string[]).includes(raw)) return raw as PromotionMode;
  throw new Error(`IDENTITY_PROMOTION_MODE must be one of ${PROMOTION_MODES.join(' | ')} (got "${env.IDENTITY_PROMOTION_MODE}")`);
}

export class PromotionRefusedError extends Error {
  constructor(public readonly mode: PromotionMode, reason: string) {
    super(`Identity promotion refused: ${reason}`);
    this.name = 'PromotionRefusedError';
  }
}

/** Throws unless the mode is `carry`. Pure. */
export function assertCarryMode(mode: PromotionMode): void {
  if (mode === 'ask') throw new PromotionRefusedError(mode, 'IDENTITY_PROMOTION_MODE is "ask" (undecided). The founder decides: set it to "carry" (identities move up) or "separate" (each environment keeps its own).');
  if (mode === 'separate') throw new PromotionRefusedError(mode, 'IDENTITY_PROMOTION_MODE is "separate": environments keep their own identities and nothing is carried over.');
}
