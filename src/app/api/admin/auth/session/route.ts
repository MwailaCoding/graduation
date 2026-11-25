import {
  adminJsonNoStore,
  requireAdminSessionApi,
} from "@/lib/admin/auth";
import type { AdminSessionResponse } from "@/types/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminSessionApi();
  if ("response" in auth) {
    return auth.response;
  }

  return adminJsonNoStore(
    {
      ok: true,
      admin: auth.session,
    } satisfies AdminSessionResponse,
    200,
  );
}
