import { buildLogoutToken, deliverLogoutToken, type DeliveryResult, type KxLogoutEvent } from '@kiorex/backchannel';
import type { IdpConfig } from './config.js';
import type { SigningKey } from './keys.js';

export interface LogoutDelivery extends DeliveryResult { clientId: string; event: KxLogoutEvent }

/** Issues and delivers back-channel logout tokens (KA-05). URIs come from config/idp.json (environment "local"). */
export class LogoutDispatcher {
  private readonly uris = new Map<string, string>();
  constructor(private readonly issuer: string, private readonly key: SigningKey, cfg: IdpConfig,
    private readonly fetchImpl?: typeof fetch) {
    for (const c of cfg.clients) {
      const u = c.environments.local.backchannelLogoutUri;
      if (u) this.uris.set(c.clientId, u);
    }
  }
  uriFor(clientId: string): string | undefined { return this.uris.get(clientId); }
  get clientIds(): string[] { return [...this.uris.keys()]; }

  async send(clientId: string, event: KxLogoutEvent, sub: string, sid?: string): Promise<LogoutDelivery | undefined> {
    const uri = this.uris.get(clientId);
    if (!uri) return undefined;
    const token = await buildLogoutToken({
      issuer: this.issuer, audience: clientId, sub, sid: event === 'subject.deleted' ? undefined : sid,
      event, key: this.key.privateKey, kid: this.key.kid,
    });
    const r = await deliverLogoutToken(uri, token, { fetchImpl: this.fetchImpl, retries: 1, backoffMs: 150, timeoutMs: 2500 });
    return { ...r, clientId, event };
  }
}
