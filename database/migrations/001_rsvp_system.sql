-- Phase 7: RSVP System Database Schema (PostgreSQL 16+)
-- Single source of truth for RSVP submissions, rate limiting, and retention runs.

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name VARCHAR(120) NULL,
  phone_e164 VARCHAR(20) NULL,
  phone_country VARCHAR(2) NULL,
  attendance_status VARCHAR(16) NOT NULL
    CHECK (attendance_status IN ('attending', 'declining')),
  attendee_count SMALLINT NOT NULL
    CHECK (
      (attendance_status = 'attending' AND attendee_count = 1)
      OR (attendance_status = 'declining' AND attendee_count = 0)
    ),
  dietary_requirements VARCHAR(250) NULL
    CHECK (
      dietary_requirements IS NULL
      OR (attendance_status = 'attending' AND char_length(dietary_requirements) <= 250)
    ),
  congratulatory_message VARCHAR(500) NULL
    CHECK (
      congratulatory_message IS NULL
      OR char_length(congratulatory_message) <= 500
    ),
  management_token_hash CHAR(64) NULL,
  idempotency_key UUID NULL,
  privacy_acknowledged BOOLEAN NOT NULL DEFAULT FALSE
    CHECK (privacy_acknowledged = TRUE),
  privacy_acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submission_source VARCHAR(32) NOT NULL DEFAULT 'web'
    CHECK (submission_source IN ('web', 'admin_manual')),
  duplicate_review_status VARCHAR(32) NOT NULL DEFAULT 'none'
    CHECK (duplicate_review_status IN ('none', 'flagged', 'resolved_distinct', 'merged_archived')),
  organizer_notes TEXT NULL,
  retention_expires_at TIMESTAMPTZ NOT NULL,
  is_anonymized BOOLEAN NOT NULL DEFAULT FALSE,
  anonymized_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_rsvps_anonymization_consistency CHECK (
    (
      is_anonymized = TRUE
      AND full_name IS NULL
      AND phone_e164 IS NULL
      AND phone_country IS NULL
      AND dietary_requirements IS NULL
      AND congratulatory_message IS NULL
      AND management_token_hash IS NULL
      AND idempotency_key IS NULL
      AND organizer_notes IS NULL
      AND anonymized_at IS NOT NULL
    )
    OR (
      is_anonymized = FALSE
      AND full_name IS NOT NULL
      AND char_length(btrim(full_name)) >= 2
      AND phone_e164 IS NOT NULL
      AND phone_e164 ~ '^\+[1-9][0-9]{6,14}$'
      AND management_token_hash IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvps_active_phone_unique
  ON rsvps (phone_e164)
  WHERE is_anonymized = FALSE
    AND phone_e164 IS NOT NULL
    AND duplicate_review_status <> 'resolved_distinct'
    AND duplicate_review_status <> 'merged_archived';

CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvps_token_hash_unique
  ON rsvps (management_token_hash)
  WHERE is_anonymized = FALSE
    AND management_token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rsvps_idempotency_key_unique
  ON rsvps (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rsvps_attendance_created
  ON rsvps (attendance_status, created_at DESC)
  WHERE is_anonymized = FALSE;

CREATE INDEX IF NOT EXISTS idx_rsvps_retention_due
  ON rsvps (retention_expires_at)
  WHERE is_anonymized = FALSE;

CREATE TABLE IF NOT EXISTS rsvp_rate_limits (
  bucket_key CHAR(64) PRIMARY KEY,
  scope VARCHAR(32) NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL,
  blocked_until TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rsvp_rate_limits_expires_at
  ON rsvp_rate_limits (expires_at);

CREATE TABLE IF NOT EXISTS rsvp_retention_runs (
  id BIGSERIAL PRIMARY KEY,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cutoff_at TIMESTAMPTZ NOT NULL,
  records_anonymized INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(16) NOT NULL CHECK (status IN ('success', 'failed')),
  error_summary TEXT NULL
);
