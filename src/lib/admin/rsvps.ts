import crypto from "node:crypto";
import type { CountryCode } from "libphonenumber-js";
import { pool } from "@/lib/db";
import { RETENTION_ANONYMIZATION_DATE_ISO } from "@/lib/event-config";
import { logAdminAuditEvent } from "@/lib/admin/audit";
import type { AdminActorContext } from "@/lib/admin/settings";
import {
  generateManagementToken,
  hashManagementToken,
} from "@/lib/rsvp/tokens";
import {
  DEFAULT_PHONE_COUNTRY,
  normalizeAndValidateName,
  normalizeAndValidatePhone,
  normalizePhoneCountry,
  sanitizeTextInput,
  validateAttendance,
  validateCongratulatoryMessage,
  validateDietaryRequirements,
} from "@/lib/rsvp/validation";
import type {
  AdminDuplicatesResponse,
  AdminFieldErrors,
  AdminManualRsvpInput,
  AdminResolveDuplicateInput,
  AdminRsvpListResponse,
  AdminRsvpRecord,
  AdminUpdateRsvpInput,
  DuplicateCandidateGroup,
  DuplicateReviewStatus,
  RsvpSubmissionSource,
} from "@/types/admin";
import type { AttendanceStatus } from "@/types/rsvp";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ORGANIZER_NOTES_MAX_LENGTH = 500;
const DUPLICATE_NOTE_MAX_LENGTH = 500;

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export type RsvpSortField = "full_name" | "created_at" | "updated_at";
export type RsvpSortOrder = "asc" | "desc";
export type DietaryFilter = "all" | "has_dietary" | "no_dietary";
export type MessageFilter = "all" | "has_message" | "no_message";

export interface NormalizedRsvpQueryParams {
  q: string;
  attendance: "all" | AttendanceStatus;
  dietary: DietaryFilter;
  message: MessageFilter;
  source: "all" | RsvpSubmissionSource;
  duplicateStatus: "all" | DuplicateReviewStatus;
  from: string | null;
  to: string | null;
  sort: RsvpSortField;
  order: RsvpSortOrder;
  page: number;
  pageSize: number;
}

const SORT_COLUMN_SQL: Record<RsvpSortField, string> = {
  full_name: "lower(full_name)",
  created_at: "created_at",
  updated_at: "updated_at",
};

/**
 * Strictly validates and normalizes RSVP list query params against allowlists
 * so no untrusted sort/filter input can ever reach SQL.
 */
