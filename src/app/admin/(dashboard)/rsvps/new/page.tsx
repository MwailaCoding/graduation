import Link from "next/link";
import { ManualRsvpForm } from "@/components/admin/ManualRsvpForm";

export const dynamic = "force-dynamic";

export default function AdminManualRsvpPage() {
  return (
    <div className="space-y-6">
      <div className="border-b border-warm-sand pb-4">
        <Link
          href="/admin/rsvps"
          className="inline-flex min-h-[44px] items-center text-xs font-semibold uppercase tracking-[0.14em] text-forest-green/80 hover:underline"
        >
          ← Back to RSVP Management
        </Link>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-forest-green sm:text-3xl">
          Add Manual RSVP
        </h1>
        <p className="mt-1 text-sm text-forest-green/80">
          Record an RSVP received by phone, WhatsApp, or in person directly into
          the live guest database.
        </p>
      </div>

      <ManualRsvpForm />
    </div>
  );
}
