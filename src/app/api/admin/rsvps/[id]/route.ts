import {
  adminJsonNoStore,
  requireAdminSessionApi,
  requireSameOriginOrRespond,
} from "@/lib/admin/auth";
import {
  deleteAdminRsvp,
  getAdminRsvpById,
  updateAdminRsvp,
} from "@/lib/admin/rsvps";
import { RSVP_LIMITS } from "@/lib/event-config";
import {
  extractClientKey,
  readJsonBodyWithLimit,
} from "@/lib/rsvp/request-helpers";
import type { AdminErrorResponse } from "@/types/admin";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminSessionApi();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    const rsvp = await getAdminRsvpById(id);
    if (!rsvp) {
      return adminJsonNoStore(
        {
          ok: false,
          code: "NOT_FOUND",
          message: "RSVP record not found.",
        } satisfies AdminErrorResponse,
        404,
      );
    }

    return adminJsonNoStore({ ok: true, rsvp }, 200);
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to load the RSVP record right now.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const csrfError = requireSameOriginOrRespond(request);
  if (csrfError) {
    return csrfError;
  }

  const auth = await requireAdminSessionApi();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    const bodyResult = await readJsonBodyWithLimit(
      request,
      RSVP_LIMITS.maxJsonBodyBytes,
    );
    if (!bodyResult.ok) {
      return adminJsonNoStore(bodyResult.error, bodyResult.status);
    }

    const clientKey = extractClientKey(request);
    const result = await updateAdminRsvp(id, bodyResult.data, {
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

    return adminJsonNoStore({ ok: true, rsvp: result.rsvp }, 200);
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to update the RSVP record right now.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const csrfError = requireSameOriginOrRespond(request);
  if (csrfError) {
    return csrfError;
  }

  const auth = await requireAdminSessionApi();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { id } = await context.params;
    const bodyResult = await readJsonBodyWithLimit(
      request,
      RSVP_LIMITS.maxJsonBodyBytes,
    );
    if (!bodyResult.ok) {
      return adminJsonNoStore(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message:
            "Deletion requires explicit confirmation ({ confirmDelete: true }).",
        } satisfies AdminErrorResponse,
        400,
      );
    }

    if (bodyResult.data.confirmDelete !== true) {
      return adminJsonNoStore(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message:
            "Deletion requires explicit confirmation ({ confirmDelete: true }).",
          fieldErrors: {
            confirmDelete: "Please confirm deletion before proceeding.",
          },
        } satisfies AdminErrorResponse,
        400,
      );
    }

    const clientKey = extractClientKey(request);
    const result = await deleteAdminRsvp(id, {
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
        } satisfies AdminErrorResponse,
        result.status,
      );
    }

    return adminJsonNoStore(
      { ok: true, deletedId: result.deletedId },
      200,
    );
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to delete the RSVP record right now.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}