export function normalizeRsvpQueryParams(
  raw: Record<string, unknown> = {},
): NormalizedRsvpQueryParams {
  const q =
    typeof raw.q === "string"
      ? raw.q.trim().slice(0, 120)
      : typeof raw.search === "string"
        ? raw.search.trim().slice(0, 120)
        : "";

  const attendance: "all" | AttendanceStatus =
    raw.attendance === "attending" || raw.attendance === "declining"
      ? raw.attendance
      : "all";

  let dietary: DietaryFilter = "all";
  if (raw.dietary === "has_dietary" || raw.hasDietary === "true" || raw.hasDietary === true) {
    dietary = "has_dietary";
  } else if (raw.dietary === "no_dietary" || raw.hasDietary === "false" || raw.hasDietary === false) {
    dietary = "no_dietary";
  }

  let message: MessageFilter = "all";
  if (raw.message === "has_message" || raw.hasMessage === "true" || raw.hasMessage === true) {
    message = "has_message";
  } else if (raw.message === "no_message" || raw.hasMessage === "false" || raw.hasMessage === false) {
    message = "no_message";
  }

  const source: "all" | RsvpSubmissionSource =
    raw.source === "web" || raw.source === "admin_manual" ? raw.source : "all";

  const duplicateStatus: "all" | DuplicateReviewStatus =
    raw.duplicateStatus === "none" ||
    raw.duplicateStatus === "flagged" ||
    raw.duplicateStatus === "resolved_distinct" ||
    raw.duplicateStatus === "merged_archived"
      ? raw.duplicateStatus
      : "all";

  let from: string | null = null;
  if (typeof raw.from === "string" && raw.from.trim()) {
    const d = new Date(raw.from.trim());
    if (Number.isFinite(d.getTime())) {
      from = d.toISOString();
    }
  }

  let to: string | null = null;
  if (typeof raw.to === "string" && raw.to.trim()) {
    const trimmed = raw.to.trim();
    const d = new Date(
      /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
        ? `${trimmed}T23:59:59.999+03:00`
        : trimmed,
    );
    if (Number.isFinite(d.getTime())) {
      to = d.toISOString();
    }
  }

  const rawSort = raw.sort ?? raw.sortBy;
  let sort: RsvpSortField = "created_at";
  if (rawSort === "full_name" || rawSort === "name") {
    sort = "full_name";
  } else if (rawSort === "updated_at") {
    sort = "updated_at";
  } else if (rawSort === "created_at") {
    sort = "created_at";
  }

  const rawOrder = String(raw.order ?? raw.sortOrder ?? "desc").toLowerCase();
  const order: RsvpSortOrder = rawOrder === "asc" ? "asc" : "desc";

  const parsedPage = Number.parseInt(String(raw.page ?? "1"), 10);
  const page = Number.isInteger(parsedPage) && parsedPage >= 1 ? parsedPage : 1;

  const parsedPageSize = Number.parseInt(String(raw.pageSize ?? "25"), 10);
  const pageSize =
    Number.isInteger(parsedPageSize) && parsedPageSize >= 1
      ? Math.min(100, parsedPageSize)
      : 25;

  return {
    q,
    attendance,
    dietary,
    message,
    source,
    duplicateStatus,
    from,
    to,
    sort,
    order,
    page,
    pageSize,
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

const ADMIN_RSVP_SELECT_COLUMNS = `
  id,
  full_name,
  phone_e164,
  phone_country,
  attendance_status,
  attendee_count,
  dietary_requirements,
  congratulatory_message,
  submission_source,
  duplicate_review_status,
  organizer_notes,
  created_by_admin_id,
  updated_by_admin_id,
  duplicate_group_id,
  merged_into_rsvp_id,
  duplicate_reviewed_at,
  duplicate_reviewed_by_admin_id,
  duplicate_review_note,
  retention_expires_at,
  created_at,
  updated_at
`;

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

export function mapAdminRsvpRow(row: RawRsvpRow): AdminRsvpRecord {
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

export async function listAdminRsvps(
  rawParams: Record<string, unknown> = {},
): Promise<AdminRsvpListResponse> {
  const params = normalizeRsvpQueryParams(rawParams);

  const conditions: string[] = ["is_anonymized = FALSE"];
  const values: unknown[] = [];

  if (params.duplicateStatus === "all") {
    conditions.push("duplicate_review_status <> 'merged_archived'");
  } else {
    values.push(params.duplicateStatus);
    conditions.push(`duplicate_review_status = $${values.length}`);
  }

  if (params.attendance !== "all") {
    values.push(params.attendance);
    conditions.push(`attendance_status = $${values.length}`);
  }

  if (params.dietary === "has_dietary") {
    conditions.push(
      "dietary_requirements IS NOT NULL AND btrim(dietary_requirements) <> ''",
    );
  } else if (params.dietary === "no_dietary") {
    conditions.push(
      "(dietary_requirements IS NULL OR btrim(dietary_requirements) = '')",
    );
  }

  if (params.message === "has_message") {
    conditions.push(
      "congratulatory_message IS NOT NULL AND btrim(congratulatory_message) <> ''",
    );
  } else if (params.message === "no_message") {
    conditions.push(
      "(congratulatory_message IS NULL OR btrim(congratulatory_message) = '')",
    );
  }

  if (params.source !== "all") {
    values.push(params.source);
    conditions.push(`submission_source = $${values.length}`);
  }

  if (params.from) {
    values.push(params.from);
    conditions.push(`created_at >= $${values.length}::timestamptz`);
  }

  if (params.to) {
    values.push(params.to);
    conditions.push(`created_at <= $${values.length}::timestamptz`);
  }

  if (params.q) {
    const escaped = escapeIlikePattern(params.q);
    values.push(`%${escaped}%`);
    const idx = values.length;
    conditions.push(
      `(full_name ILIKE $${idx} ESCAPE '\\' OR phone_e164 ILIKE $${idx} ESCAPE '\\')`,
    );
  }

  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const sortExpr = SORT_COLUMN_SQL[params.sort];
  const sortDir = params.order === "asc" ? "ASC" : "DESC";
  const offset = (params.page - 1) * params.pageSize;

  const [countRes, rowsRes, summaryCountsRes] = await Promise.all([
    pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM rsvps ${whereClause}`,
      values,
    ),
    pool.query<RawRsvpRow>(
      `
      SELECT ${ADMIN_RSVP_SELECT_COLUMNS}
      FROM rsvps
      ${whereClause}
      ORDER BY ${sortExpr} ${sortDir}, id ASC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `,
      [...values, params.pageSize, offset],
    ),
    pool.query<{
      total: string;
      attending: string;
      declining: string;
      with_dietary: string;
      with_message: string;
      flagged_duplicates: string;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived')::text AS total,
        COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND attendance_status = 'attending')::text AS attending,
        COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND attendance_status = 'declining')::text AS declining,
        COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND attendance_status = 'attending' AND dietary_requirements IS NOT NULL AND btrim(dietary_requirements) <> '')::text AS with_dietary,
        COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status <> 'merged_archived' AND congratulatory_message IS NOT NULL AND btrim(congratulatory_message) <> '')::text AS with_message,
        COUNT(*) FILTER (WHERE is_anonymized = FALSE AND duplicate_review_status = 'flagged')::text AS flagged_duplicates
      FROM rsvps
    `),
  ]);

  const total = Number.parseInt(countRes.rows[0]?.total ?? "0", 10);
  const c = summaryCountsRes.rows[0];

  return {
    ok: true,
    items: rowsRes.rows.map(mapAdminRsvpRow),
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
    counts: {
      total: Number.parseInt(c?.total ?? "0", 10),
      attending: Number.parseInt(c?.attending ?? "0", 10),
      declining: Number.parseInt(c?.declining ?? "0", 10),
      withDietary: Number.parseInt(c?.with_dietary ?? "0", 10),
      withMessage: Number.parseInt(c?.with_message ?? "0", 10),
      flaggedDuplicates: Number.parseInt(c?.flagged_duplicates ?? "0", 10),
    },
  };
}

export async function getAdminRsvpById(
  id: string,
): Promise<AdminRsvpRecord | null> {
  if (!isValidUuid(id)) {
    return null;
  }

  const result = await pool.query<RawRsvpRow>(
    `
    SELECT ${ADMIN_RSVP_SELECT_COLUMNS}
    FROM rsvps
    WHERE id = $1::uuid
      AND is_anonymized = FALSE
    LIMIT 1
    `,
    [id.trim()],
  );

  const row = result.rows[0];
  return row ? mapAdminRsvpRow(row) : null;
}

function validateOrganizerNotes(raw: unknown): {
  valid: boolean;
  value: string | null;
  error?: string;
} {
  if (raw === undefined || raw === null) {
    return { valid: true, value: null };
  }
  if (typeof raw !== "string") {
    return {
      valid: false,
      value: null,
      error: "Organizer notes must be plain text.",
    };
  }
  const cleaned = sanitizeTextInput(raw);
  if (!cleaned) {
    return { valid: true, value: null };
  }
  if (cleaned.length > ORGANIZER_NOTES_MAX_LENGTH) {
    return {
      valid: false,
      value: cleaned,
      error: `Organizer notes must be ${ORGANIZER_NOTES_MAX_LENGTH} characters or fewer.`,
    };
  }
  return { valid: true, value: cleaned };
}

export async function createAdminManualRsvp(
  input: Partial<AdminManualRsvpInput> & Record<string, unknown>,
  actor: AdminActorContext,
): Promise<
  | { ok: true; status: 201; rsvp: AdminRsvpRecord }
  | {
      ok: false;
      status: 400 | 409 | 500;
      code: "VALIDATION_ERROR" | "CONFLICT" | "INTERNAL_ERROR";
      message: string;
      fieldErrors?: AdminFieldErrors;
    }
> {
  const fieldErrors: AdminFieldErrors = {};

  const nameResult = normalizeAndValidateName(input.fullName);
  if (!nameResult.valid && nameResult.error) {
    fieldErrors.fullName = nameResult.error;
  }

  const explicitCountry = normalizePhoneCountry(input.phoneCountry);
  if (input.phoneCountry !== undefined && !explicitCountry) {
    fieldErrors.phoneCountry = "Please select a valid country.";
  }

  const phoneResult = normalizeAndValidatePhone(
    input.phoneNumber,
    explicitCountry ?? DEFAULT_PHONE_COUNTRY,
  );
  if (!phoneResult.valid && phoneResult.error) {
    fieldErrors.phoneNumber = phoneResult.error;
  }

  const attendanceResult = validateAttendance(input.attendance);
  if (!attendanceResult.valid && attendanceResult.error) {
    fieldErrors.attendance = attendanceResult.error;
  }

  const dietaryResult = validateDietaryRequirements(
    input.dietaryRequirements,
    attendanceResult.value,
  );
  if (!dietaryResult.valid && dietaryResult.error) {
    fieldErrors.dietaryRequirements = dietaryResult.error;
  }

  const messageResult = validateCongratulatoryMessage(
    input.congratulatoryMessage,
  );
  if (!messageResult.valid && messageResult.error) {
    fieldErrors.congratulatoryMessage = messageResult.error;
  }

  const notesResult = validateOrganizerNotes(input.organizerNotes);
  if (!notesResult.valid && notesResult.error) {
    fieldErrors.organizerNotes = notesResult.error;
  }

  const resolution =
    input.sharedPhoneResolution === "flag_duplicate" ||
    input.sharedPhoneResolution === "resolved_distinct"
      ? input.sharedPhoneResolution
      : "none";

  if (Object.keys(fieldErrors).length > 0 || !attendanceResult.value) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Please review the highlighted fields and try again.",
      fieldErrors,
    };
  }

  const attendance = attendanceResult.value;
  const attendeeCount = attendance === "attending" ? 1 : 0;
  const clearedDietary = attendance === "declining" ? null : dietaryResult.value;

  const managementToken = generateManagementToken();
  const tokenHash = hashManagementToken(managementToken);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existingPhoneRes = await client.query<{
      id: string;
      duplicate_review_status: DuplicateReviewStatus;
      duplicate_group_id: string | null;
    }>(
      `
      SELECT id, duplicate_review_status, duplicate_group_id
      FROM rsvps
      WHERE phone_e164 = $1
        AND is_anonymized = FALSE
        AND duplicate_review_status <> 'merged_archived'
      FOR UPDATE
      `,
      [phoneResult.e164],
    );

    const hasExistingPhone = existingPhoneRes.rows.length > 0;
    const hasUnresolvedNone = existingPhoneRes.rows.some(
      (r) => r.duplicate_review_status === "none",
    );

    if (hasExistingPhone && resolution === "none" && hasUnresolvedNone) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: 409,
        code: "CONFLICT",
        message:
          "An RSVP with this phone number already exists. Confirm whether to flag this entry for duplicate review or record it as a distinct guest sharing the phone number.",
        fieldErrors: {
          phoneNumber:
            "Phone number already exists. Choose a shared-phone option below.",
        },
      };
    }

    let duplicateStatus: DuplicateReviewStatus = "none";
    let duplicateGroupId: string | null = null;
    let duplicateReviewedAt: string | null = null;
    let duplicateReviewedBy: string | null = null;

    if (resolution === "flag_duplicate" && hasExistingPhone) {
      duplicateStatus = "flagged";
      duplicateGroupId =
        existingPhoneRes.rows.find((r) => r.duplicate_group_id)?.duplicate_group_id ??
        crypto.randomUUID();

      await client.query(
        `
        UPDATE rsvps
        SET
          duplicate_review_status = CASE
            WHEN duplicate_review_status = 'none' THEN 'flagged'
            ELSE duplicate_review_status
          END,
          duplicate_group_id = COALESCE(duplicate_group_id, $1::uuid)
        WHERE id = ANY($2::uuid[])
        `,
        [duplicateGroupId, existingPhoneRes.rows.map((r) => r.id)],
      );
    } else if (resolution === "resolved_distinct") {
      duplicateStatus = "resolved_distinct";
      duplicateReviewedAt = new Date().toISOString();
      duplicateReviewedBy = actor.adminId;
    } else if (resolution === "flag_duplicate") {
      duplicateStatus = "flagged";
      duplicateGroupId = crypto.randomUUID();
    }

    const insertRes = await client.query<RawRsvpRow>(
      `
      INSERT INTO rsvps (
        full_name,
        phone_e164,
        phone_country,
        attendance_status,
        attendee_count,
        dietary_requirements,
        congratulatory_message,
        management_token_hash,
        privacy_acknowledged,
        privacy_acknowledged_at,
        submission_source,
        duplicate_review_status,
        duplicate_group_id,
        duplicate_reviewed_at,
        duplicate_reviewed_by_admin_id,
        organizer_notes,
        created_by_admin_id,
        updated_by_admin_id,
        retention_expires_at
      ) VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        TRUE,
        NOW(),
        'admin_manual',
        $9,
        $10::uuid,
        $11::timestamptz,
        $12::uuid,
        $13,
        $14::uuid,
        $14::uuid,
        $15::timestamptz
      )
      RETURNING ${ADMIN_RSVP_SELECT_COLUMNS}
      `,
      [
        nameResult.value,
        phoneResult.e164,
        phoneResult.country,
        attendance,
        attendeeCount,
        clearedDietary,
        messageResult.value,
        tokenHash,
        duplicateStatus,
        duplicateGroupId,
        duplicateReviewedAt,
        duplicateReviewedBy,
        notesResult.value,
        actor.adminId,
        RETENTION_ANONYMIZATION_DATE_ISO,
      ],
    );

    await client.query("COMMIT");

    const record = mapAdminRsvpRow(insertRes.rows[0]);

    await logAdminAuditEvent({
      actorAdminId: actor.adminId,
      actorIdentifier: actor.email,
      action: "rsvp.manual_create",
      targetType: "rsvp",
      targetId: record.id,
      summary: `Created manual RSVP record (${record.attendance}, source: admin_manual)`,
      metadata: {
        attendance: record.attendance,
        submissionSource: "admin_manual",
        duplicateReviewStatus: record.duplicateReviewStatus,
        hasDietary: record.dietaryRequirements !== null,
        hasMessage: record.congratulatoryMessage !== null,
      },
      clientKey: actor.clientKey,
    });

    return { ok: true, status: 201, rsvp: record };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    const pgCode =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code)
        : "";
    if (pgCode === "23505") {
      return {
        ok: false,
        status: 409,
        code: "CONFLICT",
        message:
          "An active RSVP with this phone number already exists. Flag as duplicate or mark as distinct guest.",
        fieldErrors: { phoneNumber: "Phone number already exists." },
      };
    }
    return {
      ok: false,
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Unable to create the manual RSVP record right now.",
    };
  } finally {
    client.release();
  }
}

