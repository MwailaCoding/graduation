import { pool } from "@/lib/db";
import {
  BACKUP_RETENTION_DAYS,
  RETENTION_ANONYMIZATION_DATE_ISO,
  getAuthoritativeNow,
  isRetentionExpired,
} from "@/lib/event-config";

export interface AnonymizeExpiredResult {
  anonymizedCount: number;
  status: "success" | "failed";
  cutoffIso: string;
}

export interface RetentionSummary {
  retentionDateIso: string;
  backupRetentionDays: number;
  isRetentionExpired: boolean;
  activeRecordCount: number;
  anonymizedRecordCount: number;
  dueForAnonymizationCount: number;
  lastRun: {
    ranAt: string;
    cutoffAt: string;
    recordsAnonymized: number;
    status: "success" | "failed";
    errorSummary: string | null;
  } | null;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

/**
 * Irreversibly anonymizes personal data on expired RSVP records inside a
 * single database transaction, purges expired rate-limit buckets, and records
 * the execution in `rsvp_retention_runs`.
 */
export async function anonymizeExpiredRsvps(options?: {
  now?: Date;
  force?: boolean;
}): Promise<AnonymizeExpiredResult> {
  const effectiveNow = getAuthoritativeNow(options?.now);
  const force = options?.force === true;
  const cutoffIso = effectiveNow.toISOString();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const updateResult = await client.query(
      `
      UPDATE rsvps
      SET
        full_name = NULL,
        phone_e164 = NULL,
        phone_country = NULL,
        dietary_requirements = NULL,
        congratulatory_message = NULL,
        management_token_hash = NULL,
        idempotency_key = NULL,
        organizer_notes = NULL,
        duplicate_review_note = NULL,
        is_anonymized = TRUE,
        anonymized_at = NOW(),
        updated_at = NOW()
      WHERE is_anonymized = FALSE
        AND ($2::boolean = TRUE OR retention_expires_at <= $1::timestamptz)
      `,
      [cutoffIso, force],
    );

    const anonymizedCount = updateResult.rowCount ?? 0;

    await client.query(
      "DELETE FROM rsvp_rate_limits WHERE expires_at < NOW()",
    );

    await client.query(
      `
      INSERT INTO rsvp_retention_runs (
        cutoff_at,
        records_anonymized,
        status,
        error_summary
      ) VALUES ($1::timestamptz, $2, 'success', NULL)
      `,
      [cutoffIso, anonymizedCount],
    );

    await client.query("COMMIT");

    return {
      anonymizedCount,
      status: "success",
      cutoffIso,
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    const safeSummary =
      err instanceof Error ? err.name : "RetentionRunError";

    await pool
      .query(
        `
        INSERT INTO rsvp_retention_runs (
          cutoff_at,
          records_anonymized,
          status,
          error_summary
        ) VALUES ($1::timestamptz, 0, 'failed', $2)
        `,
        [cutoffIso, safeSummary],
      )
      .catch(() => {});

    return {
      anonymizedCount: 0,
      status: "failed",
      cutoffIso,
    };
  } finally {
    client.release();
  }
}

/**
 * Returns non-PII aggregate counts and latest retention job status for
 * administrative monitoring.
 */
export async function getRetentionSummary(options?: {
  now?: Date;
}): Promise<RetentionSummary> {
  const effectiveNow = getAuthoritativeNow(options?.now);
  const cutoffIso = effectiveNow.toISOString();

  const [countsResult, lastRunResult] = await Promise.all([
    pool.query<{
      active_count: string;
      anonymized_count: string;
      due_count: string;
    }>(
      `
      SELECT
        COUNT(*) FILTER (WHERE is_anonymized = FALSE)::text AS active_count,
        COUNT(*) FILTER (WHERE is_anonymized = TRUE)::text AS anonymized_count,
        COUNT(*) FILTER (
          WHERE is_anonymized = FALSE AND retention_expires_at <= $1::timestamptz
        )::text AS due_count
      FROM rsvps
      `,
      [cutoffIso],
    ),
    pool.query<{
      ran_at: Date | string;
      cutoff_at: Date | string;
      records_anonymized: number;
      status: "success" | "failed";
      error_summary: string | null;
    }>(
      `
      SELECT
        ran_at,
        cutoff_at,
        records_anonymized,
        status,
        error_summary
      FROM rsvp_retention_runs
      ORDER BY ran_at DESC, id DESC
      LIMIT 1
      `,
    ),
  ]);

  const counts = countsResult.rows[0];
  const lastRunRow = lastRunResult.rows[0];

  return {
    retentionDateIso: RETENTION_ANONYMIZATION_DATE_ISO,
    backupRetentionDays: BACKUP_RETENTION_DAYS,
    isRetentionExpired: isRetentionExpired(effectiveNow),
    activeRecordCount: Number.parseInt(counts?.active_count ?? "0", 10),
    anonymizedRecordCount: Number.parseInt(counts?.anonymized_count ?? "0", 10),
    dueForAnonymizationCount: Number.parseInt(counts?.due_count ?? "0", 10),
    lastRun: lastRunRow
      ? {
          ranAt: toIsoString(lastRunRow.ran_at),
          cutoffAt: toIsoString(lastRunRow.cutoff_at),
          recordsAnonymized: lastRunRow.records_anonymized,
          status: lastRunRow.status,
          errorSummary: lastRunRow.error_summary,
        }
      : null,
  };
}

let lastOpportunisticSweepMs = 0;
const SWEEP_COOLDOWN_MS = 60 * 60 * 1000;

/**
 * Defense-in-depth retention safeguard: when the authoritative clock has passed
 * the 90-day retention deadline, opportunistically triggers anonymization once
 * per hour per server process so expired records are never retained silently
 * if an external cron scheduler missed a run.
 */
export async function ensureRetentionEnforcedIfDue(options?: {
  now?: Date;
}): Promise<void> {
  const effectiveNow = getAuthoritativeNow(options?.now);
  if (!isRetentionExpired(effectiveNow)) {
    return;
  }

  const wallNow = Date.now();
  if (wallNow - lastOpportunisticSweepMs < SWEEP_COOLDOWN_MS) {
    return;
  }
  lastOpportunisticSweepMs = wallNow;

  const result = await anonymizeExpiredRsvps({ now: effectiveNow });
  if (result.status === "failed") {
    console.error(
      `[rsvp-retention] Scheduled/opportunistic anonymization failed at cutoff=${result.cutoffIso}`,
    );
  }
}
