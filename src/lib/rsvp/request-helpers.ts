import { NextResponse } from "next/server";
import { RSVP_LIMITS } from "@/lib/event-config";
import type { RsvpErrorResponse } from "@/types/rsvp";

export type ReadJsonBodyResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; error: RsvpErrorResponse };

/**
 * Safely reads and parses a JSON object request body while strictly enforcing
 * the configured maximum payload size in bytes.
 */
export async function readJsonBodyWithLimit(
  request: Request,
  maxBytes: number = RSVP_LIMITS.maxJsonBodyBytes,
): Promise<ReadJsonBodyResult> {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const declaredLength = Number(contentLengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return {
        ok: false,
        status: 413,
        error: {
          ok: false,
          code: "PAYLOAD_TOO_LARGE",
          message: "Request payload exceeds the maximum allowed size.",
        },
      };
    }
  }

  if (!request.body) {
    return {
      ok: false,
      status: 400,
      error: {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Request body is required and must be valid JSON.",
      },
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => {});
        return {
          ok: false,
          status: 413,
          error: {
            ok: false,
            code: "PAYLOAD_TOO_LARGE",
            message: "Request payload exceeds the maximum allowed size.",
          },
        };
      }
      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      status: 400,
      error: {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Unable to read the request body.",
      },
    };
  }

  if (totalBytes === 0) {
    return {
      ok: false,
      status: 400,
      error: {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Request body cannot be empty.",
      },
    };
  }

  const combined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const rawText = new TextDecoder("utf-8", { fatal: false }).decode(combined);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      status: 400,
      error: {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Invalid JSON request body.",
      },
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      status: 400,
      error: {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Request body must be a JSON object.",
      },
    };
  }

  return {
    ok: true,
    data: parsed as Record<string, unknown>,
  };
}

/**
 * Extracts a client identifier from an HTTP Header collection for keyed rate
 * limiting. Never logged or stored in raw form.
 */
export function extractClientKeyFromHeaders(headerList: Headers): string {
  const forwardedFor = headerList.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = headerList.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "anonymous-client";
}

/**
 * Extracts a client identifier for keyed rate limiting. Never logged or stored
 * in raw form.
 */
export function extractClientKey(request: Request): string {
  return extractClientKeyFromHeaders(request.headers);
}

/**
 * Extracts a management token from either `Authorization: Bearer <token>` or
 * the `x-rsvp-token` request header.
 */
export function extractBearerOrHeaderToken(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    const bearerToken = bearerMatch?.[1]?.trim();
    if (bearerToken) {
      return bearerToken;
    }
  }

  const headerToken = request.headers.get("x-rsvp-token")?.trim();
  if (headerToken) {
    return headerToken;
  }

  return null;
}

/**
 * Builds a JSON response with strict no-store privacy and caching headers.
 */
export function jsonNoStore(
  body: unknown,
  status: number,
  extraHeaders?: Record<string, string>,
): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      Pragma: "no-cache",
      "Referrer-Policy": "no-referrer",
      ...extraHeaders,
    },
  });
}