export async function updateAdminRsvp(
  id: string,
  input: Partial<AdminUpdateRsvpInput> & Record<string, unknown>,
  actor: AdminActorContext,
): Promise<
  | { ok: true; status: 200; rsvp: AdminRsvpRecord }
  | {
      ok: false;
      status: 400 | 404 | 409 | 500;
      code: "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR";
      message: string;
      fieldErrors?: AdminFieldErrors;
    }
> {
  if (!isValidUuid(id)) {
    return {
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      message: "RSVP record not found.",
    };
  }

  const fieldErrors: AdminFieldErrors = {};

  const nameResult = normalizeAndValidateName(input.fullName);
  if (!nameResult.valid && nameResult.error) {
    fieldErrors.fullName = nameResult.error;
  }

  const explicitCountry = normalizePhoneCountry(input.phoneCountry);
  if (input.phoneCountry !== undefined && !explicitCountry) {
    fieldErrors.phoneCountry = "Please select a valid country.";
  }

  const phoneResult = normalizeAndValidatePhone(
    input.phoneNumber,
    explicitCountry ?? DEFAULT_PHONE_COUNTRY,
  );
  if (!phoneResult.valid && phoneResult.error) {
    fieldErrors.phoneNumber = phoneResult.error;
  }

  const attendanceResult = validateAttendance(input.attendance);
  if (!attendanceResult.valid && attendanceResult.error) {
    fieldErrors.attendance = attendanceResult.error;
  }

  const dietaryResult = validateDietaryRequirements(
    input.dietaryRequirements,
    attendanceResult.value,
  );
  if (!dietaryResult.valid && dietaryResult.error) {
    fieldErrors.dietaryRequirements = dietaryResult.error;
  }

  const messageResult = validateCongratulatoryMessage(
    input.congratulatoryMessage,
  );
  if (!messageResult.valid && messageResult.error) {
    fieldErrors.congratulatoryMessage = messageResult.error;
  }

  const notesResult = validateOrganizerNotes(input.organizerNotes);
  if (!notesResult.valid && notesResult.error) {
    fieldErrors.organizerNotes = notesResult.error;
  }

  if (Object.keys(fieldErrors).length > 0 || !attendanceResult.value) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Please review the highlighted fields and try again.",
      fieldErrors,
    };
  }

  const attendance = attendanceResult.value;
  const attendeeCount = attendance === "attending" ? 1 : 0;
  const clearedDietary = attendance === "declining" ? null : dietaryResult.value;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existingRes = await client.query<{
      id: string;
      attendance_status: AttendanceStatus;
      duplicate_review_status: DuplicateReviewStatus;
      organizer_notes: string | null;
    }>(
      `
      SELECT id, attendance_status, duplicate_review_status, organizer_notes
      FROM rsvps
      WHERE id = $1::uuid AND is_anonymized = FALSE
      FOR UPDATE
      `,
      [id.trim()],
    );

    const existing = existingRes.rows[0];
    if (!existing) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: 404,
        code: "NOT_FOUND",
        message: "RSVP record not found.",
      };
    }

    if (existing.duplicate_review_status === "none") {
      const conflictRes = await client.query(
        `
        SELECT 1 FROM rsvps
        WHERE id <> $1::uuid
          AND phone_e164 = $2
          AND is_anonymized = FALSE
          AND duplicate_review_status = 'none'
        LIMIT 1
        `,
        [existing.id, phoneResult.e164],
      );
      if ((conflictRes.rowCount ?? 0) > 0) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          status: 409,
          code: "CONFLICT",
          message:
            "Another active RSVP already uses this phone number. Review duplicates before reusing the same phone number.",
          fieldErrors: { phoneNumber: "Phone number already in use." },
        };
      }
    }

    const nextNotes =
      input.organizerNotes !== undefined
        ? notesResult.value
        : existing.organizer_notes;

    const updateRes = await client.query<RawRsvpRow>(
      `
      UPDATE rsvps
      SET
        full_name = $1,
        phone_e164 = $2,
        phone_country = $3,
        attendance_status = $4,
        attendee_count = $5,
        dietary_requirements = $6,
        congratulatory_message = $7,
        organizer_notes = $8,
        updated_by_admin_id = $9::uuid,
        updated_at = NOW()
      WHERE id = $10::uuid
        AND is_anonymized = FALSE
      RETURNING ${ADMIN_RSVP_SELECT_COLUMNS}
      `,
      [
        nameResult.value,
        phoneResult.e164,
        phoneResult.country,
        attendance,
        attendeeCount,
        clearedDietary,
        messageResult.value,
        nextNotes,
        actor.adminId,
        existing.id,
      ],
    );

    await client.query("COMMIT");

    const updated = mapAdminRsvpRow(updateRes.rows[0]);

    await logAdminAuditEvent({
      actorAdminId: actor.adminId,
      actorIdentifier: actor.email,
      action: "rsvp.edit",
      targetType: "rsvp",
      targetId: updated.id,
      summary: `Updated RSVP record (attendance: ${existing.attendance_status} -> ${updated.attendance})`,
      metadata: {
        previousAttendance: existing.attendance_status,
        attendance: updated.attendance,
        hasDietary: updated.dietaryRequirements !== null,
        hasMessage: updated.congratulatoryMessage !== null,
      },
      clientKey: actor.clientKey,
    });

    return { ok: true, status: 200, rsvp: updated };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    const pgCode =
      typeof err === "object" && err !== null && "code" in err
        ? String((err as { code?: unknown }).code)
        : "";
    if (pgCode === "23505") {
      return {
        ok: false,
        status: 409,
        code: "CONFLICT",
        message: "Another active RSVP already uses this phone number.",
        fieldErrors: { phoneNumber: "Phone number already in use." },
      };
    }
    return {
      ok: false,
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Unable to update the RSVP record right now.",
    };
  } finally {
    client.release();
  }
}

