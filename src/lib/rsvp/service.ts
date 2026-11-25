import type { CountryCode } from "libphonenumber-js";
import { getEffectiveRsvpPolicy } from "@/lib/admin/settings";
import { pool } from "@/lib/db";
import {
  CLOSED_RSVP_COPY,
  RETENTION_ANONYMIZATION_DATE_ISO,
  getAuthoritativeNow,
} from "@/lib/event-config";
import {
  generateManagementToken,
  hashManagementToken,
  isValidTokenFormat,
} from "@/lib/rsvp/tokens";
import {
  DEFAULT_PHONE_COUNTRY,
  validateCreateRsvpInput,
  validateUpdateRsvpInput,
} from "@/lib/rsvp/validation";
import type {
  AttendanceStatus,
  CreateRsvpSuccessResponse,
  ManageRsvpSuccessResponse,
  RsvpErrorResponse,
  RsvpGuestSummary,
  RsvpStatusResponse,
  UpdateRsvpSuccessResponse,
} from "@/types/rsvp";

interface RsvpRow {
  id: string;
  full_name: string;
  phone_e164: string;
  phone_country: string | null;
  attendance_status: AttendanceStatus;
  attendee_count: number;
  dietary_requirements: string | null;
  congratulatory_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PgErrorLike {
  code?: string;
  constraint?: string;
}

const DUPLICATE_PHONE_MESSAGE =
  "An RSVP with this phone number already exists. Please use your personal management link to update your response, or contact the event hosts for assistance.";

const DUPLICATE_REQUEST_MESSAGE =
  "This RSVP submission has already been received.";

const INVALID_TOKEN_MESSAGE =
  "This RSVP management link is invalid or no longer available.";

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function asPgError(err: unknown): PgErrorLike | null {
  if (typeof err !== "object" || err === null) {
    return null;
  }
  const record = err as Record<string, unknown>;
  return {
    code: typeof record.code === "string" ? record.code : undefined,
    constraint:
      typeof record.constraint === "string" ? record.constraint : undefined,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapRowToGuestSummary(row: RsvpRow): RsvpGuestSummary {
  return {
    fullName: row.full_name,
    phoneE164: row.phone_e164,
    phoneCountry: (row.phone_country ?? DEFAULT_PHONE_COUNTRY) as CountryCode,
    attendance: row.attendance_status,
    attendeeCount: row.attendee_count,
    dietaryRequirements: row.dietary_requirements,
    congratulatoryMessage: row.congratulatory_message,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

/**
 * Returns the authoritative RSVP closure and retention status.
 */
export async function getRsvpPublicStatus(
  now?: Date,
): Promise<RsvpStatusResponse> {
  const policy = await getEffectiveRsvpPolicy({ now });
  return {
    ok: true,
    isClosed: !policy.isAcceptingNewRsvps,
    closureDeadlineIso: policy.closureDeadlineIso,
    retentionDateIso: RETENTION_ANONYMIZATION_DATE_ISO,
  };
}

/**
 * Validates and persists a new RSVP submission, enforcing closure deadlines,
 * idempotency keys, and active phone uniqueness without disclosing existing guests.
 */
export async function createRsvp(
  input: unknown,
  options?: { now?: Date },
): Promise<{
  status: number;
  body: CreateRsvpSuccessResponse | RsvpErrorResponse;
}> {
  const effectiveNow = getAuthoritativeNow(options?.now);
  const policy = await getEffectiveRsvpPolicy({ now: effectiveNow });

  if (!policy.isAcceptingNewRsvps) {
    return {
      status: 403,
      body: {
        ok: false,
        code: "RSVP_CLOSED",
        message: `${CLOSED_RSVP_COPY.heading} ${CLOSED_RSVP_COPY.body}`,
      },
    };
  }

  if (!isPlainObject(input)) {
    return {
      status: 400,
      body: {
        ok: false,
        code: "VALIDATION_ERROR",
        message: "Please provide a valid RSVP submission.",
      },
    };
  }

  const validation = validateCreateRsvpInput(input);
  if (!validation.valid) {
    return {
      status: 400,
      body: {
        ok: false,
        code: "VALIDATION_ERROR",
        message: validation.message,
        ...(Object.keys(validation.fieldErrors).length > 0
          ? { fieldErrors: validation.fieldErrors }
          : {}),
      },
    };
  }

  const { data } = validation;
  const managementToken = generateManagementToken();
  const tokenHash = hashManagementToken(managementToken);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (data.idempotencyKey) {
      const existingIdempotency = await client.query(
        "SELECT 1 FROM rsvps WHERE idempotency_key = $1 LIMIT 1",
        [data.idempotencyKey],
      );
      if ((existingIdempotency.rowCount ?? 0) > 0) {
        await client.query("ROLLBACK");
        return {
          status: 409,
          body: {
            ok: false,
            code: "DUPLICATE_REQUEST",
            message: DUPLICATE_REQUEST_MESSAGE,
          },
        };
      }
    }

    const existingPhone = await client.query(
      `
      SELECT 1
      FROM rsvps
      WHERE phone_e164 = $1
        AND is_anonymized = FALSE
        AND duplicate_review_status NOT IN ('resolved_distinct', 'merged_archived')
      LIMIT 1
      `,
      [data.phoneE164],
    );

    if ((existingPhone.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return {
        status: 409,
        body: {
          ok: false,
          code: "POSSIBLE_DUPLICATE_PHONE",
          message: DUPLICATE_PHONE_MESSAGE,
        },
      };
    }

    const insertResult = await client.query<RsvpRow>(
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
        idempotency_key,
        privacy_acknowledged,
        privacy_acknowledged_at,
        submission_source,
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
        $9,
        TRUE,
        $10::timestamptz,
        'web',
        $11::timestamptz
      )
      RETURNING
        id,
        full_name,
        phone_e164,
        phone_country,
        attendance_status,
        attendee_count,
        dietary_requirements,
        congratulatory_message,
        created_at,
        updated_at
      `,
      [
        data.fullName,
        data.phoneE164,
        data.phoneCountry,
        data.attendance,
        data.attendeeCount,
        data.dietaryRequirements,
        data.congratulatoryMessage,
        tokenHash,
        data.idempotencyKey,
        effectiveNow.toISOString(),
        RETENTION_ANONYMIZATION_DATE_ISO,
      ],
    );

    await client.query("COMMIT");

    const row = insertResult.rows[0];
    return {
      status: 201,
      body: {
        ok: true,
        rsvp: mapRowToGuestSummary(row),
        managementPath: `/rsvp/manage/${managementToken}`,
        closureDeadlineIso: policy.closureDeadlineIso,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    const pgErr = asPgError(err);

    if (pgErr?.code === "23505") {
      if (pgErr.constraint === "idx_rsvps_active_phone_unique") {
        return {
          status: 409,
          body: {
            ok: false,
            code: "POSSIBLE_DUPLICATE_PHONE",
            message: DUPLICATE_PHONE_MESSAGE,
          },
        };
      }

      if (pgErr.constraint === "idx_rsvps_idempotency_key_unique") {
        return {
          status: 409,
          body: {
            ok: false,
            code: "DUPLICATE_REQUEST",
            message: DUPLICATE_REQUEST_MESSAGE,
          },
        };
      }
    }

    return {
      status: 500,
      body: {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "We could not save your RSVP right now. Please try again shortly.",
      },
    };
  } finally {
    client.release();
  }
}

/**
 * Retrieves an active RSVP record by its personal management token.
 * Remains readable after closure with `isClosed: true` so guests can view their status.
 */
export async function getRsvpByToken(
  token: string,
  options?: { now?: Date },
): Promise<
  | { ok: true; data: ManageRsvpSuccessResponse }
  | { ok: false; status: number; error: RsvpErrorResponse }
> {
  if (!isValidTokenFormat(token)) {
    return {
      ok: false,
      status: 404,
      error: {
        ok: false,
        code: "INVALID_TOKEN",
        message: INVALID_TOKEN_MESSAGE,
      },
    };
  }

  const effectiveNow = getAuthoritativeNow(options?.now);
  const policy = await getEffectiveRsvpPolicy({ now: effectiveNow });
  const tokenHash = hashManagementToken(token);

  try {
    const result = await pool.query<RsvpRow>(
      `
      SELECT
        id,
        full_name,
        phone_e164,
        phone_country,
        attendance_status,
        attendee_count,
        dietary_requirements,
        congratulatory_message,
        created_at,
        updated_at
      FROM rsvps
      WHERE management_token_hash = $1
        AND is_anonymized = FALSE
        AND duplicate_review_status <> 'merged_archived'
      LIMIT 1
      `,
      [tokenHash],
    );

    const row = result.rows[0];
    if (!row) {
      return {
        ok: false,
        status: 404,
        error: {
          ok: false,
          code: "INVALID_TOKEN",
          message: INVALID_TOKEN_MESSAGE,
        },
      };
    }

    return {
      ok: true,
      data: {
        ok: true,
        rsvp: mapRowToGuestSummary(row),
        isClosed: !policy.isSelfEditingAllowed,
        closureDeadlineIso: policy.closureDeadlineIso,
        retentionDateIso: RETENTION_ANONYMIZATION_DATE_ISO,
      },
    };
  } catch {
    return {
      ok: false,
      status: 500,
      error: {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "Unable to load your RSVP right now. Please try again shortly.",
      },
    };
  }
}

/**
 * Updates an existing RSVP record identified by its management token, enforcing
 * closure deadlines, phone uniqueness across other active records, and clearing
 * dietary requirements when switching to declining.
 */
export async function updateRsvpByToken(
  token: string,
  input: unknown,
  options?: { now?: Date },
): Promise<{
  status: number;
  body: UpdateRsvpSuccessResponse | RsvpErrorResponse;
}> {
  if (!isValidTokenFormat(token)) {
    return {
      status: 404,
      body: {
        ok: false,
        code: "INVALID_TOKEN",
        message: INVALID_TOKEN_MESSAGE,
      },
    };
  }

  const effectiveNow = getAuthoritativeNow(options?.now);
  const tokenHash = hashManagementToken(token);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existingResult = await client.query<{ id: string }>(
      `
      SELECT id
      FROM rsvps
      WHERE management_token_hash = $1
        AND is_anonymized = FALSE
        AND duplicate_review_status <> 'merged_archived'
      LIMIT 1
      FOR UPDATE
      `,
      [tokenHash],
    );

    const existing = existingResult.rows[0];
    if (!existing) {
      await client.query("ROLLBACK");
      return {
        status: 404,
        body: {
          ok: false,
          code: "INVALID_TOKEN",
          message: INVALID_TOKEN_MESSAGE,
        },
      };
    }

    const policy = await getEffectiveRsvpPolicy({ now: effectiveNow });
    if (!policy.isSelfEditingAllowed) {
      await client.query("ROLLBACK");
      const closedMessage =
        !policy.isDeadlinePassed && !policy.allowGuestSelfEditing
          ? "Self-service RSVP editing is currently disabled by the event organizers. Please contact the event hosts for assistance."
          : `${CLOSED_RSVP_COPY.heading} ${CLOSED_RSVP_COPY.body}`;
      return {
        status: 403,
        body: {
          ok: false,
          code: "RSVP_CLOSED",
          message: closedMessage,
        },
      };
    }

    if (!isPlainObject(input)) {
      await client.query("ROLLBACK");
      return {
        status: 400,
        body: {
          ok: false,
          code: "VALIDATION_ERROR",
          message: "Please provide valid RSVP update details.",
        },
      };
    }

    const validation = validateUpdateRsvpInput(input);
    if (!validation.valid) {
      await client.query("ROLLBACK");
      return {
        status: 400,
        body: {
          ok: false,
          code: "VALIDATION_ERROR",
          message: validation.message,
          ...(Object.keys(validation.fieldErrors).length > 0
            ? { fieldErrors: validation.fieldErrors }
            : {}),
        },
      };
    }

    const { data } = validation;

    const conflictingPhone = await client.query(
      `
      SELECT 1
      FROM rsvps
      WHERE id <> $1
        AND phone_e164 = $2
        AND is_anonymized = FALSE
        AND duplicate_review_status NOT IN ('resolved_distinct', 'merged_archived')
      LIMIT 1
      `,
      [existing.id, data.phoneE164],
    );

    if ((conflictingPhone.rowCount ?? 0) > 0) {
      await client.query("ROLLBACK");
      return {
        status: 409,
        body: {
          ok: false,
          code: "POSSIBLE_DUPLICATE_PHONE",
          message: DUPLICATE_PHONE_MESSAGE,
        },
      };
    }

    const clearedDietary =
      data.attendance === "declining" ? null : data.dietaryRequirements;

    const updateResult = await client.query<RsvpRow>(
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
        updated_at = NOW()
      WHERE id = $8
        AND is_anonymized = FALSE
      RETURNING
        id,
        full_name,
        phone_e164,
        phone_country,
        attendance_status,
        attendee_count,
        dietary_requirements,
        congratulatory_message,
        created_at,
        updated_at
      `,
      [
        data.fullName,
        data.phoneE164,
        data.phoneCountry,
        data.attendance,
        data.attendeeCount,
        clearedDietary,
        data.congratulatoryMessage,
        existing.id,
      ],
    );

    await client.query("COMMIT");

    const updatedRow = updateResult.rows[0];
    return {
      status: 200,
      body: {
        ok: true,
        rsvp: mapRowToGuestSummary(updatedRow),
        isClosed: false,
        closureDeadlineIso: policy.closureDeadlineIso,
      },
    };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    const pgErr = asPgError(err);

    if (
      pgErr?.code === "23505" &&
      pgErr.constraint === "idx_rsvps_active_phone_unique"
    ) {
      return {
        status: 409,
        body: {
          ok: false,
          code: "POSSIBLE_DUPLICATE_PHONE",
          message: DUPLICATE_PHONE_MESSAGE,
        },
      };
    }

    return {
      status: 500,
      body: {
        ok: false,
        code: "INTERNAL_ERROR",
        message: "We could not update your RSVP right now. Please try again shortly.",
      },
    };
  } finally {
    client.release();
  }
}
