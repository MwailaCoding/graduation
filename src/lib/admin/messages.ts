import { pool } from "@/lib/db";
import type {
  AdminMessageItem,
  AdminMessagesResponse,
  RsvpSubmissionSource,
} from "@/types/admin";
import type { AttendanceStatus } from "@/types/rsvp";

function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export interface ListAdminMessagesParams {
  q?: string;
  attendance?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

interface MessageRow {
  id: string;
  full_name: string;
  attendance_status: AttendanceStatus;
  congratulatory_message: string;
  submission_source: RsvpSubmissionSource;
  created_at: Date | string;
  updated_at: Date | string;
}

export async function listAdminMessages(
  params: ListAdminMessagesParams = {},
): Promise<AdminMessagesResponse> {
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
      : 20;

  const conditions: string[] = [
    "is_anonymized = FALSE",
    "duplicate_review_status <> 'merged_archived'",
    "congratulatory_message IS NOT NULL",
    "btrim(congratulatory_message) <> ''",
  ];
  const values: unknown[] = [];

  if (params.attendance === "attending" || params.attendance === "declining") {
    values.push(params.attendance);
    conditions.push(`attendance_status = $${values.length}`);
  }

  if (params.q && params.q.trim()) {
    const escaped = escapeIlikePattern(params.q.trim().slice(0, 120));
    values.push(`%${escaped}%`);
    const idx = values.length;
    conditions.push(
      `(full_name ILIKE $${idx} ESCAPE '\\' OR congratulatory_message ILIKE $${idx} ESCAPE '\\')`,
    );
  }

  const sortOrder = params.sort === "oldest" ? "ASC" : "DESC";
  const whereClause = `WHERE ${conditions.join(" AND ")}`;
  const offset = (page - 1) * pageSize;

  const [countRes, rowsRes] = await Promise.all([
    pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM rsvps ${whereClause}`,
      values,
    ),
    pool.query<MessageRow>(
      `
      SELECT
        id,
        full_name,
        attendance_status,
        congratulatory_message,
        submission_source,
        created_at,
        updated_at
      FROM rsvps
      ${whereClause}
      ORDER BY created_at ${sortOrder}, id ${sortOrder}
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `,
      [...values, pageSize, offset],
    ),
  ]);

  const total = Number.parseInt(countRes.rows[0]?.total ?? "0", 10);
  const items: AdminMessageItem[] = rowsRes.rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    attendance: row.attendance_status,
    congratulatoryMessage: row.congratulatory_message,
    submissionSource: row.submission_source,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  }));

  return {
    ok: true,
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