export async function deleteAdminRsvp(
  id: string,
  actor: AdminActorContext,
): Promise<
  | { ok: true; status: 200; deletedId: string }
  | { ok: false; status: 404 | 500; code: "NOT_FOUND" | "INTERNAL_ERROR"; message: string }
> {
  if (!isValidUuid(id)) {
    return {
      ok: false,
      status: 404,
      code: "NOT_FOUND",
      message: "RSVP record not found.",
    };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existingRes = await client.query<{
      id: string;
      attendance_status: AttendanceStatus;
      submission_source: RsvpSubmissionSource;
    }>(
      `
      SELECT id, attendance_status, submission_source
      FROM rsvps
      WHERE id = $1::uuid
      FOR UPDATE
      `,
      [id.trim()],
    );

    const existing = existingRes.rows[0];
    if (!existing) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: 404,
        code: "NOT_FOUND",
        message: "RSVP record not found.",
      };
    }

    await client.query("DELETE FROM rsvps WHERE id = $1::uuid", [existing.id]);
    await client.query("COMMIT");

    await logAdminAuditEvent({
      actorAdminId: actor.adminId,
      actorIdentifier: actor.email,
      action: "rsvp.delete",
      targetType: "rsvp",
      targetId: existing.id,
      summary: `Deleted RSVP record (${existing.attendance_status}, source: ${existing.submission_source})`,
      metadata: {
        attendance: existing.attendance_status,
        submissionSource: existing.submission_source,
      },
      clientKey: actor.clientKey,
    });

    return { ok: true, status: 200, deletedId: existing.id };
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return {
      ok: false,
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Unable to delete the RSVP record right now.",
    };
  } finally {
    client.release();
  }
}

