// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import { assert, describe, it } from "@effect/vitest";

import { encryptWebPushPayload, vapidAuthorization } from "./webPushProtocol.ts";

const hmac = (key: Uint8Array, ...data: Uint8Array[]) => {
  const mac = NodeCrypto.createHmac("sha256", key);
  for (const part of data) mac.update(part);
  return mac.digest();
};

/** Decrypts a request body the way a browser does (RFC 8291), to check what a server sends. */
function decryptAsBrowser(body: Uint8Array, browser: NodeCrypto.ECDH, auth: Uint8Array) {
  const bytes = Buffer.from(body);
  const salt = bytes.subarray(0, 16);
  const keyIdLength = bytes.readUInt8(20);
  const serverPublic = bytes.subarray(21, 21 + keyIdLength);
  const ciphertext = bytes.subarray(21 + keyIdLength);
  const keyInfo = Buffer.concat([
    Buffer.from("WebPush: info\0"),
    browser.getPublicKey(),
    serverPublic,
  ]);
  const inputKeyMaterial = hmac(
    hmac(auth, browser.computeSecret(serverPublic)),
    keyInfo,
    Buffer.from([1]),
  );
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
  const decipher = NodeCrypto.createDecipheriv("aes-128-gcm", contentKey, nonce);
  decipher.setAuthTag(ciphertext.subarray(-16));
  const plaintext = Buffer.concat([decipher.update(ciphertext.subarray(0, -16)), decipher.final()]);
  return { recordSize: bytes.readUInt32BE(16), plaintext };
}

describe("webPushProtocol", () => {
  it("encrypts a payload only the subscribing browser can read", () => {
    const browser = NodeCrypto.createECDH("prime256v1");
    browser.generateKeys();
    const auth = NodeCrypto.randomBytes(16);
    const message = "Thread finished ✓";

    const body = encryptWebPushPayload({
      payload: new TextEncoder().encode(message),
      p256dh: browser.getPublicKey().toString("base64url"),
      auth: auth.toString("base64url"),
    });

    const { recordSize, plaintext } = decryptAsBrowser(body, browser, auth);
    assert.equal(recordSize, 4096);
    // One record, closed by the final-record delimiter.
    assert.equal(plaintext.at(-1), 2);
    assert.equal(plaintext.subarray(0, -1).toString(), message);

    const otherBrowser = NodeCrypto.createECDH("prime256v1");
    otherBrowser.generateKeys();
    assert.throws(() => decryptAsBrowser(body, otherBrowser, auth));
  });

  it("signs a VAPID token the push service can verify with the public key", () => {
    const { privateKey, publicKey } = NodeCrypto.generateKeyPairSync("ec", {
      namedCurve: "P-256",
    });
    const jwk = privateKey.export({ format: "jwk" });
    const rawPublicKey = Buffer.concat([
      Buffer.from([4]),
      Buffer.from(jwk.x!, "base64url"),
      Buffer.from(jwk.y!, "base64url"),
    ]).toString("base64url");

    const header = vapidAuthorization({
      endpoint: "https://web.push.apple.com/subscription-id",
      publicKey: rawPublicKey,
      privateKey: jwk.d!,
      subject: "https://example.com",
      nowSeconds: 1_000,
    });

    const [, token, key] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    assert.equal(key, rawPublicKey);
    const [encodedHeader, encodedClaims, signature] = token!.split(".");
    assert.isTrue(
      NodeCrypto.verify(
        "sha256",
        Buffer.from(`${encodedHeader}.${encodedClaims}`),
        { key: publicKey, dsaEncoding: "ieee-p1363" },
        Buffer.from(signature!, "base64url"),
      ),
    );
    assert.deepEqual(JSON.parse(Buffer.from(encodedClaims!, "base64url").toString()), {
      aud: "https://web.push.apple.com",
      exp: 1_000 + 12 * 60 * 60,
      sub: "https://example.com",
    });
  });
});
