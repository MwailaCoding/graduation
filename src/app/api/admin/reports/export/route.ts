import { NextResponse } from "next/server";
import { adminJsonNoStore, requireAdminSessionApi } from "@/lib/admin/auth";
import {
  VALID_REPORT_TYPES,
  exportAdminReportCsv,
  parseReportType,
} from "@/lib/admin/reports";
import { extractClientKey } from "@/lib/rsvp/request-helpers";
import type { AdminErrorResponse } from "@/types/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminSessionApi();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const rawType = searchParams.get("type") ?? "full_rsvp";
    const reportType = parseReportType(rawType);

    if (!reportType) {
      return adminJsonNoStore(
        {
          ok: false,
          code: "VALIDATION_ERROR",
          message: `Invalid report type. Supported types: ${VALID_REPORT_TYPES.join(", ")}.`,
          fieldErrors: { type: "Unsupported report type." },
        } satisfies AdminErrorResponse,
        400,
      );
    }

    const clientKey = extractClientKey(request);
    const { filename, csv } = await exportAdminReportCsv(
      reportType,
      {
        attendance: searchParams.get("attendance") ?? undefined,
        dietary: searchParams.get("dietary") ?? undefined,
        message: searchParams.get("message") ?? undefined,
        source: searchParams.get("source") ?? undefined,
        q: searchParams.get("q") ?? undefined,
        from: searchParams.get("from") ?? undefined,
        to: searchParams.get("to") ?? undefined,
      },
      {
        adminId: auth.session.adminId,
        email: auth.session.email,
        clientKey,
      },
    );

    return new NextResponse(Buffer.from(csv, "utf8"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store, private",
        Pragma: "no-cache",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex, nofollow",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to export report right now.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}