/**
 * Finds unresolved duplicate candidate groups:
 * 1. Shared phone numbers (2+ active non-archived rows where at least one is not resolved_distinct)
 * 2. Explicitly flagged duplicate groups
 * 3. Exact normalized duplicate names (2+ active non-archived rows where at least one is not resolved_distinct)
 */
export async function listDuplicateCandidates(): Promise<AdminDuplicatesResponse> {
  const result = await pool.query<RawRsvpRow>(
    `
    SELECT ${ADMIN_RSVP_SELECT_COLUMNS}
    FROM rsvps
    WHERE is_anonymized = FALSE
      AND duplicate_review_status <> 'merged_archived'
    ORDER BY created_at ASC, id ASC
    `,
  );

  const records = result.rows.map(mapAdminRsvpRow);
  const candidates: DuplicateCandidateGroup[] = [];
  const coveredRecordPairs = new Set<string>();

  // 1. Group by phone_e164
  const byPhone = new Map<string, AdminRsvpRecord[]>();
  for (const rec of records) {
    const list = byPhone.get(rec.phoneE164) ?? [];
    list.push(rec);
    byPhone.set(rec.phoneE164, list);
  }

  for (const [phone, group] of byPhone.entries()) {
    const hasUnresolved = group.some(
      (r) => r.duplicateReviewStatus !== "resolved_distinct",
    );
    if (group.length >= 2 && hasUnresolved) {
      candidates.push({
        groupKey: `phone:${phone}`,
        matchReason: "same_phone",
        records: group,
      });
      for (const r of group) {
        coveredRecordPairs.add(r.id);
      }
    }
  }

  // 2. Group by normalized full name (for records not already grouped by phone)
  const byName = new Map<string, AdminRsvpRecord[]>();
  for (const rec of records) {
    const normalized = rec.fullName.trim().toLowerCase().replace(/\s+/g, " ");
    const list = byName.get(normalized) ?? [];
    list.push(rec);
    byName.set(normalized, list);
  }

  for (const [normName, group] of byName.entries()) {
    const hasUnresolved = group.some(
      (r) => r.duplicateReviewStatus !== "resolved_distinct",
    );
    const hasNewPair = group.some((r) => !coveredRecordPairs.has(r.id));
    if (group.length >= 2 && hasUnresolved && hasNewPair) {
      candidates.push({
        groupKey: `name:${normName}`,
        matchReason: "similar_name",
        records: group,
      });
    }
  }

  return {
    ok: true,
    candidates,
    totalCandidates: candidates.length,
  };
}

