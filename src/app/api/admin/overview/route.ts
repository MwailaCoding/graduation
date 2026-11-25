import { adminJsonNoStore, requireAdminSessionApi } from "@/lib/admin/auth";
import { getAdminOverview } from "@/lib/admin/overview";
import type { AdminErrorResponse } from "@/types/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminSessionApi();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const overview = await getAdminOverview();
    return adminJsonNoStore(overview, 200);
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to load dashboard overview right now.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}
