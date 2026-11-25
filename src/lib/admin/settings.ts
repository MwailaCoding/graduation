import fs from "node:fs";
import path from "node:path";
import { checkDatabaseConnection, pool } from "@/lib/db";
import {
  BACKUP_RETENTION_DAYS,
  EVENT_DETAILS,
  EVENT_TIMEZONE,
  EVENT_UTC_OFFSET,
  RETENTION_ANONYMIZATION_DATE_ISO,
  RETENTION_PERIOD_DAYS,
  RSVP_CLOSURE_DEADLINE,
  RSVP_CLOSURE_DEADLINE_ISO,
  getAuthoritativeNow,
} from "@/lib/event-config";
import { logAdminAuditEvent } from "@/lib/admin/audit";
import {
  anonymizeExpiredRsvps,
  getRetentionSummary,
  type AnonymizeExpiredResult,
  type RetentionSummary,
} from "@/lib/rsvp/retention";
import { sanitizeTextInput } from "@/lib/rsvp/validation";
import type {
  AdminFieldErrors,
  AdminSettingsUpdateInput,
  AdminSystemHealth,
  EffectiveRsvpPolicy,
  EventSettingsState,
  LockedEventDetails,
  PolicyClosedReason,
} from "@/types/admin";

export const ADMIN_LOCKED_EVENT_DETAILS: LockedEventDetails = {
  graduates: [
    {
      name: "Majala Mwaila",
      degree: "Bachelor's Degree in Education (Mathematics)",
    },
    {
      name: "Florence Achala Mwaila",
      degree: "Bachelor's Degree in French and Sociology",
    },
  ],
  graduatesSummary: "Majala & Florence",
  dateLabel: EVENT_DETAILS.dateLabel,
  timeLabel: EVENT_DETAILS.timeLabel,
  venueName: EVENT_DETAILS.venueName,
  timezone: EVENT_TIMEZONE,
  utcOffset: EVENT_UTC_OFFSET,
  timezoneLabel: "Africa/Nairobi (EAT, UTC+3)",
  closureDeadlineLabel: EVENT_DETAILS.closureDeadlineLabel,
  retentionDateLabel: EVENT_DETAILS.retentionDateLabel,
  retentionPeriodDays: RETENTION_PERIOD_DAYS,
  backupRetentionDays: BACKUP_RETENTION_DAYS,
};

interface EventSettingsRow {
  rsvp_accepting_responses: boolean;
  allow_guest_self_editing: boolean;
  closure_deadline_at: Date | string;
  manual_override_reason: string | null;
  updated_by_admin_id: string | null;
  updated_at: Date | string;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function normalizeClosureDeadlineIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (
    Number.isFinite(date.getTime()) &&
    date.getTime() === RSVP_CLOSURE_DEADLINE.getTime()
  ) {
    return RSVP_CLOSURE_DEADLINE_ISO;
  }
  return date.toISOString();
}

function getDefaultSettingsState(): EventSettingsState {
  return {
    rsvpAcceptingResponses: true,
    allowGuestSelfEditing: true,
    closureDeadlineIso: RSVP_CLOSURE_DEADLINE_ISO,
    manualOverrideReason: null,
    updatedByAdminId: null,
    updatedAt: RSVP_CLOSURE_DEADLINE_ISO,
  };
}

function mapRowToSettingsState(row: EventSettingsRow): EventSettingsState {
  return {
    rsvpAcceptingResponses: row.rsvp_accepting_responses,
    allowGuestSelfEditing: row.allow_guest_self_editing,
    closureDeadlineIso: normalizeClosureDeadlineIso(row.closure_deadline_at),
    manualOverrideReason: row.manual_override_reason,
    updatedByAdminId: row.updated_by_admin_id,
    updatedAt: toIsoString(row.updated_at),
  };
}

async function readEventSettingsRowSafe(): Promise<EventSettingsState | null> {
  try {
    const result = await pool.query<EventSettingsRow>(
      `
      SELECT
        rsvp_accepting_responses,
        allow_guest_self_editing,
        closure_deadline_at,
        manual_override_reason,
        updated_by_admin_id,
        updated_at
      FROM event_settings
      WHERE id = 1
      LIMIT 1
      `,
    );
    const row = result.rows[0];
    return row ? mapRowToSettingsState(row) : null;
  } catch {
    return null;
  }
}

export async function getEventSettingsState(): Promise<EventSettingsState> {
  const row = await readEventSettingsRowSafe();
  return row ?? getDefaultSettingsState();
}

