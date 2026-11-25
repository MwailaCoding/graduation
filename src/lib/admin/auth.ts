import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { verifyAdminSession } from "@/lib/admin/session";
import { jsonNoStore } from "@/lib/rsvp/request-helpers";
import type { AdminErrorResponse, AuthenticatedAdmin } from "@/types/admin";

const SAFE_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function adminJsonNoStore(
  body: unknown,
  status: number,
  extraHeaders?: Record<string, string>,
): NextResponse {
  return jsonNoStore(body, status, {
    "X-Robots-Tag": "noindex, nofollow",
    ...extraHeaders,
  });
}

export async function requireAdminSessionApi(): Promise<
  { session: AuthenticatedAdmin } | { response: NextResponse }
> {
  const session = await verifyAdminSession();
  if (!session) {
    return {
      response: adminJsonNoStore(
        {
          ok: false,
          code: "UNAUTHENTICATED",
          message: "Authentication is required.",
        } satisfies AdminErrorResponse,
        401,
      ),
    };
  }
  return { session };
}

export async function requireAdminSessionPage(): Promise<AuthenticatedAdmin> {
  const session = await verifyAdminSession();
  if (!session) {
    redirect("/admin/login");
  }
  return session;
}

/**
 * Enforces same-origin protection on state-changing admin requests (`POST`,
 * `PATCH`, `PUT`, `DELETE`).
 *
 * - Rejects `Sec-Fetch-Site: cross-site`.
 * - Verifies `Origin` (or `Referer` if `Origin` is absent) matches `Host` /
 *   `X-Forwarded-Host` (and `X-Forwarded-Proto` when present).
 * - Permits requests where both `Origin` and `Referer` are absent (and
 *   `Sec-Fetch-Site` is not `cross-site`) so non-browser `fetch()`/`curl` API
 *   clients continue to function alongside `SameSite=Lax` cookies.
 */
export function assertSameOriginMutation(request: Request): boolean {
  if (SAFE_HTTP_METHODS.has(request.method.toUpperCase())) {
    return true;
  }

  const secFetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (secFetchSite === "cross-site") {
    return false;
  }

  const expectedHost = (
    request.headers.get("x-forwarded-host")?.split(",")[0] ??
    request.headers.get("host") ??
    ""
  )
    .trim()
    .toLowerCase();

  if (!expectedHost) {
    return false;
  }

  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim()
    .toLowerCase();

  const originHeader = request.headers.get("origin");
  if (originHeader !== null) {
    const trimmedOrigin = originHeader.trim();
    if (!trimmedOrigin || trimmedOrigin.toLowerCase() === "null") {
      return false;
    }
    try {
      const parsedOrigin = new URL(trimmedOrigin);
      if (parsedOrigin.host.toLowerCase() !== expectedHost) {
        return false;
      }
      if (
        (forwardedProto === "http" || forwardedProto === "https") &&
        parsedOrigin.protocol !== `${forwardedProto}:`
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  const refererHeader = request.headers.get("referer");
  if (refererHeader !== null) {
    const trimmedReferer = refererHeader.trim();
    if (!trimmedReferer) {
      return false;
    }
    try {
      const parsedReferer = new URL(trimmedReferer);
      if (parsedReferer.host.toLowerCase() !== expectedHost) {
        return false;
      }
      if (
        (forwardedProto === "http" || forwardedProto === "https") &&
        parsedReferer.protocol !== `${forwardedProto}:`
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  return true;
}

export function requireSameOriginOrRespond(
  request: Request,
): NextResponse | null {
  if (!assertSameOriginMutation(request)) {
    return adminJsonNoStore(
      {
        ok: false,
        code: "CSRF_REJECTED",
        message: "Cross-origin mutation request rejected.",
      } satisfies AdminErrorResponse,
      403,
    );
  }
  return null;
}
