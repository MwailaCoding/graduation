import { pool } from "@/lib/db";
import { logAdminAuditEvent } from "@/lib/admin/audit";
import { formatDietaryStatus } from "@/lib/admin/catering";
import { buildCsv, buildExportFilename } from "@/lib/admin/csv";
import { calculateAttendanceRatePct } from "@/lib/admin/overview";
import {
  ADMIN_LOCKED_EVENT_DETAILS,
  type AdminActorContext,
} from "@/lib/admin/settings";
import type {
  AdminReportColumn,
  AdminReportResponse,
  AdminReportSummaryMetrics,
  AdminReportType,
  RsvpSubmissionSource,
} from "@/types/admin";
import type { AttendanceStatus } from "@/types/rsvp";

export const VALID_REPORT_TYPES: readonly AdminReportType[] = [
  "full_rsvp",
  "attending",
  "declining",
  "catering",
  "messages",
  "event_summary",
];

const REPORT_TITLES: Record<AdminReportType, string> = {
  full_rsvp: "Full RSVP Report",
  attending: "Attending Guest List",
  declining: "Declining Guest List",
  catering: "Catering & Dietary Requirements Report",
  messages: "Congratulatory Messages Report",
  event_summary: "Event Summary Report",
};

export function parseReportType(raw: unknown): AdminReportType | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim() as AdminReportType;
  return VALID_REPORT_TYPES.includes(trimmed) ? trimmed : null;
}

function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function formatEatDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export interface ReportFilterParams {
  attendance?: string;
  dietary?: string;
  message?: string;
  source?: string;
  q?: string;
  from?: string;
  to?: string;
}

interface ReportRsvpRow {
  full_name: string;
  phone_e164: string;
  attendance_status: AttendanceStatus;
  dietary_requirements: string | null;
  congratulatory_message: string | null;
  submission_source: RsvpSubmissionSource;
  organizer_notes: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

async function computeSummaryMetrics(
  generatedAtIso: string,
): Promise<AdminReportSummaryMetrics> {
  const res = await pool.query<{
    total_responses: string;
    attending_count: string;
    declining_count: string;
    with_dietary_count: string;
    no_dietary_supplied_count: string;
    with_message_count: string;
    web_count: string;
    admin_manual_count: string;
    anonymized_count: string;
  }>(`
    SELECT
      COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived')::text AS total_responses,
      COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND attendance_status = 'attending')::text AS attending_count,
      COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND attendance_status = 'declining')::text AS declining_count,
      COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND attendance_status = 'attending' AND dietary_requirements IS NOT NULL AND btrim(dietary_requirements) <> '')::text AS with_dietary_count,
      COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND attendance_status = 'attending' AND (dietary_requirements IS NULL OR btrim(dietary_requirements) = ''))::text AS no_dietary_supplied_count,
      COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND congratulatory_message IS NOT NULL AND btrim(congratulatory_message) <> '')::text AS with_message_count,
      COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND submission_source = 'web')::text AS web_count,
      COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND submission_source = 'admin_manual')::text AS admin_manual_count,
      COUNT(*) FILTER (WHERE is_anonymized = TRUE)::text AS anonymized_count
    FROM rsvps
  `);

  const c = res.rows[0];
  const totalResponses = Number.parseInt(c?.total_responses ?? "0", 10);
  const attendingCount = Number.parseInt(c?.attending_count ?? "0", 10);
  const decliningCount = Number.parseInt(c?.declining_count ?? "0", 10);

  return {
    totalResponses,
    attendingCount,
    decliningCount,
    attendanceRatePct: calculateAttendanceRatePct(attendingCount, totalResponses),
    withDietaryCount: Number.parseInt(c?.with_dietary_count ?? "0", 10),
    noDietarySuppliedCount: Number.parseInt(
      c?.no_dietary_supplied_count ?? "0",
      10,
    ),
    withMessageCount: Number.parseInt(c?.with_message_count ?? "0", 10),
    webCount: Number.parseInt(c?.web_count ?? "0", 10),
    adminManualCount: Number.parseInt(c?.admin_manual_count ?? "0", 10),
    anonymizedCount: Number.parseInt(c?.anonymized_count ?? "0", 10),
    generatedAtIso,
  };
}

function buildFilterSql(
  reportType: AdminReportType,
  filters: ReportFilterParams,
): { whereClause: string; values: unknown[] } {
  const conditions: string[] = [
    "is_anonymized = FALSE",
    "duplicate_review_status <> 'merged_archived'",
  ];
  const values: unknown[] = [];

  if (reportType === "attending" || reportType === "catering") {
    conditions.push("attendance_status = 'attending'");
  } else if (reportType === "declining") {
    conditions.push("attendance_status = 'declining'");
  } else if (
    filters.attendance === "attending" ||
    filters.attendance === "declining"
  ) {
    values.push(filters.attendance);
    conditions.push(`attendance_status = $${values.length}`);
  }

  if (reportType === "messages") {
    conditions.push(
      "congratulatory_message IS NOT NULL AND btrim(congratulatory_message) <> ''",
    );
  } else if (filters.message === "has_message") {
    conditions.push(
      "congratulatory_message IS NOT NULL AND btrim(congratulatory_message) <> ''",
    );
  } else if (filters.message === "no_message") {
    conditions.push(
      "(congratulatory_message IS NULL OR btrim(congratulatory_message) = '')",
    );
  }

  if (filters.dietary === "has_dietary" || filters.dietary === "with_dietary") {
    conditions.push(
      "dietary_requirements IS NOT NULL AND btrim(dietary_requirements) <> ''",
    );
  } else if (filters.dietary === "no_dietary") {
    conditions.push(
      "(dietary_requirements IS NULL OR btrim(dietary_requirements) = '')",
    );
  }

  if (filters.source === "web" || filters.source === "admin_manual") {
    values.push(filters.source);
    conditions.push(`submission_source = $${values.length}`);
  }

  if (filters.from && filters.from.trim()) {
    const parsedFrom = new Date(filters.from.trim());
    if (Number.isFinite(parsedFrom.getTime())) {
      values.push(parsedFrom.toISOString());
      conditions.push(`created_at >= $${values.length}::timestamptz`);
    }
  }

  if (filters.to && filters.to.trim()) {
    const trimmed = filters.to.trim();
    const parsedTo = new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
        ? `${trimmed}T23:59:59.999+03:00`
        : trimmed,
    );
    if (Number.isFinite(parsedTo.getTime())) {
      values.push(parsedTo.toISOString());
      conditions.push(`created_at <= $${values.length}::timestamptz`);
    }
  }

