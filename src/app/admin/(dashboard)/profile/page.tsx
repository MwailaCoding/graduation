import { AdminProfileClient } from "@/components/admin/AdminProfileClient";
import { requireAdminSessionPage } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

export default async function AdminProfilePage() {
  const admin = await requireAdminSessionPage();
  return <AdminProfileClient initialAdmin={admin} />;
}
