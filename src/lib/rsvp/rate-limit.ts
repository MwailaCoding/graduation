import crypto from "node:crypto";
import { pool } from "@/lib/db";

export type RateLimitScope =
  | "create"
  | "manage_read"
  | "manage_update"
  | "manage_failed"
  | "admin_login"
  | "admin_login_failed";

interface RateLimitPolicy {
  windowSeconds: number;
  maxRequests: number;
  blockSeconds: number;
}

const RATE_LIMIT_POLICIES: Record<RateLimitScope, RateLimitPolicy> = {
  create: {
    windowSeconds: 15 * 60,
    maxRequests: 10,
    blockSeconds: 15 * 60,
  },
  manage_read: {
    windowSeconds: 15 * 60,
    maxRequests: 30,
    blockSeconds: 15 * 60,
  },
  manage_update: {
    windowSeconds: 15 * 60,
    maxRequests: 15,
    blockSeconds: 15 * 60,
  },
  manage_failed: {
    windowSeconds: 15 * 60,
    maxRequests: 10,
    blockSeconds: 15 * 60,
  },
  admin_login: {
    windowSeconds: 15 * 60,
    maxRequests: 20,
    blockSeconds: 15 * 60,
  },
  admin_login_failed: {
    windowSeconds: 15 * 60,
    maxRequests: 5,
    blockSeconds: 15 * 60,
  },
};

const DEFAULT_RATE_LIMIT_PEPPER = "mwaila-rsvp-v1-bucket-salt";

function getRateLimitPepper(): string {
  const configured = process.env.RATE_LIMIT_PEPPER?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_RATE_LIMIT_PEPPER;
}

function computeBucketKey(scope: RateLimitScope, clientKey: string): string {
  const normalizedClient = clientKey.trim() || "anonymous-client";
  return crypto
    .createHmac("sha256", getRateLimitPepper())
    .update(`${scope}:${normalizedClient}`, "utf8")
    .digest("hex");
}

async function purgeExpiredRateLimitBuckets(): Promise<void> {
  await pool.query("DELETE FROM rsvp_rate_limits WHERE expires_at < NOW()");
}

/**
 * Checks if a rate-limit bucket is currently in an active block window without
 * incrementing its counter. Useful for pre-checking `manage_failed` lockouts.
 */
export async function isRateLimitBlocked(
  scope: RateLimitScope,
  clientKey: string,
): Promise<{ blocked: boolean; retryAfterSeconds: number }> {
  const bucketKey = computeBucketKey(scope, clientKey);
  const result = await pool.query<{ retry_after_seconds: number }>(
    `
    SELECT
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (blocked_until - NOW())))::int) AS retry_after_seconds
    FROM rsvp_rate_limits
    WHERE bucket_key = $1
      AND blocked_until IS NOT NULL
      AND blocked_until > NOW()
    LIMIT 1
    `,
    [bucketKey],
  );

  const row = result.rows[0];
  if (!row) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  return {
    blocked: true,
    retryAfterSeconds: row.retry_after_seconds,
  };
}

/**
 * Atomically records a request against a keyed HMAC-SHA256 rate-limit bucket
 * in PostgreSQL without storing any raw IP addresses or client identifiers.
 */
export async function checkRateLimit(
  scope: RateLimitScope,
  clientKey: string,
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const policy = RATE_LIMIT_POLICIES[scope];
  const bucketKey = computeBucketKey(scope, clientKey);

  await purgeExpiredRateLimitBuckets();

  const result = await pool.query<{
    allowed: boolean;
    retry_after_seconds: number;
  }>(
    `
    INSERT INTO rsvp_rate_limits (
      bucket_key,
      scope,
      window_started_at,
      request_count,
      blocked_until,
      expires_at
    ) VALUES (
      $1,
      $2,
      NOW(),
      1,
      NULL,
      NOW() + make_interval(secs => $3)
    )
    ON CONFLICT (bucket_key) DO UPDATE SET
      scope = EXCLUDED.scope,
      window_started_at = CASE
        WHEN rsvp_rate_limits.blocked_until IS NOT NULL
          AND rsvp_rate_limits.blocked_until > NOW()
          THEN rsvp_rate_limits.window_started_at
        WHEN rsvp_rate_limits.window_started_at + make_interval(secs => $3) <= NOW()
          THEN NOW()
        ELSE rsvp_rate_limits.window_started_at
      END,
      request_count = CASE
        WHEN rsvp_rate_limits.blocked_until IS NOT NULL
          AND rsvp_rate_limits.blocked_until > NOW()
          THEN rsvp_rate_limits.request_count + 1
        WHEN rsvp_rate_limits.window_started_at + make_interval(secs => $3) <= NOW()
          THEN 1
        ELSE rsvp_rate_limits.request_count + 1
      END,
      blocked_until = CASE
        WHEN rsvp_rate_limits.blocked_until IS NOT NULL
          AND rsvp_rate_limits.blocked_until > NOW()
          THEN rsvp_rate_limits.blocked_until
        WHEN rsvp_rate_limits.window_started_at + make_interval(secs => $3) <= NOW()
          THEN NULL
        WHEN rsvp_rate_limits.request_count + 1 > $4
          THEN NOW() + make_interval(secs => $5)
        ELSE NULL
      END,
      expires_at = CASE
        WHEN rsvp_rate_limits.blocked_until IS NOT NULL
          AND rsvp_rate_limits.blocked_until > NOW()
          THEN GREATEST(rsvp_rate_limits.expires_at, rsvp_rate_limits.blocked_until)
        WHEN rsvp_rate_limits.window_started_at + make_interval(secs => $3) <= NOW()
          THEN NOW() + make_interval(secs => $3)
        WHEN rsvp_rate_limits.request_count + 1 > $4
          THEN GREATEST(
            rsvp_rate_limits.window_started_at + make_interval(secs => $3),
            NOW() + make_interval(secs => $5)
          )
        ELSE rsvp_rate_limits.window_started_at + make_interval(secs => $3)
      END
    RETURNING
      (blocked_until IS NULL OR blocked_until <= NOW()) AS allowed,
      CASE
        WHEN blocked_until IS NOT NULL AND blocked_until > NOW()
          THEN GREATEST(1, CEIL(EXTRACT(EPOCH FROM (blocked_until - NOW())))::int)
        ELSE 0
      END AS retry_after_seconds
    `,
    [
      bucketKey,
      scope,
      policy.windowSeconds,
      policy.maxRequests,
      policy.blockSeconds,
    ],
  );

  const row = result.rows[0];
  return {
    allowed: row?.allowed === true,
    retryAfterSeconds: row?.retry_after_seconds ?? 0,
  };
}
