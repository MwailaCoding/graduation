import Link from "next/link";
import { GuestDetailClient } from "@/components/admin/GuestDetailClient";
import { getAdminRsvpById } from "@/lib/admin/rsvps";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminGuestDetailPage({ params }: PageProps) {
  const { id } = await params;
  const record = await getAdminRsvpById(id);

  if (!record) {
    return (
      <div className="border border-warm-sand bg-[#FCFBF7] p-8 text-center">
        <h1 className="font-serif text-2xl font-semibold text-forest-green">
          Guest Record Not Found
        </h1>
        <p className="mt-2 text-sm text-forest-green/80">
          The requested RSVP record could not be found. It may have been deleted
          or anonymized.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/admin/rsvps"
            className="inline-flex min-h-[44px] items-center bg-forest-green px-5 py-2 text-sm font-medium text-warm-ivory hover:bg-forest-green/90"
          >
            Back to RSVP Management
          </Link>
          <Link
            href="/admin/guests"
            className="inline-flex min-h-[44px] items-center border border-forest-green/30 bg-warm-ivory px-5 py-2 text-sm font-medium text-forest-green hover:bg-warm-sand/60"
          >
            Back to Guest Directory
          </Link>
        </div>
      </div>
    );
  }

  return <GuestDetailClient initialRecord={record} />;
}
