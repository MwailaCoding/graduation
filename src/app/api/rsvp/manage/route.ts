import { RSVP_LIMITS } from "@/lib/event-config";
import {
  checkRateLimit,
  isRateLimitBlocked,
} from "@/lib/rsvp/rate-limit";
import {
  extractBearerOrHeaderToken,
  extractClientKey,
  jsonNoStore,
  readJsonBodyWithLimit,
} from "@/lib/rsvp/request-helpers";
import { getRsvpByToken, updateRsvpByToken } from "@/lib/rsvp/service";
import { isValidTokenFormat } from "@/lib/rsvp/tokens";
import type { RsvpErrorResponse } from "@/types/rsvp";

export const dynamic = "force-dynamic";

const INVALID_TOKEN_ERROR: RsvpErrorResponse = {
  ok: false,
  code: "INVALID_TOKEN",
  message: "This RSVP management link is invalid or no longer available.",
};

function rateLimitedResponse(retryAfterSeconds: number) {
  return jsonNoStore(
    {
      ok: false,
      code: "RATE_LIMITED",
      message:
        "Too many management requests were received. Please wait a moment and try again.",
      retryAfterSeconds,
    } satisfies RsvpErrorResponse,
    429,
    { "Retry-After": String(retryAfterSeconds) },
  );
}

async function recordFailedManageAttempt(clientKey: string) {
  const failedLimit = await checkRateLimit("manage_failed", clientKey);
  if (!failedLimit.allowed) {
    return rateLimitedResponse(failedLimit.retryAfterSeconds);
  }
  return jsonNoStore(INVALID_TOKEN_ERROR, 404);
}

export async function GET(request: Request) {
  try {
    const clientKey = extractClientKey(request);

    const failedBlock = await isRateLimitBlocked("manage_failed", clientKey);
    if (failedBlock.blocked) {
      return rateLimitedResponse(failedBlock.retryAfterSeconds);
    }

    const readLimit = await checkRateLimit("manage_read", clientKey);
    if (!readLimit.allowed) {
      return rateLimitedResponse(readLimit.retryAfterSeconds);
    }

    const token = extractBearerOrHeaderToken(request);
    if (!token || !isValidTokenFormat(token)) {
      return await recordFailedManageAttempt(clientKey);
    }

    const result = await getRsvpByToken(token);
    if (!result.ok) {
      if (result.error.code === "INVALID_TOKEN") {
        return await recordFailedManageAttempt(clientKey);
      }
      return jsonNoStore(result.error, result.status);
    }

    return jsonNoStore(result.data, 200);
  } catch {
    return jsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to load your RSVP right now. Please try again shortly.",
      } satisfies RsvpErrorResponse,
      500,
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const clientKey = extractClientKey(request);

    const failedBlock = await isRateLimitBlocked("manage_failed", clientKey);
    if (failedBlock.blocked) {
      return rateLimitedResponse(failedBlock.retryAfterSeconds);
    }

    const updateLimit = await checkRateLimit("manage_update", clientKey);
    if (!updateLimit.allowed) {
      return rateLimitedResponse(updateLimit.retryAfterSeconds);
    }

    const token = extractBearerOrHeaderToken(request);
    if (!token || !isValidTokenFormat(token)) {
      return await recordFailedManageAttempt(clientKey);
    }

    const bodyResult = await readJsonBodyWithLimit(
      request,
      RSVP_LIMITS.maxJsonBodyBytes,
    );
    if (!bodyResult.ok) {
      return jsonNoStore(bodyResult.error, bodyResult.status);
    }

    const result = await updateRsvpByToken(token, bodyResult.data);
    if (!result.body.ok && result.body.code === "INVALID_TOKEN") {
      return await recordFailedManageAttempt(clientKey);
    }

    return jsonNoStore(result.body, result.status);
  } catch {
    return jsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "We could not update your RSVP right now. Please try again shortly.",
      } satisfies RsvpErrorResponse,
      500,
    );
  }
}
