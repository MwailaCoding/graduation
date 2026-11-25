import "server-only";
import crypto from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import type { AuthenticatedAdmin } from "@/types/admin";

export const ADMIN_SESSION_COOKIE_NAME = "mwaila_admin_session";
const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_ABSOLUTE_MAX_SECONDS = 24 * 60 * 60;
const SLIDING_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
const DEFAULT_PEPPER = "mwaila-rsvp-v1-bucket-salt";

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export function hashSessionToken(rawToken: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim();
  if (secret && secret.length > 0) {
    return crypto
      .createHmac("sha256", secret)
      .update(rawToken, "utf8")
      .digest("hex");
  }
  return crypto.createHash("sha256").update(rawToken, "utf8").digest("hex");
}

function hashSessionIp(clientKey?: string | null): string | null {
  const trimmed = typeof clientKey === "string" ? clientKey.trim() : "";
  if (!trimmed) {
    return null;
  }
  const pepper = process.env.RATE_LIMIT_PEPPER?.trim() || DEFAULT_PEPPER;
  return crypto
    .createHmac("sha256", pepper)
    .update(`session-ip:${trimmed}`, "utf8")
    .digest("hex");
}

function summarizeUserAgent(userAgent?: string | null): string | null {
  if (typeof userAgent !== "string") {
    return null;
  }
  const cleaned = userAgent.replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  if (!cleaned) {
    return null;
  }
  return cleaned.slice(0, 255);
}

export function getAdminCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  };
}

export async function setAdminSessionCookie(rawToken: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, rawToken, {
    ...getAdminCookieOptions(),
    maxAge: SESSION_ABSOLUTE_MAX_SECONDS,
  });
}

export async function clearAdminSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, "", {
    ...getAdminCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  });
}

export async function createAdminSession(input: {
  adminUserId: string;
  clientKey?: string | null;
  userAgent?: string | null;
}): Promise<{ sessionId: string; rawToken: string; expiresAt: string }> {
  const rawToken = crypto.randomBytes(SESSION_TOKEN_BYTES).toString("base64url");
  const tokenHash = hashSessionToken(rawToken);
  const ipHash = hashSessionIp(input.clientKey);
  const uaSummary = summarizeUserAgent(input.userAgent);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const insertResult = await client.query<{
      id: string;
      expires_at: Date | string;
    }>(
      `
      INSERT INTO admin_sessions (
        admin_user_id,
        session_token_hash,
        expires_at,
        user_agent_summary,
        ip_hash
      ) VALUES (
        $1::uuid,
        $2,
        NOW() + INTERVAL '8 hours',
        $3,
        $4
      )
      RETURNING id, expires_at
      `,
      [input.adminUserId, tokenHash, uaSummary, ipHash],
    );

    await client.query(
      `
      UPDATE admin_users
      SET last_login_at = NOW(), updated_at = NOW()
      WHERE id = $1::uuid
      `,
      [input.adminUserId],
    );

    await client.query(
      `
      DELETE FROM admin_sessions
      WHERE (expires_at < NOW() - INTERVAL '7 days')
         OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '7 days')
      `,
    );

    await client.query("COMMIT");

    const row = insertResult.rows[0];
    return {
      sessionId: row.id,
      rawToken,
      expiresAt: toIsoString(row.expires_at),
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

interface VerifiedSessionRow {
  session_id: string;
  expires_at: Date | string;
  last_seen_at: Date | string;
  admin_id: string;
  email: string;
  display_name: string;
  role: "admin";
  last_login_at: Date | string | null;
  password_updated_at: Date | string;
}

async function verifyAdminSessionUncached(): Promise<AuthenticatedAdmin | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (typeof rawToken !== "string" || !SESSION_TOKEN_PATTERN.test(rawToken)) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);

  const result = await pool.query<VerifiedSessionRow>(
    `
    SELECT
      s.id AS session_id,
      s.expires_at,
      s.last_seen_at,
      u.id AS admin_id,
      u.email,
      u.display_name,
      u.role,
      u.last_login_at,
      u.password_updated_at
    FROM admin_sessions s
    INNER JOIN admin_users u ON u.id = s.admin_user_id
    WHERE s.session_token_hash = $1
      AND s.revoked_at IS NULL
      AND s.expires_at > NOW()
      AND s.created_at + INTERVAL '24 hours' > NOW()
      AND u.is_active = TRUE
      AND u.role = 'admin'
    LIMIT 1
    `,
    [tokenHash],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  let effectiveExpiresAt = toIsoString(row.expires_at);
  const lastSeenMs = new Date(row.last_seen_at).getTime();

  if (
    Number.isFinite(lastSeenMs) &&
    Date.now() - lastSeenMs >= SLIDING_REFRESH_THRESHOLD_MS
  ) {
    const refreshResult = await pool.query<{ expires_at: Date | string }>(
      `
      UPDATE admin_sessions
      SET
        last_seen_at = NOW(),
        expires_at = LEAST(NOW() + INTERVAL '8 hours', created_at + INTERVAL '24 hours')
      WHERE id = $1::uuid
        AND revoked_at IS NULL
      RETURNING expires_at
      `,
      [row.session_id],
    );
    if (refreshResult.rows[0]) {
      effectiveExpiresAt = toIsoString(refreshResult.rows[0].expires_at);
    }
  }

  return {
    adminId: row.admin_id,
    sessionId: row.session_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    lastLoginAt: row.last_login_at ? toIsoString(row.last_login_at) : null,
    passwordUpdatedAt: toIsoString(row.password_updated_at),
    sessionExpiresAt: effectiveExpiresAt,
  };
}

export const verifyAdminSession = cache(verifyAdminSessionUncached);

export async function revokeAdminSessionById(sessionId: string): Promise<void> {
  await pool.query(
    `
    UPDATE admin_sessions
    SET revoked_at = NOW()
    WHERE id = $1::uuid
      AND revoked_at IS NULL
    `,
    [sessionId],
  );
}

export async function revokeOtherAdminSessions(
  adminUserId: string,
  keepSessionId: string,
): Promise<number> {
  const result = await pool.query(
    `
    UPDATE admin_sessions
    SET revoked_at = NOW()
    WHERE admin_user_id = $1::uuid
      AND id <> $2::uuid
      AND revoked_at IS NULL
    `,
    [adminUserId, keepSessionId],
  );
  return result.rowCount ?? 0;
}

export async function revokeAllAdminSessions(
  adminUserId: string,
): Promise<number> {
  const result = await pool.query(
    `
    UPDATE admin_sessions
    SET revoked_at = NOW()
    WHERE admin_user_id = $1::uuid
      AND revoked_at IS NULL
    `,
    [adminUserId],
  );
  return result.rowCount ?? 0;
}
