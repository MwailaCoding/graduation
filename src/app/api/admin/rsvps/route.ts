import {
  adminJsonNoStore,
  requireAdminSessionApi,
  requireSameOriginOrRespond,
} from "@/lib/admin/auth";
import { createAdminManualRsvp, listAdminRsvps } from "@/lib/admin/rsvps";
import { RSVP_LIMITS } from "@/lib/event-config";
import {
  extractClientKey,
  readJsonBodyWithLimit,
} from "@/lib/rsvp/request-helpers";
import type { AdminErrorResponse } from "@/types/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminSessionApi();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawParams: Record<string, string> = {};
    for (const [key, value] of searchParams.entries()) {
      rawParams[key] = value;
    }

    const result = await listAdminRsvps(rawParams);
    return adminJsonNoStore(result, 200);
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to load RSVP records right now.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}

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
    const result = await createAdminManualRsvp(bodyResult.data, {
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
      {
        ok: true,
        rsvp: result.rsvp,
      },
      201,
    );
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to create the RSVP record right now.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}
