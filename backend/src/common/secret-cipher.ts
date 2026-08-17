import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { appConfig } from "../config.js";

/**
 * Symmetric encryption for secrets this app needs to store reversibly (not
 * hash-and-forget like a login password). AES-256-GCM, random 12-byte IV
 * per call, keyed off TOKEN_ENCRYPTION_KEY. Deliberately generic (not
 * "SMTP secret cipher") -- this is shared infrastructure for any secret
 * that needs to come back out again, e.g. a future Google Calendar OAuth
 * refresh token (see docs/google-integrations-plan.md, Phase C).
 *
 * Output is a single text-column-friendly string:
 *   base64(iv) + "." + base64(authTag) + "." + base64(ciphertext)
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, appConfig.tokenEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

export function decryptSecret(cipherText: string): string {
  const parts = cipherText.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted secret (expected iv.authTag.ciphertext).");
  }
  const [ivPart, authTagPart, ciphertextPart] = parts;
  const iv = Buffer.from(ivPart!, "base64");
  const authTag = Buffer.from(authTagPart!, "base64");
  const ciphertext = Buffer.from(ciphertextPart!, "base64");
  const decipher = createDecipheriv(ALGORITHM, appConfig.tokenEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
