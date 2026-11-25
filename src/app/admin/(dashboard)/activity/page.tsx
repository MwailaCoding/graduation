import { ActivityLogClient } from "@/components/admin/ActivityLogClient";
import { listAdminAuditLogs } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

export default async function AdminActivityPage() {
  const initialData = await listAdminAuditLogs({ page: 1, pageSize: 25 });
  return <ActivityLogClient initialData={initialData} />;
}
