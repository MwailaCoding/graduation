import type { CountryCode } from "libphonenumber-js";
import { pool } from "@/lib/db";
import { DEFAULT_PHONE_COUNTRY } from "@/lib/rsvp/validation";
import type {
  AdminCateringResponse,
  AdminCateringSummary,
  AdminRsvpRecord,
  DuplicateReviewStatus,
  RsvpSubmissionSource,
} from "@/types/admin";
import type { AttendanceStatus } from "@/types/rsvp";

export const NO_DIETARY_SUPPLIED_LABEL = "No dietary supplied" as const;

/**
 * Formats dietary requirements without treating a blank/null entry as proof
 * that a guest has no dietary restrictions.
 */
export function formatDietaryStatus(raw: string | null | undefined): string {
  if (typeof raw !== "string") {
    return NO_DIETARY_SUPPLIED_LABEL;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : NO_DIETARY_SUPPLIED_LABEL;
}

/**
 * Pure catering aggregation helper for attending guests.
 * Explicit strings such as "None" or "No restrictions" count as supplied
 * dietary responses; only null/blank strings count as "No dietary supplied".
 */
export function summarizeCateringRows(
  rows: readonly {
    attendance_status: string;
    dietary_requirements: string | null | undefined;
  }[],
): AdminCateringSummary {
  let attendingCount = 0;
  let withDietaryCount = 0;
  let noDietarySuppliedCount = 0;

  for (const row of rows) {
    if (row.attendance_status !== "attending") {
      continue;
    }
    attendingCount += 1;
    const supplied =
      typeof row.dietary_requirements === "string" &&
      row.dietary_requirements.trim().length > 0;
    if (supplied) {
      withDietaryCount += 1;
    } else {
      noDietarySuppliedCount += 1;
    }
  }

  return {
    attendingCount,
    withDietaryCount,
    noDietarySuppliedCount,
  };
}

function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export type CateringFilter = "all" | "with_dietary" | "no_dietary";

export interface ListCateringParams {
  q?: string;
  filter?: string;
  page?: number;
  pageSize?: number;
}

interface RawRsvpRow {
  id: string;
  full_name: string;
  phone_e164: string;
  phone_country: string | null;
  attendance_status: AttendanceStatus;
  attendee_count: number;
  dietary_requirements: string | null;
  congratulatory_message: string | null;
  submission_source: RsvpSubmissionSource;
  duplicate_review_status: DuplicateReviewStatus;
  organizer_notes: string | null;
  created_by_admin_id: string | null;
  updated_by_admin_id: string | null;
  duplicate_group_id: string | null;
  merged_into_rsvp_id: string | null;
  duplicate_reviewed_at: Date | string | null;
  duplicate_reviewed_by_admin_id: string | null;
  duplicate_review_note: string | null;
  retention_expires_at: Date | string;
  created_at: Date | string;
  updated_at: Date | string;
}

function mapRow(row: RawRsvpRow): AdminRsvpRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    phoneE164: row.phone_e164,
    phoneCountry: (row.phone_country ?? DEFAULT_PHONE_COUNTRY) as CountryCode,
    attendance: row.attendance_status,
    attendeeCount: row.attendee_count,
    dietaryRequirements: row.dietary_requirements,
    congratulatoryMessage: row.congratulatory_message,
    submissionSource: row.submission_source,
    duplicateReviewStatus: row.duplicate_review_status,
    organizerNotes: row.organizer_notes,
    createdByAdminId: row.created_by_admin_id,
    updatedByAdminId: row.updated_by_admin_id,
    duplicateGroupId: row.duplicate_group_id,
    mergedIntoRsvpId: row.merged_into_rsvp_id,
    duplicateReviewedAt: row.duplicate_reviewed_at
      ? toIsoString(row.duplicate_reviewed_at)
      : null,
    duplicateReviewedByAdminId: row.duplicate_reviewed_by_admin_id,
    duplicateReviewNote: row.duplicate_review_note,
    retentionExpiresAt: toIsoString(row.retention_expires_at),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function getAdminCatering(
  params: ListCateringParams = {},
): Promise<AdminCateringResponse> {
  const page =
    typeof params.page === "number" &&
    Number.isInteger(params.page) &&
    params.page >= 1
      ? params.page
      : 1;
  const pageSize =
    typeof params.pageSize === "number" &&
    Number.isInteger(params.pageSize) &&
    params.pageSize >= 1 &&
    params.pageSize <= 100
      ? params.pageSize
      : 25;

  const filter: CateringFilter =
    params.filter === "with_dietary" || params.filter === "no_dietary"
      ? params.filter
      : "all";

  const baseConditions: string[] = [
    "is_anonymized = FALSE",
    "duplicate_review_status <> 'merged_archived'",
    "attendance_status = 'attending'",
  ];

  const listConditions = [...baseConditions];
  const values: unknown[] = [];

  if (filter === "with_dietary") {
    listConditions.push(
      "dietary_requirements IS NOT NULL AND btrim(dietary_requirements) <> ''",
    );
  } else if (filter === "no_dietary") {
    listConditions.push(
      "(dietary_requirements IS NULL OR btrim(dietary_requirements) = '')",
    );
  }

  if (params.q && params.q.trim()) {
    const escaped = escapeIlikePattern(params.q.trim().slice(0, 120));
    values.push(`%${escaped}%`);
    const idx = values.length;
    listConditions.push(
      `(full_name ILIKE $${idx} ESCAPE '\\' OR phone_e164 ILIKE $${idx} ESCAPE '\\' OR COALESCE(dietary_requirements, '') ILIKE $${idx} ESCAPE '\\')`,
    );
  }

  const baseWhere = `WHERE ${baseConditions.join(" AND ")}`;
  const listWhere = `WHERE ${listConditions.join(" AND ")}`;
  const offset = (page - 1) * pageSize;

  const [summaryRes, countRes, rowsRes] = await Promise.all([
    pool.query<{
      attending_count: string;
      with_dietary_count: string;
      no_dietary_supplied_count: string;
    }>(`
      SELECT
        COUNT(*)::text AS attending_count,
        COUNT(*) FILTER (
          WHERE dietary_requirements IS NOT NULL AND btrim(dietary_requirements) <> ''
        )::text AS with_dietary_count,
        COUNT(*) FILTER (
          WHERE dietary_requirements IS NULL OR btrim(dietary_requirements) = ''
        )::text AS no_dietary_supplied_count
      FROM rsvps
      ${baseWhere}
    `),
    pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM rsvps ${listWhere}`,
      values,
    ),
    pool.query<RawRsvpRow>(
      `
      SELECT
        id, full_name, phone_e164, phone_country, attendance_status, attendee_count,
        dietary_requirements, congratulatory_message, submission_source,
        duplicate_review_status, organizer_notes, created_by_admin_id,
        updated_by_admin_id, duplicate_group_id, merged_into_rsvp_id,
        duplicate_reviewed_at, duplicate_reviewed_by_admin_id,
        duplicate_review_note, retention_expires_at, created_at, updated_at
      FROM rsvps
      ${listWhere}
      ORDER BY
        CASE WHEN dietary_requirements IS NOT NULL AND btrim(dietary_requirements) <> '' THEN 0 ELSE 1 END ASC,
        lower(full_name) ASC,
        id ASC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `,
      [...values, pageSize, offset],
    ),
  ]);

  const s = summaryRes.rows[0];
  const total = Number.parseInt(countRes.rows[0]?.total ?? "0", 10);

  return {
    ok: true,
    summary: {
      attendingCount: Number.parseInt(s?.attending_count ?? "0", 10),
      withDietaryCount: Number.parseInt(s?.with_dietary_count ?? "0", 10),
      noDietarySuppliedCount: Number.parseInt(
        s?.no_dietary_supplied_count ?? "0",
        10,
      ),
    },
    items: rowsRes.rows.map(mapRow),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
