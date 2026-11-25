import {
  adminJsonNoStore,
  requireAdminSessionApi,
  requireSameOriginOrRespond,
} from "@/lib/admin/auth";
import { resolveDuplicateGroup } from "@/lib/admin/rsvps";
import { RSVP_LIMITS } from "@/lib/event-config";
import {
  extractClientKey,
  readJsonBodyWithLimit,
} from "@/lib/rsvp/request-helpers";
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
    const bodyResult = await readJsonBodyWithLimit(
      request,
      RSVP_LIMITS.maxJsonBodyBytes,
    );
    if (!bodyResult.ok) {
      return adminJsonNoStore(bodyResult.error, bodyResult.status);
    }

    const clientKey = extractClientKey(request);
    const result = await resolveDuplicateGroup(bodyResult.data, {
      adminId: auth.session.adminId,
      email: auth.session.email,
      clientKey,
    });

    if (!result.ok) {
      return adminJsonNoStore(
        {
          ok: false,
          code: result.code,
          message: result.message,
          ...(result.fieldErrors ? { fieldErrors: result.fieldErrors } : {}),
        } satisfies AdminErrorResponse,
        result.status,
      );
    }

    return adminJsonNoStore(
      { ok: true, updatedCount: result.updatedCount },
      200,
    );
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to resolve duplicate records right now.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}
