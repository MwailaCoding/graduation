import { adminJsonNoStore, requireAdminSessionApi } from "@/lib/admin/auth";
import { listDuplicateCandidates } from "@/lib/admin/rsvps";
import type { AdminErrorResponse } from "@/types/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminSessionApi();
  if ("response" in auth) {
    return auth.response;
  }

  try {
    const result = await listDuplicateCandidates();
    return adminJsonNoStore(result, 200);
  } catch {
    return adminJsonNoStore(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to load duplicate review candidates right now.",
      } satisfies AdminErrorResponse,
      500,
    );
  }
}