  if (filters.q && filters.q.trim()) {
    const escaped = escapeIlikePattern(filters.q.trim().slice(0, 120));
    values.push(`%${escaped}%`);
    const idx = values.length;
    conditions.push(
      `(full_name ILIKE $${idx} ESCAPE '\\' OR phone_e164 ILIKE $${idx} ESCAPE '\\' OR COALESCE(dietary_requirements, '') ILIKE $${idx} ESCAPE '\\' OR COALESCE(congratulatory_message, '') ILIKE $${idx} ESCAPE '\\')`,
    );
  }

  return {
    whereClause: `WHERE ${conditions.join(" AND ")}`,
    values,
  };
}

export async function generateAdminReport(
  reportType: AdminReportType,
  filters: ReportFilterParams = {},
): Promise<AdminReportResponse> {
  const generatedAtIso = new Date().toISOString();
  const summary = await computeSummaryMetrics(generatedAtIso);

  if (reportType === "event_summary") {
    const columns: AdminReportColumn[] = [
      { key: "metric", label: "Metric" },
      { key: "value", label: "Value" },
    ];
    const rows: Record<string, string | number | null>[] = [
      { metric: "Event", value: "Graduation & Thanksgiving Ceremony" },
      {
        metric: "Graduates",
        value: ADMIN_LOCKED_EVENT_DETAILS.graduates
          .map((g) => `${g.name} (${g.degree})`)
          .join("; "),
      },
      {
        metric: "Event Date & Time",
        value: `${ADMIN_LOCKED_EVENT_DETAILS.dateLabel} at ${ADMIN_LOCKED_EVENT_DETAILS.timeLabel} (${ADMIN_LOCKED_EVENT_DETAILS.timezoneLabel})`,
      },
      { metric: "Venue", value: ADMIN_LOCKED_EVENT_DETAILS.venueName },
      { metric: "Total Valid RSVPs", value: summary.totalResponses },
      { metric: "Attending Guests", value: summary.attendingCount },
      { metric: "Declining Guests", value: summary.decliningCount },
      { metric: "Attendance Rate (%)", value: `${summary.attendanceRatePct}%` },
      {
        metric: "Attending with Dietary Requirements",
        value: summary.withDietaryCount,
      },
      {
        metric: "Attending with No Dietary Supplied",
        value: summary.noDietarySuppliedCount,
      },
      { metric: "Congratulatory Messages", value: summary.withMessageCount },
      { metric: "Website RSVPs", value: summary.webCount },
      { metric: "Manual Admin RSVPs", value: summary.adminManualCount },
      { metric: "Anonymized Historical Records", value: summary.anonymizedCount },
      {
        metric: "Report Generated (EAT)",
        value: formatEatDateTime(generatedAtIso),
      },
    ];

    return {
      ok: true,
      reportType,
      title: REPORT_TITLES[reportType],
      generatedAtIso,
      columns,
      rows,
      summary,
      totalRows: rows.length,
    };
  }

  const { whereClause, values } = buildFilterSql(reportType, filters);
  const orderSql =
    reportType === "messages"
      ? "ORDER BY created_at DESC, id DESC"
      : "ORDER BY lower(full_name) ASC, created_at ASC, id ASC";

  const rowsRes = await pool.query<ReportRsvpRow>(
    `
    SELECT
      full_name,
      phone_e164,
      attendance_status,
      dietary_requirements,
      congratulatory_message,
      submission_source,
      organizer_notes,
      created_at,
      updated_at
    FROM rsvps
    ${whereClause}
    ${orderSql}
    `,
    values,
  );

  let columns: AdminReportColumn[] = [];
  let rows: Record<string, string | number | null>[] = [];

  if (reportType === "full_rsvp") {
    columns = [
      { key: "fullName", label: "Full Name" },
      { key: "phoneNumber", label: "Phone Number" },
      { key: "attendance", label: "Attendance" },
      { key: "dietaryRequirements", label: "Dietary Requirements" },
      { key: "congratulatoryMessage", label: "Congratulatory Message" },
      { key: "source", label: "Source" },
      { key: "organizerNotes", label: "Organizer Notes" },
      { key: "submittedAt", label: "Date Submitted (EAT)" },
      { key: "updatedAt", label: "Last Updated (EAT)" },
    ];
    rows = rowsRes.rows.map((r) => ({
      fullName: r.full_name,
      phoneNumber: r.phone_e164,
      attendance: r.attendance_status === "attending" ? "Attending" : "Declining",
      dietaryRequirements:
        r.attendance_status === "attending"
          ? formatDietaryStatus(r.dietary_requirements)
          : "N/A (Declining)",
      congratulatoryMessage: r.congratulatory_message ?? "",
      source: r.submission_source === "admin_manual" ? "Manual (Admin)" : "Website",
      organizerNotes: r.organizer_notes ?? "",
      submittedAt: formatEatDateTime(r.created_at),
      updatedAt: formatEatDateTime(r.updated_at),
    }));
  } else if (reportType === "attending") {
    columns = [
      { key: "fullName", label: "Full Name" },
      { key: "phoneNumber", label: "Phone Number" },
      { key: "dietaryRequirements", label: "Dietary Requirements" },
      { key: "submittedAt", label: "Date Submitted (EAT)" },
    ];
    rows = rowsRes.rows.map((r) => ({
      fullName: r.full_name,
      phoneNumber: r.phone_e164,
      dietaryRequirements: formatDietaryStatus(r.dietary_requirements),
      submittedAt: formatEatDateTime(r.created_at),
    }));
  } else if (reportType === "declining") {
    columns = [
      { key: "fullName", label: "Full Name" },
      { key: "phoneNumber", label: "Phone Number" },
      { key: "congratulatoryMessage", label: "Congratulatory Message" },
      { key: "submittedAt", label: "Date Submitted (EAT)" },
    ];
    rows = rowsRes.rows.map((r) => ({
      fullName: r.full_name,
      phoneNumber: r.phone_e164,
      congratulatoryMessage: r.congratulatory_message ?? "",
      submittedAt: formatEatDateTime(r.created_at),
    }));
  } else if (reportType === "catering") {
    columns = [
      { key: "fullName", label: "Full Name" },
      { key: "phoneNumber", label: "Phone Number" },
      { key: "attendance", label: "Attendance" },
      { key: "dietaryRequirements", label: "Dietary Requirements" },
    ];
    rows = rowsRes.rows.map((r) => ({
      fullName: r.full_name,
      phoneNumber: r.phone_e164,
      attendance: "Attending",
      dietaryRequirements: formatDietaryStatus(r.dietary_requirements),
    }));
  } else if (reportType === "messages") {
    columns = [
      { key: "fullName", label: "Guest Name" },
      { key: "attendance", label: "Attendance" },
      { key: "congratulatoryMessage", label: "Congratulatory Message" },
      { key: "receivedAt", label: "Date Received (EAT)" },
    ];
    rows = rowsRes.rows.map((r) => ({
      fullName: r.full_name,
      attendance: r.attendance_status === "attending" ? "Attending" : "Declining",
      congratulatoryMessage: r.congratulatory_message ?? "",
      receivedAt: formatEatDateTime(r.created_at),
    }));
  }

  return {
    ok: true,
    reportType,
    title: REPORT_TITLES[reportType],
    generatedAtIso,
    columns,
    rows,
    summary,
    totalRows: rows.length,
  };
}

export async function exportAdminReportCsv(
  reportType: AdminReportType,
  filters: ReportFilterParams,
  actor: AdminActorContext,
): Promise<{ filename: string; csv: string; rowCount: number }> {
  const report = await generateAdminReport(reportType, filters);
  const headers = report.columns.map((c) => c.label);
  const dataRows = report.rows.map((row) =>
    report.columns.map((col) => row[col.key] ?? ""),
  );

  const csv = buildCsv(headers, dataRows);
  const filename = buildExportFilename(reportType);

  await logAdminAuditEvent({
    actorAdminId: actor.adminId,
    actorIdentifier: actor.email,
    action: "report.export_csv",
    targetType: "report",
    targetId: reportType,
    summary: `Exported ${report.title} CSV (${report.totalRows} rows)`,
    metadata: {
      reportType,
      rowCount: report.totalRows,
      filename,
      hasAttendanceFilter: Boolean(filters.attendance),
      hasDietaryFilter: Boolean(filters.dietary),
      hasSearchFilter: Boolean(filters.q),
    },
    clientKey: actor.clientKey,
  });

  return {
    filename,
    csv,
    rowCount: report.totalRows,
  };
}
