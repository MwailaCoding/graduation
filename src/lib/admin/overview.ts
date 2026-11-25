import type { CountryCode } from "libphonenumber-js";
import { pool } from "@/lib/db";
import { DEFAULT_PHONE_COUNTRY } from "@/lib/rsvp/validation";
import { getRetentionSummary } from "@/lib/rsvp/retention";
import { getEffectiveRsvpPolicy } from "@/lib/admin/settings";
import type {
  AdminOverviewResponse,
  AdminRsvpRecord,
  DuplicateReviewStatus,
  OverviewDailySeriesPoint,
  RsvpSubmissionSource,
} from "@/types/admin";
import type { AttendanceStatus } from "@/types/rsvp";

/**
 * Pure zero-division-safe attendance rate percentage (rounded to 1 decimal place).
 */
export function calculateAttendanceRatePct(
  attending: number,
  total: number,
): number {
  if (
    !Number.isFinite(attending) ||
    !Number.isFinite(total) ||
    total <= 0 ||
    attending <= 0
  ) {
    return 0;
  }
  const pct = (attending / total) * 100;
  const clamped = Math.min(100, Math.max(0, pct));
  return Math.round(clamped * 10) / 10;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
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

export interface ExtendedAdminOverview extends AdminOverviewResponse {
  recentlyUpdatedRsvps: AdminRsvpRecord[];
}

export async function getAdminOverview(): Promise<ExtendedAdminOverview> {
  const [
    countsRes,
    recentRes,
    updatedRes,
    dailyRes,
    rsvpPolicy,
    retentionSummary,
  ] = await Promise.all([
    pool.query<{
      total_responses: string;
      attending_count: string;
      declining_count: string;
      with_dietary_count: string;
      no_dietary_supplied_count: string;
      with_message_count: string;
      flagged_duplicates_count: string;
      anonymized_count: string;
      web_count: string;
      admin_manual_count: string;
    }>(`
      SELECT
        COUNT(*) FILTER (
          WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived'
        )::text AS total_responses,
        COUNT(*) FILTER (
          WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND attendance_status = 'attending'
        )::text AS attending_count,
        COUNT(*) FILTER (
          WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND attendance_status = 'declining'
        )::text AS declining_count,
        COUNT(*) FILTER (
          WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived'
            AND attendance_status = 'attending'
            AND dietary_requirements IS NOT NULL AND btrim(dietary_requirements) <> ''
        )::text AS with_dietary_count,
        COUNT(*) FILTER (
          WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived'
            AND attendance_status = 'attending'
            AND (dietary_requirements IS NULL OR btrim(dietary_requirements) = '')
        )::text AS no_dietary_supplied_count,
        COUNT(*) FILTER (
          WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived'
            AND congratulatory_message IS NOT NULL AND btrim(congratulatory_message) <> ''
        )::text AS with_message_count,
        COUNT(*) FILTER (
          WHERE is_anonymized = FALSE AND duplicate_review_status = 'flagged'
        )::text AS flagged_duplicates_count,
        COUNT(*) FILTER (
          WHERE is_anonymized = TRUE
        )::text AS anonymized_count,
        COUNT(*) FILTER (
          WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND submission_source = 'web'
        )::text AS web_count,
        COUNT(*) FILTER (
          WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND submission_source = 'admin_manual'
        )::text AS admin_manual_count
      FROM rsvps
    `),
    pool.query<RawRsvpRow>(`
      SELECT
        id, full_name, phone_e164, phone_country, attendance_status, attendee_count,
        dietary_requirements, congratulatory_message, submission_source,
        duplicate_review_status, organizer_notes, created_by_admin_id,
        updated_by_admin_id, duplicate_group_id, merged_into_rsvp_id,
        duplicate_reviewed_at, duplicate_reviewed_by_admin_id,
        duplicate_review_note, retention_expires_at, created_at, updated_at
      FROM rsvps
      WHERE is_anonymized = FALSE
        AND duplicate_review_status <> 'merged_archived'
      ORDER BY created_at DESC, id DESC
      LIMIT 6
    `),
    pool.query<RawRsvpRow>(`
      SELECT
        id, full_name, phone_e164, phone_country, attendance_status, attendee_count,
        dietary_requirements, congratulatory_message, submission_source,
        duplicate_review_status, organizer_notes, created_by_admin_id,
        updated_by_admin_id, duplicate_group_id, merged_into_rsvp_id,
        duplicate_reviewed_at, duplicate_reviewed_by_admin_id,
        duplicate_review_note, retention_expires_at, created_at, updated_at
      FROM rsvps
      WHERE is_anonymized = FALSE
        AND duplicate_review_status <> 'merged_archived'
        AND updated_at > created_at + INTERVAL '1 second'
      ORDER BY updated_at DESC, id DESC
      LIMIT 6
    `),
    pool.query<{
      day: string;
      total: string;
      attending: string;
      declining: string;
    }>(`
      SELECT
        to_char((created_at AT TIME ZONE 'Africa/Nairobi')::date, 'YYYY-MM-DD') AS day,
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE attendance_status = 'attending')::text AS attending,
        COUNT(*) FILTER (WHERE attendance_status = 'declining')::text AS declining
      FROM rsvps
      WHERE is_anonymized = FALSE
        AND duplicate_review_status <> 'merged_archived'
      GROUP BY 1
      ORDER BY 1 ASC
      LIMIT 60
    `),
    getEffectiveRsvpPolicy(),
    getRetentionSummary(),
  ]);

  const c = countsRes.rows[0];
  const totalResponses = Number.parseInt(c?.total_responses ?? "0", 10);
  const attendingCount = Number.parseInt(c?.attending_count ?? "0", 10);
  const decliningCount = Number.parseInt(c?.declining_count ?? "0", 10);
  const withDietaryCount = Number.parseInt(c?.with_dietary_count ?? "0", 10);
  const noDietarySuppliedCount = Number.parseInt(
    c?.no_dietary_supplied_count ?? "0",
    10,
  );
  const withMessageCount = Number.parseInt(c?.with_message_count ?? "0", 10);
  const flaggedDuplicatesCount = Number.parseInt(
    c?.flagged_duplicates_count ?? "0",
    10,
  );
  const anonymizedCount = Number.parseInt(c?.anonymized_count ?? "0", 10);
  const webCount = Number.parseInt(c?.web_count ?? "0", 10);
  const adminManualCount = Number.parseInt(c?.admin_manual_count ?? "0", 10);

  const dailySubmissionsSeries: OverviewDailySeriesPoint[] = dailyRes.rows.map(
    (row) => ({
      date: row.day,
      total: Number.parseInt(row.total, 10),
      attending: Number.parseInt(row.attending, 10),
      declining: Number.parseInt(row.declining, 10),
    }),
  );

  return {
    ok: true,
    totalResponses,
    attendingCount,
    decliningCount,
    attendanceRatePct: calculateAttendanceRatePct(
      attendingCount,
      totalResponses,
    ),
    withDietaryCount,
    noDietarySuppliedCount,
    withMessageCount,
    flaggedDuplicatesCount,
    anonymizedCount,
    recentRsvps: recentRes.rows.map(mapRow),
    recentlyUpdatedRsvps: updatedRes.rows.map(mapRow),
    dailySubmissionsSeries,
    sourceBreakdown: {
      web: webCount,
      adminManual: adminManualCount,
    },
    rsvpPolicy,
    retentionSummary,
  };
}