function computeEffectivePolicy(
  settings: EventSettingsState | null,
  effectiveNow: Date,
): EffectiveRsvpPolicy {
  const active = settings ?? getDefaultSettingsState();
  const parsedDeadline = new Date(active.closureDeadlineIso);
  const deadlineMs = Number.isFinite(parsedDeadline.getTime())
    ? parsedDeadline.getTime()
    : RSVP_CLOSURE_DEADLINE.getTime();
  const closureDeadlineIso = Number.isFinite(parsedDeadline.getTime())
    ? active.closureDeadlineIso
    : RSVP_CLOSURE_DEADLINE_ISO;

  const isDeadlinePassed = effectiveNow.getTime() >= deadlineMs;
  const isManualClosed = !active.rsvpAcceptingResponses;
  const isAcceptingNewRsvps = active.rsvpAcceptingResponses && !isDeadlinePassed;
  const isSelfEditingAllowed =
    active.allowGuestSelfEditing && !isDeadlinePassed;
  const isClosed = !isAcceptingNewRsvps;

  let closedReason: PolicyClosedReason = null;
  if (isDeadlinePassed) {
    closedReason = "deadline_passed";
  } else if (!active.rsvpAcceptingResponses) {
    closedReason = "manual_pause";
  } else if (!active.allowGuestSelfEditing) {
    closedReason = "self_editing_disabled";
  }

  return {
    isClosed,
    isAcceptingResponses: active.rsvpAcceptingResponses,
    allowGuestSelfEditing: active.allowGuestSelfEditing,
    isManualClosed,
    isDeadlinePassed,
    isAcceptingNewRsvps,
    isSelfEditingAllowed,
    closedReason,
    closureDeadlineIso,
    manualOverrideReason: active.manualOverrideReason,
    updatedAt: settings ? settings.updatedAt : null,
  };
}

/**
 * Resolves the authoritative RSVP policy combining DB-backed `event_settings`
 * with `getAuthoritativeNow()` (preserving `RSVP_SIMULATED_NOW_ISO` and unit
 * test `now` overrides), with safe fallback if `event_settings` is unavailable.
 */
export async function getEffectiveRsvpPolicy(options?: {
  now?: Date;
}): Promise<EffectiveRsvpPolicy> {
  const effectiveNow = getAuthoritativeNow(options?.now);
  const settings = await readEventSettingsRowSafe();
  return computeEffectivePolicy(settings, effectiveNow);
}

export interface AdminActorContext {
  adminId: string;
  email: string;
  clientKey?: string | null;
}

export async function updateEventSettingsPolicy(
  input: AdminSettingsUpdateInput,
  actor: AdminActorContext,
): Promise<
  | {
      ok: true;
      settings: EventSettingsState;
      effectivePolicy: EffectiveRsvpPolicy;
    }
  | {
      ok: false;
      message: string;
      fieldErrors: AdminFieldErrors;
    }
