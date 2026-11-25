"use client";

import { useState } from "react";
import { formatEatDateTime } from "@/lib/admin/format";
import type { AdminReportResponse, AdminReportType } from "@/types/admin";

interface ReportOption {
  type: AdminReportType;
  label: string;
  description: string;
}

const REPORT_OPTIONS: readonly ReportOption[] = [
  {
    type: "full_rsvp",
    label: "Full RSVP Report",
    description:
      "All active responses with attendance, dietary notes, messages, and timestamps.",
  },
  {
    type: "attending",
    label: "Attending List",
    description: "Confirmed attending guests with phone numbers and dietary info.",
  },
  {
    type: "declining",
    label: "Declining List",
    description: "Guests unable to attend along with optional messages.",
  },
  {
    type: "catering",
    label: "Catering Report",
    description:
      "Attending guests and dietary requirements (blank marked as No dietary supplied).",
  },
  {
    type: "messages",
    label: "Congratulatory Messages",
    description: "All private congratulatory messages with guest names and dates.",
  },
  {
    type: "event_summary",
    label: "Event Summary",
    description:
      "Aggregate totals, attendance rate, dietary counts, and source breakdown.",
  },
];

interface ReportsWorkspaceClientProps {
  initialReport: AdminReportResponse;
}

export function ReportsWorkspaceClient({
  initialReport,
}: ReportsWorkspaceClientProps) {
  const [selectedType, setSelectedType] = useState<AdminReportType>(
    initialReport.reportType,
  );
  const [report, setReport] = useState<AdminReportResponse>(initialReport);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function selectReport(type: AdminReportType) {
    setSelectedType(type);
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/reports?type=${type}`, {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | AdminReportResponse
        | { ok: false; message?: string }
        | null;

      if (!res.ok || !json || !json.ok) {
        setError(
          (json && "message" in json && json.message) ||
            "Unable to load report preview.",
        );
        return;
      }
      setReport(json);
    } catch {
      setError("Network error while loading report preview.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-warm-sand pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-forest-green/75">
            Live Database Reports
          </p>
          <h1 className="mt-1 font-serif text-2xl font-semibold text-forest-green sm:text-3xl">
            Reports &amp; Export
          </h1>
          <p className="mt-1 text-sm text-forest-green/80">
            Excel-compatible UTF-8 BOM CSV exports with formula-injection
            protection and print-ready summaries.
          </p>
        </div>

        <div className="admin-no-print flex flex-wrap gap-2">
          <a
            href={`/api/admin/reports/export?type=${selectedType}`}
            className="inline-flex min-h-[44px] items-center border border-forest-green bg-forest-green px-4 py-2 text-sm font-medium text-warm-ivory hover:bg-forest-green/90"
          >
            Download CSV (Excel-Compatible)
          </a>
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[44px] border border-forest-green/35 bg-warm-ivory px-4 py-2 text-sm font-medium text-forest-green hover:bg-warm-sand/60"
          >
            Print Report
          </button>
        </div>
      </div>

      {/* Report Selector Grid */}
      <section
        aria-label="Available reports"
        className="admin-no-print grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        {REPORT_OPTIONS.map((option) => {
          const active = selectedType === option.type;
          return (
            <button
              key={option.type}
              type="button"
              onClick={() => void selectReport(option.type)}
              className={`min-h-[44px] border p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest-green ${
                active
                  ? "border-forest-green bg-forest-green text-warm-ivory"
                  : "border-warm-sand bg-[#FCFBF7] text-forest-green hover:bg-warm-sand/45"
              }`}
            >
              <span className="block font-serif text-base font-semibold">
                {option.label}
              </span>
              <span
                className={`mt-1 block text-xs leading-relaxed ${
                  active ? "text-warm-ivory/90" : "text-forest-green/75"
                }`}
              >
                {option.description}
              </span>
            </button>
          );
        })}
      </section>

      {error && (
        <div
          role="alert"
          className="border border-[#7A271A]/35 bg-[#FDF3F2] px-4 py-3 text-sm text-[#7A271A]"
        >
          {error}
        </div>
      )}

      {/* Printable Preview Panel */}
      <section className="border border-warm-sand bg-[#FCFBF7] p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-warm-sand pb-3">
          <div>
            <h2 className="font-serif text-xl font-semibold text-forest-green">
              {report.title}
            </h2>
            <p className="mt-0.5 text-xs text-forest-green/75">
              Generated {formatEatDateTime(report.generatedAtIso)} EAT ·{" "}
              {report.totalRows} row{report.totalRows === 1 ? "" : "s"}
            </p>
          </div>
          <span className="text-xs font-medium text-forest-green/80">
            Total: {report.summary.totalResponses} · Attending:{" "}
            {report.summary.attendingCount} ({report.summary.attendanceRatePct}
            %)
          </span>
        </div>

        {loading ? (
          <p className="py-10 text-center text-sm text-forest-green/75">
            Loading report data...
          </p>
        ) : report.rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-forest-green/75">
            No records available for this report.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-warm-sand bg-warm-sand/35 text-xs font-semibold uppercase tracking-wider text-forest-green">
                  {report.columns.map((col) => (
                    <th key={col.key} className="px-3 py-2.5">
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-warm-sand">
                {report.rows.map((row, idx) => (
                  <tr key={idx} className="align-top">
                    {report.columns.map((col) => (
                      <td
                        key={col.key}
                        className="max-w-xs break-words px-3 py-2.5 text-xs text-forest-green sm:text-sm"
                      >
                        {row[col.key] !== null && row[col.key] !== undefined
                          ? String(row[col.key])
                          : ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
