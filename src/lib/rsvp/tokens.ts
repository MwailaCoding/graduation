import crypto from "node:crypto";

const MANAGEMENT_TOKEN_BYTES = 32;
const MANAGEMENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;

/**
 * Generates a cryptographically random 256-bit management token encoded as
 * 43-character unpadded base64url.
 */
export function generateManagementToken(): string {
  return crypto.randomBytes(MANAGEMENT_TOKEN_BYTES).toString("base64url");
}

/**
 * Computes the SHA-256 hex digest (64 characters) of a management token.
 */
export function hashManagementToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Validates that an unknown value matches the strict 43-character base64url
 * management token format.
 */
export function isValidTokenFormat(token: unknown): token is string {
  return typeof token === "string" && MANAGEMENT_TOKEN_PATTERN.test(token);
}

/**
 * Constant-time comparison between a raw management token and an expected
 * 64-character SHA-256 hex hash.
 */
export function verifyTokenMatchesHash(
  token: string,
  expectedHash: string,
): boolean {
  if (!isValidTokenFormat(token) || !SHA256_HEX_PATTERN.test(expectedHash)) {
    return false;
  }

  const actualDigest = Buffer.from(hashManagementToken(token), "hex");
  const expectedDigest = Buffer.from(expectedHash.toLowerCase(), "hex");

  if (actualDigest.length !== expectedDigest.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualDigest, expectedDigest);
}
