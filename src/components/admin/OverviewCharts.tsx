"use client";

import type { OverviewDailySeriesPoint } from "@/types/admin";

interface OverviewChartsProps {
  totalResponses: number;
  attendingCount: number;
  decliningCount: number;
  attendanceRatePct: number;
  dailySeries: OverviewDailySeriesPoint[];
}

export function OverviewCharts({
  totalResponses,
  attendingCount,
  decliningCount,
  attendanceRatePct,
  dailySeries,
}: OverviewChartsProps) {
  const attendingPct =
    totalResponses > 0 ? Math.round((attendingCount / totalResponses) * 100) : 0;
  const decliningPct =
    totalResponses > 0 ? Math.max(0, 100 - attendingPct) : 0;

  const visibleSeries = dailySeries.slice(-14);
  const maxDailyTotal = visibleSeries.reduce(
    (max, item) => Math.max(max, item.total),
    0,
  );

  return (
    <section
      aria-label="Event activity and attendance insights"
      className="grid gap-6 lg:grid-cols-2"
    >
      {/* Chart 1: Attending vs Declining Breakdown */}
      <div className="border border-warm-sand bg-[#FCFBF7] p-5">
        <div className="flex items-baseline justify-between gap-2 border-b border-warm-sand pb-3">
          <h2 className="font-serif text-lg font-semibold text-forest-green">
            Attending vs Declining
          </h2>
          <span className="text-xs font-medium text-forest-green/75">
            {totalResponses} valid response{totalResponses === 1 ? "" : "s"}
          </span>
        </div>

        {totalResponses === 0 ? (
          <div className="py-10 text-center text-sm text-forest-green/75">
            No RSVP responses recorded yet. Attendance distribution will appear
            once guests respond.
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {/* Accessible stacked bar */}
            <div
              role="img"
              aria-label={`Attendance breakdown: ${attendingCount} attending (${attendanceRatePct}%), ${decliningCount} declining`}
              className="h-5 w-full overflow-hidden border border-warm-sand bg-warm-ivory flex"
            >
              {attendingCount > 0 && (
                <div
                  style={{ width: `${attendingPct}%` }}
                  className="h-full bg-forest-green transition-all"
                />
              )}
              {decliningCount > 0 && (
                <div
                  style={{ width: `${decliningPct}%` }}
                  className="h-full bg-champagne-gold transition-all"
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="border border-warm-sand bg-warm-ivory/70 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-forest-green/80">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 bg-forest-green"
                  />
                  <span>Attending</span>
                </div>
                <p className="mt-1.5 font-serif text-2xl font-semibold text-forest-green">
                  {attendingCount}
                </p>
                <p className="text-xs text-forest-green/75">
                  {attendanceRatePct}% of responses
                </p>
              </div>

              <div className="border border-warm-sand bg-warm-ivory/70 p-3.5">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-forest-green/80">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 bg-champagne-gold"
                  />
                  <span>Declining</span>
                </div>
                <p className="mt-1.5 font-serif text-2xl font-semibold text-forest-green">
                  {decliningCount}
                </p>
                <p className="text-xs text-forest-green/75">
                  {decliningPct}% of responses
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chart 2: RSVP Submissions Over Time */}
      <div className="border border-warm-sand bg-[#FCFBF7] p-5">
        <div className="flex items-baseline justify-between gap-2 border-b border-warm-sand pb-3">
          <h2 className="font-serif text-lg font-semibold text-forest-green">
            RSVP Submissions Over Time
          </h2>
          <span className="text-xs font-medium text-forest-green/75">
            Daily activity (EAT)
          </span>
        </div>

        {visibleSeries.length === 0 ? (
          <div className="py-10 text-center text-sm text-forest-green/75">
            Not enough submission activity yet to plot a daily timeline.
          </div>
        ) : (
          <div className="mt-5">
            <div
              role="img"
              aria-label={`Daily RSVP submissions across ${visibleSeries.length} active day${visibleSeries.length === 1 ? "" : "s"}, peak ${maxDailyTotal} per day`}
              className="flex h-40 items-end gap-2 border-b border-warm-sand pb-2 pt-4"
            >
              {visibleSeries.map((point) => {
                const heightPct =
                  maxDailyTotal > 0
                    ? Math.max(12, Math.round((point.total / maxDailyTotal) * 100))
                    : 12;
                const shortLabel = point.date.slice(5); // MM-DD
                return (
                  <div
                    key={point.date}
                    className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
                    title={`${point.date}: ${point.total} total (${point.attending} attending, ${point.declining} declining)`}
                  >
                    <span className="text-[11px] font-semibold text-forest-green">
                      {point.total}
                    </span>
                    <div className="flex h-24 w-full max-w-[36px] items-end justify-center">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className="w-full bg-forest-green/85"
                      />
                    </div>
                    <span className="truncate text-[10px] text-forest-green/75">
                      {shortLabel}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-forest-green/75">
              <span>
                Showing {visibleSeries.length} active day
                {visibleSeries.length === 1 ? "" : "s"}
              </span>
              <span>Peak: {maxDailyTotal} / day</span>
            </div>

            {/* Screen-reader data table alternative */}
            <table className="sr-only">
              <caption>Daily RSVP submissions</caption>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Total</th>
                  <th>Attending</th>
                  <th>Declining</th>
                </tr>
              </thead>
              <tbody>
                {visibleSeries.map((pt) => (
                  <tr key={pt.date}>
                    <td>{pt.date}</td>
                    <td>{pt.total}</td>
                    <td>{pt.attending}</td>
                    <td>{pt.declining}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
