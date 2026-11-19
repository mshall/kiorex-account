/**
 * Cognito custom-authentication-challenge Lambda triggers for phone OTP (KA-02, KX-21 §08).
 * Cognito CUSTOM_AUTH flow: DefineAuthChallenge -> CreateAuthChallenge -> (client answers) -> VerifyAuthChallengeResponse.
 * Types are minimal local shapes so this package has no aws-lambda dependency.
 * Rate limits (5 sends/phone/hour, 20/IP/hour) are enforced in the pre-auth layer (WAF + Cognito advanced security
 * + the infra stack); this module enforces per-challenge attempts and TTL.
 */
import {
  DEFAULT_OTP_POLICY, generateCode, hashCode, isDevBypass, maskPhone, newSalt, verifyCodeHash,
  type DevBypass, type OtpPolicy,
} from './core.js';
import type { OtpChannel, OtpLocale } from './channels.js';

export interface ChallengeResult {
  challengeName: string;
  challengeResult: boolean;
  challengeMetadata?: string;
}
interface TriggerRequestBase {
  userAttributes: Record<string, string>;
  userNotFound?: boolean;
  clientMetadata?: Record<string, string>;
}
export interface DefineEvent {
  request: TriggerRequestBase & { session: ChallengeResult[] };
  response: { challengeName?: string; issueTokens?: boolean; failAuthentication?: boolean };
}
export interface CreateEvent {
  request: TriggerRequestBase & { challengeName: string; session: ChallengeResult[] };
  response: {
    publicChallengeParameters?: Record<string, string>;
    privateChallengeParameters?: Record<string, string>;
    challengeMetadata?: string;
  };
}
export interface VerifyEvent {
  request: TriggerRequestBase & {
    privateChallengeParameters: Record<string, string>;
    challengeAnswer: string;
  };
  response: { answerCorrect?: boolean };
}

export const CUSTOM_CHALLENGE = 'CUSTOM_CHALLENGE';

export interface OtpHandlerDeps {
  channel: OtpChannel;
  policy?: OtpPolicy;
  bypass?: DevBypass;
  now?: () => number;
}

export function createOtpHandlers(deps: OtpHandlerDeps) {
  const policy = deps.policy ?? DEFAULT_OTP_POLICY;
  const now = deps.now ?? (() => Date.now());

  /** Decides what happens next from the session history. */
  async function defineAuthChallenge(event: DefineEvent): Promise<DefineEvent> {
    const s = event.request.session;
    if (event.request.userNotFound) {
      // Do not reveal whether the phone exists: fail like a normal wrong answer.
      event.response = { failAuthentication: true, issueTokens: false };
      return event;
    }
    const last = s[s.length - 1];
    if (s.length === 0) {
      event.response = { challengeName: CUSTOM_CHALLENGE, issueTokens: false, failAuthentication: false };
    } else if (last.challengeName === CUSTOM_CHALLENGE && last.challengeResult === true) {
      event.response = { issueTokens: true, failAuthentication: false };
    } else if (s.length >= policy.maxAttemptsPerChallenge) {
      event.response = { issueTokens: false, failAuthentication: true };
    } else {
      event.response = { challengeName: CUSTOM_CHALLENGE, issueTokens: false, failAuthentication: false };
    }
    return event;
  }

  /** Sends a fresh code on the first attempt; on retries re-uses the code already issued (no resend storm). */
  async function createAuthChallenge(event: CreateEvent): Promise<CreateEvent> {
    const phone = event.request.userAttributes.phone_number;
    const locale: OtpLocale = event.request.clientMetadata?.locale === 'ar' ? 'ar' : 'en';
    const previous = event.request.session[event.request.session.length - 1];
    let salt: string; let hash: string; let expiresAt: number;
    if (previous?.challengeMetadata) {
      ({ salt, hash, expiresAt } = JSON.parse(previous.challengeMetadata));
    } else {
      const code = generateCode(policy.codeLength);
      salt = newSalt();
      hash = hashCode(code, salt);
      expiresAt = now() + policy.ttlSeconds * 1000;
      await deps.channel.send({ phone, code, locale, ttlMinutes: Math.ceil(policy.ttlSeconds / 60) });
    }
    event.response.publicChallengeParameters = { phone: maskPhone(phone), channel: deps.channel.name };
    // Only the salted hash is placed in challenge metadata; the clear code goes only to the channel.
    event.response.privateChallengeParameters = { salt, hash, expiresAt: String(expiresAt), phone };
    event.response.challengeMetadata = JSON.stringify({ salt, hash, expiresAt });
    return event;
  }

  async function verifyAuthChallengeResponse(event: VerifyEvent): Promise<VerifyEvent> {
    const p = event.request.privateChallengeParameters;
    const answer = (event.request.challengeAnswer ?? '').trim();
    let ok = false;
    if (deps.bypass && isDevBypass(p.phone, answer, deps.bypass)) ok = true;
    else if (Number(p.expiresAt) >= now() && /^\d+$/.test(answer)) ok = verifyCodeHash(answer, p.salt, p.hash);
    event.response.answerCorrect = ok;
    return event;
  }

  return { defineAuthChallenge, createAuthChallenge, verifyAuthChallengeResponse };
}