export async function resolveDuplicateGroup(
  input: Partial<AdminResolveDuplicateInput> & Record<string, unknown>,
  actor: AdminActorContext,
): Promise<
  | { ok: true; status: 200; updatedCount: number }
  | {
      ok: false;
      status: 400 | 404 | 500;
      code: "VALIDATION_ERROR" | "NOT_FOUND" | "INTERNAL_ERROR";
      message: string;
      fieldErrors?: AdminFieldErrors;
    }
> {
  const fieldErrors: AdminFieldErrors = {};

  const resolution = input.resolution;
  if (
    resolution !== "resolved_distinct" &&
    resolution !== "merged_archived" &&
    resolution !== "flag"
  ) {
    fieldErrors.resolution =
      "Resolution must be 'resolved_distinct', 'merged_archived', or 'flag'.";
  }

  if (!isValidUuid(input.primaryRsvpId)) {
    fieldErrors.primaryRsvpId = "A valid primary RSVP ID is required.";
  }

  const rawTargets = Array.isArray(input.targetRsvpIds)
    ? input.targetRsvpIds
    : [];
  const targetIds = rawTargets
    .filter((id): id is string => isValidUuid(id))
    .map((id) => id.trim());

  if (targetIds.length === 0) {
    fieldErrors.targetRsvpIds = "At least one target RSVP ID is required.";
  }

  const primaryId = isValidUuid(input.primaryRsvpId)
    ? input.primaryRsvpId.trim()
    : "";

  if (primaryId && targetIds.includes(primaryId)) {
    fieldErrors.targetRsvpIds =
      "Target RSVP IDs cannot include the primary RSVP ID.";
  }

  let cleanedNote: string | null = null;
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== "string") {
      fieldErrors.note = "Review note must be plain text.";
    } else {
      const sanitized = sanitizeTextInput(input.note);
      if (sanitized.length > DUPLICATE_NOTE_MAX_LENGTH) {
        fieldErrors.note = `Review note must be ${DUPLICATE_NOTE_MAX_LENGTH} characters or fewer.`;
      } else {
        cleanedNote = sanitized.length > 0 ? sanitized : null;
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      status: 400,
      code: "VALIDATION_ERROR",
      message: "Please provide valid duplicate resolution details.",
      fieldErrors,
    };
  }

  const allIds = Array.from(new Set([primaryId, ...targetIds]));
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const foundRes = await client.query<{
      id: string;
      phone_e164: string;
      duplicate_group_id: string | null;
    }>(
      `
      SELECT id, phone_e164, duplicate_group_id
      FROM rsvps
      WHERE id = ANY($1::uuid[])
        AND is_anonymized = FALSE
      FOR UPDATE
      `,
      [allIds],
    );

    if (foundRes.rows.length !== allIds.length) {
      await client.query("ROLLBACK");
      return {
        ok: false,
        status: 404,
        code: "NOT_FOUND",
        message: "One or more RSVP records could not be found.",
      };
    }

    const groupId =
      foundRes.rows.find((r) => r.duplicate_group_id)?.duplicate_group_id ??
      crypto.randomUUID();

    if (resolution === "resolved_distinct") {
      await client.query(
        `
        UPDATE rsvps
        SET
          duplicate_review_status = 'resolved_distinct',
          duplicate_group_id = $1::uuid,
          merged_into_rsvp_id = NULL,
          duplicate_reviewed_at = NOW(),
          duplicate_reviewed_by_admin_id = $2::uuid,
          duplicate_review_note = $3,
          updated_by_admin_id = $2::uuid,
          updated_at = NOW()
        WHERE id = ANY($4::uuid[])
        `,
        [groupId, actor.adminId, cleanedNote, allIds],
      );
    } else if (resolution === "merged_archived") {
      // Archive targets first so unique index on status='none' is freed for primary
      await client.query(
        `
        UPDATE rsvps
        SET
          duplicate_review_status = 'merged_archived',
          duplicate_group_id = $1::uuid,
          merged_into_rsvp_id = $2::uuid,
          duplicate_reviewed_at = NOW(),
          duplicate_reviewed_by_admin_id = $3::uuid,
          duplicate_review_note = $4,
          updated_by_admin_id = $3::uuid,
          updated_at = NOW()
        WHERE id = ANY($5::uuid[])
        `,
        [groupId, primaryId, actor.adminId, cleanedNote, targetIds],
      );

      // Check if another active status='none' record still holds primary's phone
      const primaryRow = foundRes.rows.find((r) => r.id === primaryId)!;
      const otherNoneRes = await client.query(
        `
        SELECT 1 FROM rsvps
        WHERE id <> $1::uuid
          AND phone_e164 = $2
          AND is_anonymized = FALSE
          AND duplicate_review_status = 'none'
        LIMIT 1
        `,
        [primaryId, primaryRow.phone_e164],
      );
      const nextPrimaryStatus: DuplicateReviewStatus =
        (otherNoneRes.rowCount ?? 0) > 0 ? "resolved_distinct" : "none";

      await client.query(
        `
        UPDATE rsvps
        SET
          duplicate_review_status = $1,
          duplicate_group_id = $2::uuid,
          merged_into_rsvp_id = NULL,
          duplicate_reviewed_at = NOW(),
          duplicate_reviewed_by_admin_id = $3::uuid,
          duplicate_review_note = $4,
          updated_by_admin_id = $3::uuid,
          updated_at = NOW()
        WHERE id = $5::uuid
        `,
        [nextPrimaryStatus, groupId, actor.adminId, cleanedNote, primaryId],
      );
    } else {
      await client.query(
        `
        UPDATE rsvps
        SET
          duplicate_review_status = 'flagged',
          duplicate_group_id = $1::uuid,
          duplicate_reviewed_at = NOW(),
          duplicate_reviewed_by_admin_id = $2::uuid,
          duplicate_review_note = $3,
          updated_by_admin_id = $2::uuid,
          updated_at = NOW()
        WHERE id = ANY($4::uuid[])
        `,
        [groupId, actor.adminId, cleanedNote, allIds],
      );
    }

    await client.query("COMMIT");

    await logAdminAuditEvent({
      actorAdminId: actor.adminId,
      actorIdentifier: actor.email,
      action: "rsvp.duplicate_resolve",
      targetType: "rsvp",
      targetId: primaryId,
      summary: `Resolved duplicate group (${resolution}, ${targetIds.length} target record(s))`,
      metadata: {
        resolution,
        primaryRsvpId: primaryId,
        targetCount: targetIds.length,
        hasNote: cleanedNote !== null,
      },
      clientKey: actor.clientKey,
    });

    return { ok: true, status: 200, updatedCount: allIds.length };
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    return {
      ok: false,
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Unable to resolve duplicate records right now.",
    };
  } finally {
    client.release();
  }
}
