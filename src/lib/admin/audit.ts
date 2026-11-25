import crypto from "node:crypto";
import { pool } from "@/lib/db";
import type {
  AdminAuditAction,
  AdminAuditLogEntry,
  AdminAuditLogListResponse,
  AdminAuditTargetType,
} from "@/types/admin";

const DEFAULT_PEPPER = "mwaila-rsvp-v1-bucket-salt";
const CONTROL_CHARS_RE = /[\u0000-\u001F\u007F]/g;

const SENSITIVE_KEY_PATTERN =
  /password|passphrase|secret|token|cookie|authorization|session_?id|hash|credential|pepper|database_url|api_?key/i;

const PII_METADATA_KEY_SET = new Set([
  "ip",
  "ipaddress",
  "rawip",
  "phone",
  "phonenumber",
  "phonee164",
  "dietaryrequirements",
  "congratulatorymessage",
]);

const SENSITIVE_VALUE_PATTERNS: ReadonlyArray<{
  pattern: RegExp;
  replacement: string;
}> = [
  {
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
    replacement: "Bearer [REDACTED]",
  },
  {
    pattern: /\bscrypt\$[0-9a-f]+\$[0-9a-f]+/gi,
    replacement: "[REDACTED_HASH]",
  },
  {
    pattern: /\/rsvp\/manage\/[A-Za-z0-9_-]{20,}/g,
    replacement: "/rsvp/manage/[REDACTED]",
  },
  {
    pattern: /postgres(?:ql)?:\/\/[^\s"']+/gi,
    replacement: "[REDACTED_DB_URL]",
  },
];

export const ADMIN_AUDIT_ACTIONS: readonly AdminAuditAction[] = [
  "admin.bootstrap",
  "auth.login.success",
  "auth.login.failed",
  "auth.logout",
  "admin.profile_update",
  "admin.password_change",
  "rsvp.manual_create",
  "rsvp.edit",
  "rsvp.delete",
  "rsvp.duplicate_resolve",
  "report.export_csv",
  "settings.update",
  "retention.run",
];

function getAuditPepper(): string {
  const configured = process.env.RATE_LIMIT_PEPPER?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_PEPPER;
}

/**
 * Strips control characters, redacts sensitive inline tokens/secrets/DB URLs,
 * and truncates audit text safely.
 */
export function sanitizeAuditText(text: string, maxLen = 400): string {
  if (typeof text !== "string") {
    return "";
  }
  let cleaned = text.replace(CONTROL_CHARS_RE, " ").trim();
  for (const { pattern, replacement } of SENSITIVE_VALUE_PATTERNS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  if (cleaned.length > maxLen) {
    return `${cleaned.slice(0, Math.max(0, maxLen - 3))}...`;
  }
  return cleaned;
}

function redactRecursive(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    return sanitizeAuditText(value, 200);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  if (depth >= 4) {
    return "[TRUNCATED]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => redactRecursive(item, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 25);
    for (const [key, val] of entries) {
      const normalizedKey = key.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
      if (
        SENSITIVE_KEY_PATTERN.test(key) ||
        PII_METADATA_KEY_SET.has(normalizedKey)
      ) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = redactRecursive(val, depth + 1);
      }
    }
    return out;
  }

  return String(value);
}

/**
 * Recursively redacts secrets, tokens, hashes, raw IPs, and sensitive PII from
 * audit metadata objects and caps serialized payload size at 4096 bytes.
 */
export function redactAuditMetadata(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const redacted = redactRecursive(value, 0);
  if (
    typeof redacted !== "object" ||
    redacted === null ||
    Array.isArray(redacted)
  ) {
    return {};
  }

  const serialized = JSON.stringify(redacted);
  if (Buffer.byteLength(serialized, "utf8") > 4096) {
    return { truncated: true };
  }

  return redacted as Record<string, unknown>;
}

/**
 * Produces a keyed 64-char hex HMAC hash of a client IP/key for audit correlation
 * without storing raw IP addresses.
 */
export function hashAuditClientKey(clientKey?: string | null): string | null {
  const trimmed = typeof clientKey === "string" ? clientKey.trim() : "";
  if (!trimmed) {
    return null;
  }
  return crypto
    .createHmac("sha256", getAuditPepper())
    .update(`audit-ip:${trimmed}`, "utf8")
    .digest("hex");
}

export interface LogAdminAuditEventInput {
  actorAdminId?: string | null;
  actorIdentifier?: string | null;
  action: AdminAuditAction | (string & {});
  targetType?: AdminAuditTargetType | string | null;
  targetId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
  clientKey?: string | null;
}

/**
 * Records an administrative security/activity audit event in `admin_audit_logs`
 * with strict secret/token/PII redaction.
 */
export async function logAdminAuditEvent(
  input: LogAdminAuditEventInput,
): Promise<void> {
  const actorAdminId = input.actorAdminId ?? null;
  const actorIdentifierRaw = input.actorIdentifier
    ? sanitizeAuditText(input.actorIdentifier, 160).toLowerCase()
    : null;
  const action = sanitizeAuditText(input.action, 64) || "unknown";
  const targetType = input.targetType
    ? sanitizeAuditText(input.targetType, 32)
    : null;
  const targetId = input.targetId
    ? sanitizeAuditText(input.targetId, 64)
    : null;
  const summary = sanitizeAuditText(input.summary, 400) || "Admin activity";
  const metadata = redactAuditMetadata(input.metadata ?? {});
  const ipHash = hashAuditClientKey(input.clientKey);

  await pool.query(
    `
    INSERT INTO admin_audit_logs (
      actor_admin_id,
      actor_identifier,
      action,
      target_type,
      target_id,
      summary,
      metadata,
      ip_hash
    ) VALUES (
      $1::uuid,
      $2,
      $3,
      $4,
      $5,
      $6,
      $7::jsonb,
      $8
    )
    `,
    [
      actorAdminId,
      actorIdentifierRaw,
      action,
      targetType,
      targetId,
      summary,
      JSON.stringify(metadata),
      ipHash,
    ],
  );
}

export interface ListAdminAuditLogsParams {
  page?: number;
  pageSize?: number;
  action?: string;
  q?: string;
  from?: string;
  to?: string;
}

function escapeIlikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

interface AuditLogRow {
  id: string | number;
  actor_admin_id: string | null;
  actor_identifier: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  ip_hash: string | null;
  created_at: Date | string;
}

/**
 * Lists paginated, filtered audit log entries ordered newest-first.
 */
export async function listAdminAuditLogs(
  params: ListAdminAuditLogsParams = {},
): Promise<AdminAuditLogListResponse> {
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

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (params.action && params.action.trim()) {
    values.push(params.action.trim().slice(0, 64));
    conditions.push(`action = $${values.length}`);
  }

  if (params.q && params.q.trim()) {
    const escaped = escapeIlikePattern(params.q.trim().slice(0, 120));
    values.push(`%${escaped}%`);
    const idx = values.length;
    conditions.push(
      `(summary ILIKE $${idx} ESCAPE '\\' OR COALESCE(actor_identifier, '') ILIKE $${idx} ESCAPE '\\' OR COALESCE(target_type, '') ILIKE $${idx} ESCAPE '\\' OR COALESCE(target_id, '') ILIKE $${idx} ESCAPE '\\' OR action ILIKE $${idx} ESCAPE '\\')`,
    );
  }

  if (params.from && params.from.trim()) {
    const parsedFrom = new Date(params.from.trim());
    if (Number.isFinite(parsedFrom.getTime())) {
      values.push(parsedFrom.toISOString());
      conditions.push(`created_at >= $${values.length}::timestamptz`);
    }
  }

  if (params.to && params.to.trim()) {
    const parsedTo = new Date(params.to.trim());
    if (Number.isFinite(parsedTo.getTime())) {
      values.push(parsedTo.toISOString());
      conditions.push(`created_at <= $${values.length}::timestamptz`);
    }
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const offset = (page - 1) * pageSize;
  const listValues = [...values, pageSize, offset];

  const [countResult, rowsResult, actionsResult] = await Promise.all([
    pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM admin_audit_logs ${whereClause}`,
      values,
    ),
    pool.query<AuditLogRow>(
      `
      SELECT
        id,
        actor_admin_id,
        actor_identifier,
        action,
        target_type,
        target_id,
        summary,
        metadata,
        ip_hash,
        created_at
      FROM admin_audit_logs
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `,
      listValues,
    ),
    pool.query<{ action: string }>(
      `SELECT DISTINCT action FROM admin_audit_logs ORDER BY action ASC`,
    ),
  ]);

  const total = Number.parseInt(countResult.rows[0]?.total ?? "0", 10);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const items: AdminAuditLogEntry[] = rowsResult.rows.map((row) => ({
    id: typeof row.id === "number" ? row.id : Number.parseInt(row.id, 10),
    actorAdminId: row.actor_admin_id,
    actorIdentifier: row.actor_identifier,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    summary: row.summary,
    metadata:
      row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    ipHash: row.ip_hash,
    createdAt: toIsoString(row.created_at),
  }));

  const dbActions = actionsResult.rows.map((r) => r.action);
  const availableActions = Array.from(
    new Set([...ADMIN_AUDIT_ACTIONS, ...dbActions]),
  ).sort();

  return {
    ok: true,
    items,
    total,
    page,
    pageSize,
    totalPages,
    availableActions,
  };
}
