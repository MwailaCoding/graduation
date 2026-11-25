import { RsvpTableWorkspace } from "@/components/admin/RsvpTableWorkspace";
import { listAdminRsvps } from "@/lib/admin/rsvps";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminRsvpsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const attendance =
    typeof sp.attendance === "string" ? sp.attendance : "all";
  const sort = typeof sp.sort === "string" ? sp.sort : "created_at";
  const order = typeof sp.order === "string" ? sp.order : "desc";

  const initialData = await listAdminRsvps({
    attendance,
    sort,
    order,
    page: 1,
    pageSize: 25,
  });

  return (
    <RsvpTableWorkspace
      mode="management"
      initialData={initialData}
      initialAttendance={attendance}
      initialSort={sort}
      initialOrder={order}
    />
  );
}
