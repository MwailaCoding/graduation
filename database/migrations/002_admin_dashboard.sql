-- Phase 8: Admin Dashboard Schema Additions (PostgreSQL 16+)
-- Additive, non-destructive migration preserving all Phase 7 rsvps records.

-- 1. Administrator accounts (single Administrator role)
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(160) NOT NULL UNIQUE
    CHECK (email = lower(btrim(email)) AND char_length(email) >= 3),
  display_name VARCHAR(120) NOT NULL
    CHECK (char_length(btrim(display_name)) >= 2),
  password_hash TEXT NOT NULL,
  role VARCHAR(32) NOT NULL DEFAULT 'admin'
    CHECK (role = 'admin'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ NULL,
  password_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Server-managed admin sessions (SHA-256/HMAC token hash only; zero raw tokens)
CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  session_token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent_summary VARCHAR(255) NULL,
  ip_hash CHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_user_id
  ON admin_sessions (admin_user_id);

CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at
  ON admin_sessions (expires_at);

-- 3. Admin activity audit log (no raw passwords, secrets, tokens, or raw IPs)
CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_admin_id UUID NULL REFERENCES admin_users(id) ON DELETE SET NULL,
  actor_identifier VARCHAR(160) NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(32) NULL,
  target_id VARCHAR(64) NULL,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_hash CHAR(64) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_action_created
  ON admin_audit_logs (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor_created
  ON admin_audit_logs (actor_admin_id, created_at DESC);

-- 4. Event settings singleton (id = 1) governing RSVP closure & self-editing
CREATE TABLE IF NOT EXISTS event_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  rsvp_accepting_responses BOOLEAN NOT NULL DEFAULT TRUE,
  allow_guest_self_editing BOOLEAN NOT NULL DEFAULT TRUE,
  closure_deadline_at TIMESTAMPTZ NOT NULL DEFAULT '2026-12-12T00:00:00+03:00',
  manual_override_reason VARCHAR(250) NULL,
  updated_by_admin_id UUID NULL REFERENCES admin_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO event_settings (
  id,
  rsvp_accepting_responses,
  allow_guest_self_editing,
  closure_deadline_at
) VALUES (
  1,
  TRUE,
  TRUE,
  '2026-12-12T00:00:00+03:00'::timestamptz
)
ON CONFLICT (id) DO NOTHING;

-- 5. Additive admin & duplicate-review metadata columns on rsvps
ALTER TABLE rsvps
  ADD COLUMN IF NOT EXISTS created_by_admin_id UUID NULL REFERENCES admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_admin_id UUID NULL REFERENCES admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_group_id UUID NULL,
  ADD COLUMN IF NOT EXISTS merged_into_rsvp_id UUID NULL REFERENCES rsvps(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_reviewed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS duplicate_reviewed_by_admin_id UUID NULL REFERENCES admin_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS duplicate_review_note VARCHAR(500) NULL;

ALTER TABLE rsvps
  DROP CONSTRAINT IF EXISTS chk_rsvps_no_self_merge;

ALTER TABLE rsvps
  ADD CONSTRAINT chk_rsvps_no_self_merge
  CHECK (merged_into_rsvp_id IS NULL OR merged_into_rsvp_id <> id);

-- 6. Extend anonymization consistency check to require duplicate_review_note IS NULL when anonymized
ALTER TABLE rsvps
  DROP CONSTRAINT chk_rsvps_anonymization_consistency;

ALTER TABLE rsvps
  ADD CONSTRAINT chk_rsvps_anonymization_consistency CHECK (
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
      AND duplicate_review_note IS NULL
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
  );

-- 7. Narrow active phone uniqueness to 'none' so 'flagged', 'resolved_distinct', and 'merged_archived' can coexist
DROP INDEX IF EXISTS idx_rsvps_active_phone_unique;

CREATE UNIQUE INDEX idx_rsvps_active_phone_unique
  ON rsvps (phone_e164)
  WHERE is_anonymized = FALSE
    AND phone_e164 IS NOT NULL
    AND duplicate_review_status = 'none';

-- 8. Admin query, filter, sort, duplicate, and message indexes on rsvps
CREATE INDEX IF NOT EXISTS idx_rsvps_anonymized_updated
  ON rsvps (is_anonymized, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_rsvps_anonymized_dup_status
  ON rsvps (is_anonymized, duplicate_review_status);

CREATE INDEX IF NOT EXISTS idx_rsvps_anonymized_source
  ON rsvps (is_anonymized, submission_source);

CREATE INDEX IF NOT EXISTS idx_rsvps_duplicate_group
  ON rsvps (duplicate_group_id)
  WHERE duplicate_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rsvps_active_name_lower
  ON rsvps (lower(full_name))
  WHERE is_anonymized = FALSE AND full_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rsvps_active_messages
  ON rsvps (created_at DESC)
  WHERE is_anonymized = FALSE
    AND duplicate_review_status <> 'merged_archived'
    AND congratulatory_message IS NOT NULL;
