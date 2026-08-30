"use strict";

/**
 * Encryption primitives for the credentials vault. A master password never
 * touches disk: only a salt, KDF params and a verifier (proof the derived
 * key is correct) are persisted, and the derived key itself lives only in
 * core/service.cjs's memory for the life of the process.
 *
 * Secrets are encrypted as opaque JSON blobs (see encryptSecret/decryptSecret)
 * so new secret shapes (e.g. an SSH key today, something else tomorrow) never
 * require a change here - only a new caller-side object shape.
 */

const crypto = require("node:crypto");

const SALT_BYTES = 16; // 128-bit salt - plenty to defeat precomputation
const IV_BYTES = 12; // 96-bit GCM nonce (NIST SP 800-38D recommendation)
const KEY_BYTES = 32; // AES-256 key
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const VERIFIER_PLAINTEXT = Buffer.from("netscan-vault-verifier-v1", "utf8");

function generateSalt() {
  return crypto.randomBytes(SALT_BYTES).toString("hex");
}

function deriveKey(password, saltHex, params = SCRYPT_PARAMS) {
  return crypto.scryptSync(password, Buffer.from(saltHex, "hex"), KEY_BYTES, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 512 * 1024 * 1024,
  });
}

function encrypt(key, plaintextBuffer) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("hex"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
  };
}

function decrypt(key, { ciphertext, iv, authTag }) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "hex")), decipher.final()]);
}

function encryptSecret(key, secretObj) {
  return encrypt(key, Buffer.from(JSON.stringify(secretObj), "utf8"));
}

function decryptSecret(key, encoded) {
  return JSON.parse(decrypt(key, encoded).toString("utf8"));
}

function createVerifier(key) {
  const { ciphertext, iv, authTag } = encrypt(key, VERIFIER_PLAINTEXT);
  return { verifier: ciphertext, verifierIv: iv, verifierTag: authTag };
}

function checkVerifier(key, { verifier, verifierIv, verifierTag }) {
  try {
    const plaintext = decrypt(key, { ciphertext: verifier, iv: verifierIv, authTag: verifierTag });
    return (
      plaintext.length === VERIFIER_PLAINTEXT.length &&
      crypto.timingSafeEqual(plaintext, VERIFIER_PLAINTEXT)
    );
  } catch {
    return false;
  }
}

module.exports = {
  SCRYPT_PARAMS,
  generateSalt,
  deriveKey,
  encryptSecret,
  decryptSecret,
  createVerifier,
  checkVerifier,
};
