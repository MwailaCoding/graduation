import {
  adminJsonNoStore,
  requireAdminSessionApi,
  requireSameOriginOrRespond,
} from "@/lib/admin/auth";
import { logAdminAuditEvent } from "@/lib/admin/audit";
import {
  clearAdminSessionCookie,
  revokeAdminSessionById,
} from "@/lib/admin/session";
import { extractClientKey } from "@/lib/rsvp/request-helpers";
import type { AdminErrorResponse } from "@/types/admin";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const csrfError = requireSameOriginOrRespond(request);
  if (csrfError) {
    return csrfError;
  }

  const auth = await requireAdminSessionApi();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const clientKey = extractClientKey(request);

    await revokeAdminSessionById(auth.session.sessionId);
    await clearAdminSessionCookie();

    await logAdminAuditEvent({
      actorAdminId: auth.session.adminId,
      actorIdentifier: auth.session.email,
      action: "auth.logout",
      targetType: "admin_session",
      targetId: auth.session.sessionId,
      summary: "Administrator signed out",
      clientKey,
    }).catch(() => {});

    return adminJsonNoStore({ ok: true }, 200);
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to sign out right now. Please try again shortly.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}
