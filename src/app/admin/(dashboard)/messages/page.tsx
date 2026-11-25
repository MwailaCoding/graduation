import { MessagesInboxClient } from "@/components/admin/MessagesInboxClient";
import { listAdminMessages } from "@/lib/admin/messages";

export const dynamic = "force-dynamic";

export default async function AdminMessagesPage() {
  const initialData = await listAdminMessages({
    sort: "newest",
    page: 1,
    pageSize: 20,
  });

  return <MessagesInboxClient initialData={initialData} />;
}
