import { RsvpTableWorkspace } from "@/components/admin/RsvpTableWorkspace";
import { listAdminRsvps } from "@/lib/admin/rsvps";

export const dynamic = "force-dynamic";

export default async function AdminGuestsDirectoryPage() {
  const initialData = await listAdminRsvps({
    sort: "full_name",
    order: "asc",
    page: 1,
    pageSize: 25,
  });

  return (
    <RsvpTableWorkspace
      mode="directory"
      initialData={initialData}
      initialSort="full_name"
      initialOrder="asc"
    />
  );
}
