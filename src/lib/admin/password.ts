import crypto from "node:crypto";

const SCRYPT_SALT_BYTES = 16;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_OPTIONS = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
} as const;

const COMMON_WEAK_PASSWORDS = new Set([
  "password",
  "password123",
  "password123!",
  "admin123456",
  "admin123456!",
  "qwerty123456",
  "qwerty123456!",
  "123456789012",
  "mwaila2026",
  "mwaila2026!",
  "changeme123!",
  "letmein12345!",
  "welcome12345!",
]);

const DUMMY_SCRYPT_SALT = Buffer.from("00112233445566778899aabbccddeeff", "hex");

export interface PasswordValidationContext {
  email?: string;
  displayName?: string;
}

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLen: number,
  options: crypto.ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLen, options, (err, derivedKey) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(derivedKey);
    });
  });
}

/**
 * Validates strong password policy for administrator accounts.
 * Pure Node-compatible implementation (shared by Next.js routes, CLI bootstrapper, and unit tests).
 */
export function validatePasswordStrength(
  password: unknown,
  context?: PasswordValidationContext,
): PasswordValidationResult {
  const errors: string[] = [];

  if (typeof password !== "string") {
    return {
      valid: false,
      errors: ["Password must be a text value."],
    };
  }

  if (password.length < 12) {
    errors.push("Password must be at least 12 characters long.");
  }

  if (password.length > 128) {
    errors.push("Password must be 128 characters or fewer.");
  }

  if (password !== password.trim()) {
    errors.push("Password must not begin or end with spaces.");
  }

  if (/[\u0000-\u001F\u007F]/.test(password)) {
    errors.push("Password contains unsupported control characters.");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must include at least one lowercase letter.");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must include at least one uppercase letter.");
  }

  if (!/[0-9]/.test(password)) {
    errors.push("Password must include at least one number.");
  }

  if (!/[^A-Za-z0-9\s]/.test(password)) {
    errors.push("Password must include at least one special character.");
  }

  const lower = password.toLowerCase();
  if (COMMON_WEAK_PASSWORDS.has(lower)) {
    errors.push("Password is too common; choose a stronger unique passphrase.");
  }

  if (context?.email) {
    const emailLower = context.email.trim().toLowerCase();
    const localPart = emailLower.split("@")[0] ?? "";
    if (emailLower.length >= 3 && lower.includes(emailLower)) {
      errors.push("Password must not contain your email address.");
    } else if (localPart.length >= 3 && lower.includes(localPart)) {
      errors.push("Password must not contain part of your email address.");
    }
  }

  if (context?.displayName) {
    const words = context.displayName
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3);
    for (const word of words) {
      if (lower.includes(word)) {
        errors.push("Password must not contain words from your display name.");
        break;
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Hashes a password with Node's `crypto.scrypt` using a 16-byte random salt
 * and 64-byte derived key, formatted as `scrypt$<saltHex>$<hashHex>`.
 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length === 0 || password.length > 128) {
    throw new Error("Password must be between 1 and 128 characters.");
  }

  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES);
  const derived = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/**
 * Verifies a candidate password against a stored `scrypt$<saltHex>$<hashHex>` string
 * using constant-time comparison.
 */
export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  if (
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > 128 ||
    typeof storedHash !== "string"
  ) {
    return false;
  }

  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const saltHex = parts[1];
  const hashHex = parts[2];

  if (
    !saltHex ||
    !hashHex ||
    saltHex.length < 32 ||
    saltHex.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(saltHex) ||
    !/^[0-9a-f]{128}$/i.test(hashHex)
  ) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");

  const derived = await scryptAsync(password, salt, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS);
  if (derived.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(derived, expected);
}

/**
 * Performs a dummy scrypt derivation so login responses for non-existent emails
 * take comparable CPU time to real password checks.
 */
export async function verifyDummyPasswordTiming(password: string): Promise<void> {
  const sample = typeof password === "string" && password.length > 0
    ? password.slice(0, 128)
    : "dummy-password-check";
  await scryptAsync(sample, DUMMY_SCRYPT_SALT, SCRYPT_KEY_LENGTH, SCRYPT_OPTIONS);
}
