import { NextResponse, type NextRequest } from "next/server";

const ADMIN_SESSION_COOKIE_NAME = "mwaila_admin_session";
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const ADMIN_SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store, private",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function applyAdminHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(ADMIN_SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname === "/admin/register" ||
    pathname === "/admin/signup" ||
    pathname === "/admin/bootstrap" ||
    pathname === "/api/admin/register" ||
    pathname === "/api/admin/auth/register" ||
    pathname === "/api/admin/signup" ||
    pathname === "/api/admin/bootstrap" ||
    pathname === "/api/admin/users"
  ) {
    return applyAdminHeaders(
      NextResponse.json(
        {
          ok: false,
          code: "NOT_FOUND",
          message: "Not found.",
        },
        { status: 404 },
      ),
    );
  }

  if (pathname === "/admin/login" || pathname === "/api/admin/auth/login") {
    return applyAdminHeaders(NextResponse.next());
  }

  const token = request.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  const hasTokenShape =
    typeof token === "string" && SESSION_TOKEN_PATTERN.test(token);

  if (pathname.startsWith("/api/admin")) {
    if (!hasTokenShape) {
      return applyAdminHeaders(
        NextResponse.json(
          {
            ok: false,
            code: "UNAUTHENTICATED",
            message: "Authentication is required.",
          },
          { status: 401 },
        ),
      );
    }
    return applyAdminHeaders(NextResponse.next());
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    if (!hasTokenShape) {
      const loginUrl = new URL("/admin/login", request.url);
      return applyAdminHeaders(NextResponse.redirect(loginUrl));
    }
    return applyAdminHeaders(NextResponse.next());
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*"],
};
