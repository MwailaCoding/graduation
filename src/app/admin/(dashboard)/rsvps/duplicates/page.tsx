import { DuplicateReviewWorkspace } from "@/components/admin/DuplicateReviewWorkspace";
import { listDuplicateCandidates } from "@/lib/admin/rsvps";

export const dynamic = "force-dynamic";

export default async function AdminDuplicatesPage() {
  const initialData = await listDuplicateCandidates();
  return <DuplicateReviewWorkspace initialData={initialData} />;
}