> {
  const fieldErrors: AdminFieldErrors = {};

  const hasAccepting = input.rsvpAcceptingResponses !== undefined;
  const hasSelfEditing = input.allowGuestSelfEditing !== undefined;
  const hasDeadline = input.closureDeadlineIso !== undefined;
  const hasReason = input.manualOverrideReason !== undefined;

  if (!hasAccepting && !hasSelfEditing && !hasDeadline && !hasReason) {
    return {
      ok: false,
      message: "Provide at least one policy setting to update.",
      fieldErrors,
    };
  }

  if (hasAccepting && typeof input.rsvpAcceptingResponses !== "boolean") {
    fieldErrors.rsvpAcceptingResponses =
      "RSVP acceptance setting must be true or false.";
  }

  if (hasSelfEditing && typeof input.allowGuestSelfEditing !== "boolean") {
    fieldErrors.allowGuestSelfEditing =
      "Guest self-editing setting must be true or false.";
  }

  let parsedDeadlineIso: string | undefined;
  if (hasDeadline) {
    if (typeof input.closureDeadlineIso !== "string" || !input.closureDeadlineIso.trim()) {
      fieldErrors.closureDeadlineIso = "Provide a valid ISO closure deadline.";
    } else {
      const parsed = new Date(input.closureDeadlineIso.trim());
      if (!Number.isFinite(parsed.getTime())) {
        fieldErrors.closureDeadlineIso = "Closure deadline is not a valid timestamp.";
      } else {
        parsedDeadlineIso = parsed.toISOString();
      }
    }
  }

  let normalizedReason: string | null | undefined;
  if (hasReason) {
    if (input.manualOverrideReason === null) {
      normalizedReason = null;
    } else if (typeof input.manualOverrideReason !== "string") {
      fieldErrors.manualOverrideReason =
        "Override reason must be text or null.";
    } else {
      const cleaned = sanitizeTextInput(input.manualOverrideReason);
      if (cleaned.length > 250) {
        fieldErrors.manualOverrideReason =
          "Override reason must be 250 characters or fewer.";
      } else {
        normalizedReason = cleaned.length > 0 ? cleaned : null;
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      message: "Please correct the invalid settings fields.",
      fieldErrors,
    };
  }

  const current = await getEventSettingsState();
  const nextAccepting =
    hasAccepting && typeof input.rsvpAcceptingResponses === "boolean"
      ? input.rsvpAcceptingResponses
      : current.rsvpAcceptingResponses;
  const nextSelfEditing =
    hasSelfEditing && typeof input.allowGuestSelfEditing === "boolean"
      ? input.allowGuestSelfEditing
      : current.allowGuestSelfEditing;
  const nextDeadlineIso = parsedDeadlineIso ?? current.closureDeadlineIso;
  const nextReason =
    normalizedReason !== undefined
      ? normalizedReason
      : current.manualOverrideReason;

  const upsertResult = await pool.query<EventSettingsRow>(
    `
    INSERT INTO event_settings (
      id,
      rsvp_accepting_responses,
      allow_guest_self_editing,
      closure_deadline_at,
      manual_override_reason,
      updated_by_admin_id,
      updated_at
    ) VALUES (
      1,
      $1,
      $2,
      $3::timestamptz,
      $4,
      $5::uuid,
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      rsvp_accepting_responses = EXCLUDED.rsvp_accepting_responses,
      allow_guest_self_editing = EXCLUDED.allow_guest_self_editing,
      closure_deadline_at = EXCLUDED.closure_deadline_at,
      manual_override_reason = EXCLUDED.manual_override_reason,
      updated_by_admin_id = EXCLUDED.updated_by_admin_id,
      updated_at = NOW()
    RETURNING
      rsvp_accepting_responses,
      allow_guest_self_editing,
      closure_deadline_at,
      manual_override_reason,
      updated_by_admin_id,
      updated_at
    `,
    [
      nextAccepting,
      nextSelfEditing,
      nextDeadlineIso,
      nextReason,
      actor.adminId,
    ],
  );

  const updatedState = mapRowToSettingsState(upsertResult.rows[0]);
  const effectivePolicy = computeEffectivePolicy(
    updatedState,
    getAuthoritativeNow(),
  );

  await logAdminAuditEvent({
    actorAdminId: actor.adminId,
    actorIdentifier: actor.email,
    action: "settings.update",
    targetType: "event_settings",
    targetId: "1",
    summary: "Updated RSVP closure and self-editing policy settings",
    metadata: {
      rsvpAcceptingResponses: updatedState.rsvpAcceptingResponses,
      allowGuestSelfEditing: updatedState.allowGuestSelfEditing,
      closureDeadlineIso: updatedState.closureDeadlineIso,
      hasManualOverrideReason: updatedState.manualOverrideReason !== null,
    },
    clientKey: actor.clientKey,
  });

  return {
    ok: true,
    settings: updatedState,
    effectivePolicy,
  };
}

export async function runRetentionAnonymization(
  actor: AdminActorContext,
): Promise<{
  result: AnonymizeExpiredResult;
  retentionSummary: RetentionSummary;
}> {
  const result = await anonymizeExpiredRsvps({ force: false });
  const retentionSummary = await getRetentionSummary();

  await logAdminAuditEvent({
    actorAdminId: actor.adminId,
    actorIdentifier: actor.email,
    action: "retention.run",
    targetType: "retention",
    targetId: null,
    summary: `Executed retention anonymization check (${result.status}, ${result.anonymizedCount} anonymized)`,
    metadata: {
      status: result.status,
      anonymizedCount: result.anonymizedCount,
      cutoffIso: result.cutoffIso,
      retentionDateIso: RETENTION_ANONYMIZATION_DATE_ISO,
    },
    clientKey: actor.clientKey,
  });

  return {
    result,
    retentionSummary,
  };
}

function readPackageVersionSafe(): string {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const raw = fs.readFileSync(pkgPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version.trim()
      ? parsed.version.trim()
      : "0.1.0";
  } catch {
    return "0.1.0";
  }
}

export async function getSafeSystemHealth(): Promise<AdminSystemHealth> {
  const dbConnected = await checkDatabaseConnection().catch(() => false);
  const rawEnv = process.env.NODE_ENV;
  const nodeEnv =
    rawEnv === "development" || rawEnv === "production" || rawEnv === "test"
      ? rawEnv
      : "unknown";

  return {
    dbConnected,
    appVersion: readPackageVersionSafe(),
    nodeEnv,
    serverTimeIso: new Date().toISOString(),
    eventTimezone: EVENT_TIMEZONE,
  };
}
