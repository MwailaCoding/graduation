import {
  adminJsonNoStore,
  requireSameOriginOrRespond,
} from "@/lib/admin/auth";
import { logAdminAuditEvent } from "@/lib/admin/audit";
import {
  verifyDummyPasswordTiming,
  verifyPassword,
} from "@/lib/admin/password";
import {
  createAdminSession,
  setAdminSessionCookie,
} from "@/lib/admin/session";
import { pool } from "@/lib/db";
import { RSVP_LIMITS } from "@/lib/event-config";
import {
  checkRateLimit,
  isRateLimitBlocked,
} from "@/lib/rsvp/rate-limit";
import {
  extractClientKey,
  readJsonBodyWithLimit,
} from "@/lib/rsvp/request-helpers";
import type {
  AdminErrorResponse,
  AdminFieldErrors,
  AdminSessionResponse,
  AuthenticatedAdmin,
} from "@/types/admin";

export const dynamic = "force-dynamic";

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

interface AdminUserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: "admin";
  is_active: boolean;
  last_login_at: Date | string | null;
  password_updated_at: Date | string;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function rateLimitedResponse(retryAfterSeconds: number) {
  return adminJsonNoStore(
    {
      ok: false,
      code: "RATE_LIMITED",
      message:
        "Too many sign-in attempts were received. Please wait before trying again.",
      retryAfterSeconds,
    } satisfies AdminErrorResponse,
    429,
    { "Retry-After": String(retryAfterSeconds) },
  );
}

export async function POST(request: Request) {
  const csrfError = requireSameOriginOrRespond(request);
  if (csrfError) {
    return csrfError;
  }

  try {
    const clientKey = extractClientKey(request);

    const [ipBlock, ipFailBlock] = await Promise.all([
      isRateLimitBlocked("admin_login", clientKey),
      isRateLimitBlocked("admin_login_failed", clientKey),
    ]);

    if (ipFailBlock.blocked) {
      return rateLimitedResponse(ipFailBlock.retryAfterSeconds);
    }
    if (ipBlock.blocked) {
      return rateLimitedResponse(ipBlock.retryAfterSeconds);
    }

    const bodyResult = await readJsonBodyWithLimit(
      request,
      RSVP_LIMITS.maxJsonBodyBytes,
    );
    if (!bodyResult.ok) {
      return adminJsonNoStore(bodyResult.error, bodyResult.status);
    }

    const rawEmail = bodyResult.data.email;
    const rawPassword = bodyResult.data.password;

    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
    const password = typeof rawPassword === "string" ? rawPassword : "";

    if (email) {
      const accountBlock = await isRateLimitBlocked(
        "admin_login_failed",
        `${clientKey}:${email}`,
      );
      if (accountBlock.blocked) {
        return rateLimitedResponse(accountBlock.retryAfterSeconds);
      }
    }

    const loginAttemptLimit = await checkRateLimit("admin_login", clientKey);
    if (!loginAttemptLimit.allowed) {
      return rateLimitedResponse(loginAttemptLimit.retryAfterSeconds);
    }

    const fieldErrors: AdminFieldErrors = {};
    if (!email || email.length > 160 || !EMAIL_FORMAT_RE.test(email)) {
      fieldErrors.email = "Please enter a valid administrator email address.";
    }
    if (!password || password.length > 256) {
      fieldErrors.password = "Please enter your password.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return adminJsonNoStore(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Please provide your administrator email and password.",
          fieldErrors,
        } satisfies AdminErrorResponse,
        400,
      );
    }

    const userResult = await pool.query<AdminUserRow>(
      `
      SELECT
        id,
        email,
        display_name,
        password_hash,
        role,
        is_active,
        last_login_at,
        password_updated_at
      FROM admin_users
      WHERE email = $1
      LIMIT 1
      `,
      [email],
    );

    const user = userResult.rows[0];
    let passwordMatches = false;

    if (!user || !user.is_active || user.role !== "admin") {
      await verifyDummyPasswordTiming(password);
    } else {
      passwordMatches = await verifyPassword(password, user.password_hash);
    }

    if (!user || !user.is_active || user.role !== "admin" || !passwordMatches) {
      const [ipFailLimit, accountFailLimit] = await Promise.all([
        checkRateLimit("admin_login_failed", clientKey),
        checkRateLimit("admin_login_failed", `${clientKey}:${email}`),
      ]);

      await logAdminAuditEvent({
        actorAdminId: user?.id ?? null,
        actorIdentifier: email,
        action: "auth.login.failed",
        targetType: "admin_user",
        targetId: user?.id ?? null,
        summary: "Failed administrator sign-in attempt",
        metadata: {
          reason: !user
            ? "unknown_account"
            : !user.is_active
              ? "inactive_account"
              : "invalid_password",
        },
        clientKey,
      }).catch(() => {});

      if (!ipFailLimit.allowed || !accountFailLimit.allowed) {
        const retryAfter = Math.max(
          ipFailLimit.retryAfterSeconds,
          accountFailLimit.retryAfterSeconds,
          1,
        );
        return rateLimitedResponse(retryAfter);
      }

      return adminJsonNoStore(
        {
          ok: false,
          code: "INVALID_CREDENTIALS",
          message: "Invalid email address or password.",
        } satisfies AdminErrorResponse,
        401,
      );
    }

    const session = await createAdminSession({
      adminUserId: user.id,
      clientKey,
      userAgent: request.headers.get("user-agent"),
    });

    await setAdminSessionCookie(session.rawToken);

    await logAdminAuditEvent({
      actorAdminId: user.id,
      actorIdentifier: user.email,
      action: "auth.login.success",
      targetType: "admin_session",
      targetId: session.sessionId,
      summary: "Administrator signed in",
      metadata: {
        role: user.role,
      },
      clientKey,
    }).catch(() => {});

    const admin: AuthenticatedAdmin = {
      adminId: user.id,
      sessionId: session.sessionId,
      email: user.email,
      displayName: user.display_name,
      role: user.role,
      lastLoginAt: new Date().toISOString(),
      passwordUpdatedAt: toIsoString(user.password_updated_at),
      sessionExpiresAt: session.expiresAt,
    };

    return adminJsonNoStore(
      {
        ok: true,
        admin,
      } satisfies AdminSessionResponse,
      200,
    );
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to sign in right now. Please try again shortly.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}
