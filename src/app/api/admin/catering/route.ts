import { adminJsonNoStore, requireAdminSessionApi } from "@/lib/admin/auth";
import { getAdminCatering } from "@/lib/admin/catering";
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
    const pageSizeRaw = Number.parseInt(searchParams.get("pageSize") ?? "25", 10);

    const result = await getAdminCatering({
      q: searchParams.get("q") ?? undefined,
      filter: searchParams.get("filter") ?? undefined,
      page: Number.isInteger(pageRaw) ? pageRaw : 1,
      pageSize: Number.isInteger(pageSizeRaw) ? pageSizeRaw : 25,
    });

    return adminJsonNoStore(result, 200);
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to load catering information right now.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}
