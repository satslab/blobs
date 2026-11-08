// @effect-diagnostics nodeBuiltinImport:off
// Web Push needs raw P-256 ECDH, HKDF-by-HMAC, and AES-128-GCM records, which node:crypto has.
import * as NodeCrypto from "node:crypto";

/**
 * The Web Push wire format, with node:crypto alone: payload encryption to a subscription
 * (RFC 8291, aes128gcm) and the VAPID authorization that signs each request (RFC 8292).
 */

const RECORD_SIZE = 4096;

const base64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const fromBase64url = (value: string) => Buffer.from(value, "base64url");

const hmac = (key: Uint8Array, ...data: Uint8Array[]) => {
  const mac = NodeCrypto.createHmac("sha256", key);
  for (const part of data) mac.update(part);
  return mac.digest();
};

/** Encrypts a payload to a subscription's keys; the result is the request body. */
export function encryptWebPushPayload(input: {
  readonly payload: Uint8Array;
  /** The subscription's uncompressed P-256 public key, base64url. */
  readonly p256dh: string;
  /** The subscription's authentication secret, base64url. */
  readonly auth: string;
}): Uint8Array {
  const userAgentPublic = fromBase64url(input.p256dh);
  const authSecret = fromBase64url(input.auth);
  const ephemeral = NodeCrypto.createECDH("prime256v1");
  const serverPublic = ephemeral.generateKeys();
  const sharedSecret = ephemeral.computeSecret(userAgentPublic);

  // RFC 8291 §3.3: key material from the shared secret, bound to both public keys.
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), userAgentPublic, serverPublic]);
  const inputKeyMaterial = hmac(hmac(authSecret, sharedSecret), keyInfo, Buffer.from([1]));

  // RFC 8188 §2.2: content key and nonce from a random salt.
  const salt = NodeCrypto.randomBytes(16);
  const pseudoRandomKey = hmac(salt, inputKeyMaterial);
  const contentKey = hmac(
    pseudoRandomKey,
    Buffer.from("Content-Encoding: aes128gcm\0"),
    Buffer.from([1]),
  ).subarray(0, 16);
  const nonce = hmac(
    pseudoRandomKey,
    Buffer.from("Content-Encoding: nonce\0"),
    Buffer.from([1]),
  ).subarray(0, 12);

  // One record: the payload, then the final-record delimiter.
  const cipher = NodeCrypto.createCipheriv("aes-128-gcm", contentKey, nonce);
  const ciphertext = Buffer.concat([
    cipher.update(input.payload),
    cipher.update(Buffer.from([2])),
    cipher.final(),
    cipher.getAuthTag(),
  ]);

  const header = Buffer.alloc(16 + 4 + 1);
  salt.copy(header, 0);
  header.writeUInt32BE(RECORD_SIZE, 16);
  header.writeUInt8(serverPublic.length, 20);
  return Buffer.concat([header, serverPublic, ciphertext]);
}

/** The `Authorization` header that proves the sender holds the subscription's VAPID key. */
export function vapidAuthorization(input: {
  readonly endpoint: string;
  /** Uncompressed P-256 public key, base64url. */
  readonly publicKey: string;
  /** The private scalar `d`, base64url. */
  readonly privateKey: string;
  /** Contact for the push service, a mailto: or https: URL. */
  readonly subject: string;
  readonly nowSeconds: number;
}): string {
  const publicKey = fromBase64url(input.publicKey);
  const key = NodeCrypto.createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: input.privateKey,
      x: base64url(publicKey.subarray(1, 33)),
      y: base64url(publicKey.subarray(33, 65)),
    },
    format: "jwk",
  });
  const header = base64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = base64url(
    Buffer.from(
      JSON.stringify({
        aud: new URL(input.endpoint).origin,
        // Push services reject tokens that live longer than a day.
        exp: input.nowSeconds + 12 * 60 * 60,
        sub: input.subject,
      }),
    ),
  );
  const signature = NodeCrypto.sign("sha256", Buffer.from(`${header}.${claims}`), {
    key,
    dsaEncoding: "ieee-p1363",
  });
  return `vapid t=${header}.${claims}.${base64url(signature)}, k=${input.publicKey}`;
}
