import {
  adminJsonNoStore,
  requireAdminSessionApi,
} from "@/lib/admin/auth";
import { listAdminAuditLogs } from "@/lib/admin/audit";
import type {
  AdminErrorResponse,
  AdminFieldErrors,
} from "@/types/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminSessionApi();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const url = new URL(request.url);
    const fieldErrors: AdminFieldErrors = {};

    const rawPage = url.searchParams.get("page");
    let page = 1;
    if (rawPage !== null && rawPage.trim() !== "") {
      const parsed = Number(rawPage);
      if (!Number.isInteger(parsed) || parsed < 1) {
        fieldErrors.page = "Page must be a positive integer.";
      } else {
        page = parsed;
      }
    }

    const rawPageSize = url.searchParams.get("pageSize");
    let pageSize = 25;
    if (rawPageSize !== null && rawPageSize.trim() !== "") {
      const parsed = Number(rawPageSize);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
        fieldErrors.pageSize = "Page size must be an integer between 1 and 100.";
      } else {
        pageSize = parsed;
      }
    }

    const action = url.searchParams.get("action")?.trim() ?? "";
    if (action.length > 64) {
      fieldErrors.action = "Action filter must be 64 characters or fewer.";
    }

    const q = url.searchParams.get("q")?.trim() ?? "";
    if (q.length > 120) {
      fieldErrors.q = "Search query must be 120 characters or fewer.";
    }

    const from = url.searchParams.get("from")?.trim() ?? "";
    if (from && !Number.isFinite(new Date(from).getTime())) {
      fieldErrors.from = "Start date filter is not a valid timestamp.";
    }

    const to = url.searchParams.get("to")?.trim() ?? "";
    if (to && !Number.isFinite(new Date(to).getTime())) {
      fieldErrors.to = "End date filter is not a valid timestamp.";
    }

    if (Object.keys(fieldErrors).length > 0) {
      return adminJsonNoStore(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Invalid audit log filter parameters.",
          fieldErrors,
        } satisfies AdminErrorResponse,
        400,
      );
    }

    const result = await listAdminAuditLogs({
      page,
      pageSize,
      action: action || undefined,
      q: q || undefined,
      from: from || undefined,
      to: to || undefined,
    });

    return adminJsonNoStore(result, 200);
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to load audit logs right now.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}
