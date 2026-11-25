import { ReportsWorkspaceClient } from "@/components/admin/ReportsWorkspaceClient";
import { generateAdminReport } from "@/lib/admin/reports";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  const initialReport = await generateAdminReport("full_rsvp");
  return <ReportsWorkspaceClient initialReport={initialReport} />;
}
