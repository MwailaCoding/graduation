import { CateringWorkspaceClient } from "@/components/admin/CateringWorkspaceClient";
import { getAdminCatering } from "@/lib/admin/catering";

export const dynamic = "force-dynamic";

export default async function AdminCateringPage() {
  const initialData = await getAdminCatering({
    filter: "all",
    page: 1,
    pageSize: 25,
  });

  return <CateringWorkspaceClient initialData={initialData} />;
}
