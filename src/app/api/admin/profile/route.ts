import {
  adminJsonNoStore,
  requireAdminSessionApi,
  requireSameOriginOrRespond,
} from "@/lib/admin/auth";
import { logAdminAuditEvent } from "@/lib/admin/audit";
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/admin/password";
import { revokeOtherAdminSessions } from "@/lib/admin/session";
import { pool } from "@/lib/db";
import { RSVP_LIMITS } from "@/lib/event-config";
import {
  extractClientKey,
  readJsonBodyWithLimit,
} from "@/lib/rsvp/request-helpers";
import { sanitizeTextInput } from "@/lib/rsvp/validation";
import type {
  AdminErrorResponse,
  AdminFieldErrors,
  AdminProfileUpdateResponse,
  AdminSessionResponse,
  AuthenticatedAdmin,
} from "@/types/admin";

export const dynamic = "force-dynamic";

const HAS_LETTER_RE = /\p{L}/u;

interface AdminProfileRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  role: "admin";
  last_login_at: Date | string | null;
  password_updated_at: Date | string;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export async function GET() {
  const auth = await requireAdminSessionApi();
  if ("response" in auth) {
    return auth.response;
  }

  return adminJsonNoStore(
    {
      ok: true,
      admin: auth.session,
    } satisfies AdminSessionResponse,
    200,
  );
}

export async function PATCH(request: Request) {
  const csrfError = requireSameOriginOrRespond(request);
  if (csrfError) {
    return csrfError;
  }

  const auth = await requireAdminSessionApi();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const bodyResult = await readJsonBodyWithLimit(
      request,
      RSVP_LIMITS.maxJsonBodyBytes,
    );
    if (!bodyResult.ok) {
      return adminJsonNoStore(bodyResult.error, bodyResult.status);
    }

    const data = bodyResult.data;
    const hasDisplayName = data.displayName !== undefined;
    const hasPasswordFields =
      data.currentPassword !== undefined ||
      data.newPassword !== undefined ||
      data.confirmPassword !== undefined;

    if (!hasDisplayName && !hasPasswordFields) {
      return adminJsonNoStore(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Provide a display name or password update.",
        } satisfies AdminErrorResponse,
        400,
      );
    }

    const fieldErrors: AdminFieldErrors = {};
    let nextDisplayName = auth.session.displayName;

    if (hasDisplayName) {
      if (typeof data.displayName !== "string") {
        fieldErrors.displayName = "Display name must be a text value.";
      } else {
        const cleaned = sanitizeTextInput(data.displayName).replace(/\s+/g, " ");
        if (cleaned.length < 2 || cleaned.length > 120 || !HAS_LETTER_RE.test(cleaned)) {
          fieldErrors.displayName =
            "Display name must be 2 to 120 characters and include at least one letter.";
        } else {
          nextDisplayName = cleaned;
        }
      }
    }

    const currentPassword =
      typeof data.currentPassword === "string" ? data.currentPassword : "";
    const newPassword =
      typeof data.newPassword === "string" ? data.newPassword : "";
    const confirmPassword =
      typeof data.confirmPassword === "string" ? data.confirmPassword : undefined;

    if (hasPasswordFields) {
      if (!currentPassword) {
        fieldErrors.currentPassword = "Enter your current password.";
      }
      if (!newPassword) {
        fieldErrors.newPassword = "Enter a new password.";
      } else {
        const strength = validatePasswordStrength(newPassword, {
          email: auth.session.email,
          displayName: nextDisplayName,
        });
        if (!strength.valid) {
          fieldErrors.newPassword = strength.errors[0];
        } else if (currentPassword && newPassword === currentPassword) {
          fieldErrors.newPassword =
            "New password must differ from your current password.";
        }
      }
      if (confirmPassword !== undefined && confirmPassword !== newPassword) {
        fieldErrors.confirmPassword = "Password confirmation does not match.";
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      return adminJsonNoStore(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Please review the highlighted profile fields.",
          fieldErrors,
        } satisfies AdminErrorResponse,
        400,
      );
    }

    const userResult = await pool.query<AdminProfileRow>(
      `
      SELECT
        id,
        email,
        display_name,
        password_hash,
        role,
        last_login_at,
        password_updated_at
      FROM admin_users
      WHERE id = $1::uuid
        AND is_active = TRUE
      LIMIT 1
      `,
      [auth.session.adminId],
    );

    const existingUser = userResult.rows[0];
    if (!existingUser) {
      return adminJsonNoStore(
        {
          ok: false,
          code: "UNAUTHENTICATED",
          message: "Authentication is required.",
        } satisfies AdminErrorResponse,
        401,
      );
    }

    let nextPasswordHash: string | null = null;
    if (hasPasswordFields) {
      const currentValid = await verifyPassword(
        currentPassword,
        existingUser.password_hash,
      );
      if (!currentValid) {
        return adminJsonNoStore(
          {
            ok: false,
            code: "VALIDATION_ERROR",
            message: "Current password is incorrect.",
            fieldErrors: {
              currentPassword: "Current password is incorrect.",
            },
          } satisfies AdminErrorResponse,
          400,
        );
      }
      nextPasswordHash = await hashPassword(newPassword);
    }

    const updatedResult = await pool.query<AdminProfileRow>(
      `
      UPDATE admin_users
      SET
        display_name = $1,
        password_hash = COALESCE($2, password_hash),
        password_updated_at = CASE WHEN $2 IS NOT NULL THEN NOW() ELSE password_updated_at END,
        updated_at = NOW()
      WHERE id = $3::uuid
      RETURNING
        id,
        email,
        display_name,
        password_hash,
        role,
        last_login_at,
        password_updated_at
      `,
      [nextDisplayName, nextPasswordHash, auth.session.adminId],
    );

    const updatedUser = updatedResult.rows[0];
    let otherSessionsRevoked = 0;

    if (nextPasswordHash) {
      otherSessionsRevoked = await revokeOtherAdminSessions(
        auth.session.adminId,
        auth.session.sessionId,
      );
    }

    const clientKey = extractClientKey(request);

    if (hasDisplayName && nextDisplayName !== existingUser.display_name) {
      await logAdminAuditEvent({
        actorAdminId: auth.session.adminId,
        actorIdentifier: auth.session.email,
        action: "admin.profile_update",
        targetType: "admin_user",
        targetId: auth.session.adminId,
        summary: "Updated administrator display name",
        metadata: {
          displayNameChanged: true,
        },
        clientKey,
      }).catch(() => {});
    }

    if (nextPasswordHash) {
      await logAdminAuditEvent({
        actorAdminId: auth.session.adminId,
        actorIdentifier: auth.session.email,
        action: "admin.password_change",
        targetType: "admin_user",
        targetId: auth.session.adminId,
        summary: "Changed administrator password and revoked other sessions",
        metadata: {
          otherSessionsRevoked,
        },
        clientKey,
      }).catch(() => {});
    }

    const admin: AuthenticatedAdmin = {
      adminId: updatedUser.id,
      sessionId: auth.session.sessionId,
      email: updatedUser.email,
      displayName: updatedUser.display_name,
      role: updatedUser.role,
      lastLoginAt: updatedUser.last_login_at
        ? toIsoString(updatedUser.last_login_at)
        : null,
      passwordUpdatedAt: toIsoString(updatedUser.password_updated_at),
      sessionExpiresAt: auth.session.sessionExpiresAt,
    };

    return adminJsonNoStore(
      {
        ok: true,
        admin,
        otherSessionsRevoked,
      } satisfies AdminProfileUpdateResponse,
      200,
    );
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to update profile right now. Please try again shortly.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}
