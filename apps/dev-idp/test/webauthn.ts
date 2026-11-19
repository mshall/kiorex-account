import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

/** Minimal CBOR encoder (maps, byte strings, text, small ints) - enough for a "none" attestation. */
function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  return Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
}
type Cbor = number | string | Buffer | Map<Cbor, Cbor>;
function cbor(v: Cbor): Buffer {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') return Buffer.concat([head(3, Buffer.byteLength(v)), Buffer.from(v)]);
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  const parts: Buffer[] = [head(5, v.size)];
  for (const [k, val] of v) parts.push(cbor(k), cbor(val));
  return Buffer.concat(parts);
}

const b64u = (b: Buffer) => b.toString('base64url');
const sha256 = (b: Buffer | string) => createHash('sha256').update(b).digest();

/**
 * A software WebAuthn authenticator (ES256, "none" attestation) so passkey registration and LOGIN can be tested end to end
 * without a browser. rpId/origin must match the dev IdP issuer (rpId "localhost").
 */
export class VirtualAuthenticator {
  readonly credentialId = randomBytes(32);
  private readonly priv: KeyObject;
  private readonly jwk: { x: string; y: string };
  counter = 0;
  constructor(private readonly origin: string, private readonly rpId = 'localhost') {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    this.priv = privateKey;
    this.jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  }
  get id(): string { return b64u(this.credentialId); }

  private flags(uv: boolean, at: boolean): number { return 0x01 | (uv ? 0x04 : 0) | (at ? 0x40 : 0); }

  register(challenge: string, o: { uv?: boolean } = {}) {
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin: this.origin, crossOrigin: false }));
    const cose = cbor(new Map<Cbor, Cbor>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(this.jwk.x, 'base64url')], [-3, Buffer.from(this.jwk.y, 'base64url')]]));
    const counter = Buffer.alloc(4);
    const credLen = Buffer.alloc(2); credLen.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([sha256(this.rpId), Buffer.from([this.flags(o.uv ?? true, true)]), counter, Buffer.alloc(16), credLen, this.credentialId, cose]);
    const attestationObject = cbor(new Map<Cbor, Cbor>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
    return {
      id: this.id, rawId: this.id, type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {},
      response: { clientDataJSON: b64u(clientData), attestationObject: b64u(attestationObject), transports: ['internal'] },
    };
  }

  assert(challenge: string, o: { uv?: boolean; origin?: string; counter?: number } = {}) {
    const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: o.origin ?? this.origin, crossOrigin: false }));
    this.counter = o.counter ?? this.counter + 1;
    const c = Buffer.alloc(4); c.writeUInt32BE(this.counter);
    const authData = Buffer.concat([sha256(this.rpId), Buffer.from([this.flags(o.uv ?? true, false)]), c]);
    const signature = sign('sha256', Buffer.concat([authData, sha256(clientData)]), this.priv);
    return {
      id: this.id, rawId: this.id, type: 'public-key', authenticatorAttachment: 'platform', clientExtensionResults: {},
      response: { clientDataJSON: b64u(clientData), authenticatorData: b64u(authData), signature: b64u(signature) },
    };
  }
}
