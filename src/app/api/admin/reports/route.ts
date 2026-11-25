import { adminJsonNoStore, requireAdminSessionApi } from "@/lib/admin/auth";
import {
  VALID_REPORT_TYPES,
  generateAdminReport,
  parseReportType,
} from "@/lib/admin/reports";
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

    const report = await generateAdminReport(reportType, {
      attendance: searchParams.get("attendance") ?? undefined,
      dietary: searchParams.get("dietary") ?? undefined,
      message: searchParams.get("message") ?? undefined,
      source: searchParams.get("source") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    });

    return adminJsonNoStore(report, 200);
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to generate report right now.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}
