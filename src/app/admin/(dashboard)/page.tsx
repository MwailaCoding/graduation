import Link from "next/link";
import { OverviewCharts } from "@/components/admin/OverviewCharts";
import {
  calculateDaysUntilEvent,
  formatEatDateTime,
  formatSourceLabel,
} from "@/lib/admin/format";
import { getAdminOverview } from "@/lib/admin/overview";
import { ADMIN_LOCKED_EVENT_DETAILS } from "@/lib/admin/settings";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const overview = await getAdminOverview();
  const daysRemaining = calculateDaysUntilEvent();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-3 border-b border-warm-sand pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-forest-green/75">
            Event Control Center
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-forest-green sm:text-3xl">
            Overview
          </h1>
          <p className="mt-1 text-sm text-forest-green/80">
            {ADMIN_LOCKED_EVENT_DETAILS.dateLabel} ·{" "}
            {ADMIN_LOCKED_EVENT_DETAILS.timeLabel} ·{" "}
            {ADMIN_LOCKED_EVENT_DETAILS.venueName}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex min-h-[36px] items-center border px-3 py-1 text-xs font-semibold ${
              overview.rsvpPolicy.isClosed
                ? "border-[#7A271A]/40 bg-[#FDF3F2] text-[#7A271A]"
                : "border-forest-green/30 bg-soft-sage/25 text-forest-green"
            }`}
          >
            RSVP Status: {overview.rsvpPolicy.isClosed ? "Closed" : "Open"}
          </span>
          <span className="inline-flex min-h-[36px] items-center border border-warm-sand bg-[#FCFBF7] px-3 py-1 text-xs font-medium text-forest-green">
            {daysRemaining > 0
              ? `${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining`
              : "Event day reached"}
          </span>
        </div>
      </div>

      {/* Primary KPI Cards */}
      <section aria-label="Key RSVP metrics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="border border-warm-sand bg-[#FCFBF7] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
            Total RSVPs
          </p>
          <p className="mt-2 font-serif text-3xl font-semibold text-forest-green">
            {overview.totalResponses}
          </p>
          <p className="mt-1 text-xs text-forest-green/75">
            {overview.sourceBreakdown.web} website ·{" "}
            {overview.sourceBreakdown.adminManual} manual
          </p>
        </div>

        <div className="border border-warm-sand bg-[#FCFBF7] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
            Attending
          </p>
          <p className="mt-2 font-serif text-3xl font-semibold text-forest-green">
            {overview.attendingCount}
          </p>
          <p className="mt-1 text-xs text-forest-green/75">
            Confirmed guests attending
          </p>
        </div>

        <div className="border border-warm-sand bg-[#FCFBF7] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
            Declining
          </p>
          <p className="mt-2 font-serif text-3xl font-semibold text-forest-green">
            {overview.decliningCount}
          </p>
          <p className="mt-1 text-xs text-forest-green/75">
            Unable to attend
          </p>
        </div>

        <div className="border border-warm-sand bg-[#FCFBF7] p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
            Attendance Rate
          </p>
          <p className="mt-2 font-serif text-3xl font-semibold text-forest-green">
            {overview.attendanceRatePct}%
          </p>
          <p className="mt-1 text-xs text-forest-green/75">
            Attending / Total valid RSVPs
          </p>
        </div>
      </section>

      {/* Secondary Hospitality & Operations Summary */}
      <section
        aria-label="Hospitality and moderation summary"
        className="grid gap-4 sm:grid-cols-3"
      >
        <div className="border border-warm-sand bg-[#FCFBF7] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
            Dietary Requirements
          </p>
          <p className="mt-1 font-serif text-2xl font-semibold text-forest-green">
            {overview.withDietaryCount}
          </p>
          <p className="mt-1 text-xs text-forest-green/75">
            {overview.noDietarySuppliedCount} attending with no dietary supplied
          </p>
        </div>

        <div className="border border-warm-sand bg-[#FCFBF7] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
            Congratulatory Messages
          </p>
          <p className="mt-1 font-serif text-2xl font-semibold text-forest-green">
            {overview.withMessageCount}
          </p>
          <p className="mt-1 text-xs text-forest-green/75">
            Private messages from guests
          </p>
        </div>

        <div className="border border-warm-sand bg-[#FCFBF7] p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-green/75">
            Duplicate Review Queue
          </p>
          <p className="mt-1 font-serif text-2xl font-semibold text-forest-green">
            {overview.flaggedDuplicatesCount}
          </p>
          <p className="mt-1 text-xs text-forest-green/75">
            Flagged record{overview.flaggedDuplicatesCount === 1 ? "" : "s"} awaiting review
          </p>
        </div>
      </section>

      {/* Quick Actions */}
      <section aria-label="Quick actions" className="border border-warm-sand bg-[#FCFBF7] p-5">
        <h2 className="font-serif text-lg font-semibold text-forest-green">
          Quick Actions
        </h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <Link
            href="/admin/rsvps"
            className="inline-flex min-h-[44px] items-center border border-forest-green bg-forest-green px-4 py-2 text-sm font-medium text-warm-ivory hover:bg-forest-green/90"
          >
            View RSVPs
          </Link>
          <Link
            href="/admin/rsvps/new"
            className="inline-flex min-h-[44px] items-center border border-forest-green/35 bg-warm-ivory px-4 py-2 text-sm font-medium text-forest-green hover:bg-warm-sand/60"
          >
            Add RSVP Manually
          </Link>
          <Link
            href="/admin/rsvps?attendance=attending"
            className="inline-flex min-h-[44px] items-center border border-forest-green/35 bg-warm-ivory px-4 py-2 text-sm font-medium text-forest-green hover:bg-warm-sand/60"
          >
            View Attending List
          </Link>
          <a
            href="/api/admin/reports/export?type=attending"
            className="inline-flex min-h-[44px] items-center border border-forest-green/35 bg-warm-ivory px-4 py-2 text-sm font-medium text-forest-green hover:bg-warm-sand/60"
          >
            Export Attendance List
          </a>
          <Link
            href="/admin/messages"
            className="inline-flex min-h-[44px] items-center border border-forest-green/35 bg-warm-ivory px-4 py-2 text-sm font-medium text-forest-green hover:bg-warm-sand/60"
          >
            View Congratulatory Messages
          </Link>
          {overview.flaggedDuplicatesCount > 0 && (
            <Link
              href="/admin/rsvps/duplicates"
              className="inline-flex min-h-[44px] items-center border border-champagne-gold bg-champagne-gold/20 px-4 py-2 text-sm font-medium text-forest-green hover:bg-champagne-gold/30"
            >
              Review Duplicates ({overview.flaggedDuplicatesCount})
            </Link>
          )}
        </div>
      </section>

      {/* Insights & Charts */}
      <OverviewCharts
        totalResponses={overview.totalResponses}
        attendingCount={overview.attendingCount}
        decliningCount={overview.decliningCount}
        attendanceRatePct={overview.attendanceRatePct}
        dailySeries={overview.dailySubmissionsSeries}
      />

      {/* Latest Submissions & Recently Updated */}
      <section className="grid gap-6 lg:grid-cols-2">
        <div className="border border-warm-sand bg-[#FCFBF7] p-5">
          <div className="flex items-center justify-between border-b border-warm-sand pb-3">
            <h2 className="font-serif text-lg font-semibold text-forest-green">
              Latest RSVP Submissions
            </h2>
            <Link
              href="/admin/rsvps"
              className="inline-flex min-h-[44px] items-center text-xs font-semibold text-forest-green underline underline-offset-4 hover:text-forest-green/80"
            >
              View all
            </Link>
          </div>

          {overview.recentRsvps.length === 0 ? (
            <p className="py-8 text-center text-sm text-forest-green/75">
              No RSVP submissions yet.
            </p>
          ) : (
            <ul className="divide-y divide-warm-sand">
              {overview.recentRsvps.map((rsvp) => (
                <li
                  key={rsvp.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/guests/${rsvp.id}`}
                      className="inline-flex min-h-[44px] items-center text-sm font-semibold text-forest-green hover:underline"
                    >
                      {rsvp.fullName}
                    </Link>
                    <p className="text-xs text-forest-green/75">
                      {rsvp.phoneE164} · {formatSourceLabel(rsvp.submissionSource)} ·{" "}
                      {formatEatDateTime(rsvp.createdAt)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center border px-2.5 py-0.5 text-xs font-medium ${
                      rsvp.attendance === "attending"
                        ? "border-forest-green/30 bg-soft-sage/25 text-forest-green"
                        : "border-champagne-gold/60 bg-warm-sand/50 text-forest-green"
                    }`}
                  >
                    {rsvp.attendance === "attending" ? "Attending" : "Declining"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border border-warm-sand bg-[#FCFBF7] p-5">
          <div className="flex items-center justify-between border-b border-warm-sand pb-3">
            <h2 className="font-serif text-lg font-semibold text-forest-green">
              Recently Updated Responses
            </h2>
            <Link
              href="/admin/rsvps?sort=updated_at&order=desc"
              className="inline-flex min-h-[44px] items-center text-xs font-semibold text-forest-green underline underline-offset-4 hover:text-forest-green/80"
            >
              Sort by updated
            </Link>
          </div>

          {overview.recentlyUpdatedRsvps.length === 0 ? (
            <p className="py-8 text-center text-sm text-forest-green/75">
              No responses have been updated since initial submission.
            </p>
          ) : (
            <ul className="divide-y divide-warm-sand">
              {overview.recentlyUpdatedRsvps.map((rsvp) => (
                <li
                  key={rsvp.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/guests/${rsvp.id}`}
                      className="inline-flex min-h-[44px] items-center text-sm font-semibold text-forest-green hover:underline"
                    >
                      {rsvp.fullName}
                    </Link>
                    <p className="text-xs text-forest-green/75">
                      Updated {formatEatDateTime(rsvp.updatedAt)}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center border px-2.5 py-0.5 text-xs font-medium ${
                      rsvp.attendance === "attending"
                        ? "border-forest-green/30 bg-soft-sage/25 text-forest-green"
                        : "border-champagne-gold/60 bg-warm-sand/50 text-forest-green"
                    }`}
                  >
                    {rsvp.attendance === "attending" ? "Attending" : "Declining"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
