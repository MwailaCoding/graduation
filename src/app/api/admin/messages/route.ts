import { adminJsonNoStore, requireAdminSessionApi } from "@/lib/admin/auth";
import { listAdminMessages } from "@/lib/admin/messages";
import type { AdminErrorResponse } from "@/types/admin";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminSessionApi();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const pageRaw = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const pageSizeRaw = Number.parseInt(searchParams.get("pageSize") ?? "20", 10);

    const result = await listAdminMessages({
      q: searchParams.get("q") ?? undefined,
      attendance: searchParams.get("attendance") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      page: Number.isInteger(pageRaw) ? pageRaw : 1,
      pageSize: Number.isInteger(pageSizeRaw) ? pageSizeRaw : 20,
    });

    return adminJsonNoStore(result, 200);
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to load congratulatory messages right now.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}
