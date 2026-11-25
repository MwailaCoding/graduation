import { RSVP_LIMITS } from "@/lib/event-config";
import { checkRateLimit } from "@/lib/rsvp/rate-limit";
import {
  extractClientKey,
  jsonNoStore,
  readJsonBodyWithLimit,
} from "@/lib/rsvp/request-helpers";
import { createRsvp, getRsvpPublicStatus } from "@/lib/rsvp/service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getRsvpPublicStatus();
    return jsonNoStore(status, 200);
  } catch {
    return jsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to determine RSVP status right now.",
      },
      500,
    );
  }
}

export async function POST(request: Request) {
  try {
    const clientKey = extractClientKey(request);
    const rateLimit = await checkRateLimit("create", clientKey);
    if (!rateLimit.allowed) {
      return jsonNoStore(
        {
          ok: false,
          code: "RATE_LIMITED",
          message:
            "Too many RSVP requests were received. Please wait a moment and try again.",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        429,
        { "Retry-After": String(rateLimit.retryAfterSeconds) },
      );
    }

    const bodyResult = await readJsonBodyWithLimit(
      request,
      RSVP_LIMITS.maxJsonBodyBytes,
    );
    if (!bodyResult.ok) {
      return jsonNoStore(bodyResult.error, bodyResult.status);
    }

    const result = await createRsvp(bodyResult.data);
    return jsonNoStore(result.body, result.status);
  } catch {
    return jsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "We could not process your RSVP right now. Please try again shortly.",
      },
      500,
    );
  }
}
