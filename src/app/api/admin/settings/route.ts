import {
  adminJsonNoStore,
  requireAdminSessionApi,
  requireSameOriginOrRespond,
} from "@/lib/admin/auth";
import {
  ADMIN_LOCKED_EVENT_DETAILS,
  getEffectiveRsvpPolicy,
  getEventSettingsState,
  getSafeSystemHealth,
  runRetentionAnonymization,
  updateEventSettingsPolicy,
} from "@/lib/admin/settings";
import { RSVP_LIMITS } from "@/lib/event-config";
import {
  extractClientKey,
  readJsonBodyWithLimit,
} from "@/lib/rsvp/request-helpers";
import { getRetentionSummary } from "@/lib/rsvp/retention";
import type {
  AdminErrorResponse,
  AdminSettingsResponse,
  AdminSettingsUpdateInput,
} from "@/types/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminSessionApi();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const [settings, effectivePolicy, retentionSummary, systemHealth] =
      await Promise.all([
        getEventSettingsState(),
        getEffectiveRsvpPolicy(),
        getRetentionSummary(),
        getSafeSystemHealth(),
      ]);

    return adminJsonNoStore(
      {
        ok: true,
        eventDetails: ADMIN_LOCKED_EVENT_DETAILS,
        settings,
        effectivePolicy,
        retentionSummary,
        systemHealth,
      } satisfies AdminSettingsResponse,
      200,
    );
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to load settings right now.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
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

    const clientKey = extractClientKey(request);
    const data = bodyResult.data as AdminSettingsUpdateInput & Record<string, unknown>;

    if (data.action !== undefined) {
      if (data.action !== "run_retention") {
        return adminJsonNoStore(
          {
            ok: false,
            code: "VALIDATION_ERROR",
            message: "Unsupported settings action.",
            fieldErrors: {
              action: "Supported action is 'run_retention'.",
            },
          } satisfies AdminErrorResponse,
          400,
        );
      }

      const [retentionOutcome, settings, effectivePolicy, systemHealth] =
        await Promise.all([
          runRetentionAnonymization({
            adminId: auth.session.adminId,
            email: auth.session.email,
            clientKey,
          }),
          getEventSettingsState(),
          getEffectiveRsvpPolicy(),
          getSafeSystemHealth(),
        ]);

      return adminJsonNoStore(
        {
          ok: true,
          eventDetails: ADMIN_LOCKED_EVENT_DETAILS,
          settings,
          effectivePolicy,
          retentionSummary: retentionOutcome.retentionSummary,
          systemHealth,
          retentionRunResult: retentionOutcome.result,
        } satisfies AdminSettingsResponse,
        200,
      );
    }

    const updateResult = await updateEventSettingsPolicy(
      {
        rsvpAcceptingResponses: data.rsvpAcceptingResponses,
        allowGuestSelfEditing: data.allowGuestSelfEditing,
        closureDeadlineIso: data.closureDeadlineIso,
        manualOverrideReason: data.manualOverrideReason,
      },
      {
        adminId: auth.session.adminId,
        email: auth.session.email,
        clientKey,
      },
    );

    if (!updateResult.ok) {
      return adminJsonNoStore(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: updateResult.message,
          fieldErrors: updateResult.fieldErrors,
        } satisfies AdminErrorResponse,
        400,
      );
    }

    const [retentionSummary, systemHealth] = await Promise.all([
      getRetentionSummary(),
      getSafeSystemHealth(),
    ]);

    return adminJsonNoStore(
      {
        ok: true,
        eventDetails: ADMIN_LOCKED_EVENT_DETAILS,
        settings: updateResult.settings,
        effectivePolicy: updateResult.effectivePolicy,
        retentionSummary,
        systemHealth,
      } satisfies AdminSettingsResponse,
      200,
    );
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to update settings right now.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}
