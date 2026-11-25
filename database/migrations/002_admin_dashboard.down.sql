-- Rollback for 002_admin_dashboard.sql (restores Phase 7 001_rsvp_system state)

DROP INDEX IF EXISTS idx_rsvps_active_messages;
DROP INDEX IF EXISTS idx_rsvps_active_name_lower;
DROP INDEX IF EXISTS idx_rsvps_duplicate_group;
DROP INDEX IF EXISTS idx_rsvps_anonymized_source;
DROP INDEX IF EXISTS idx_rsvps_anonymized_dup_status;
DROP INDEX IF EXISTS idx_rsvps_anonymized_updated;

-- Restore 001 idx_rsvps_active_phone_unique definition
DROP INDEX IF EXISTS idx_rsvps_active_phone_unique;

CREATE UNIQUE INDEX idx_rsvps_active_phone_unique
  ON rsvps (phone_e164)
  WHERE is_anonymized = FALSE
    AND phone_e164 IS NOT NULL
    AND duplicate_review_status <> 'resolved_distinct'
    AND duplicate_review_status <> 'merged_archived';

-- Restore 001 chk_rsvps_anonymization_consistency before dropping duplicate_review_note
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

ALTER TABLE rsvps
  DROP CONSTRAINT IF EXISTS chk_rsvps_no_self_merge;

ALTER TABLE rsvps
  DROP COLUMN IF EXISTS duplicate_review_note,
  DROP COLUMN IF EXISTS duplicate_reviewed_by_admin_id,
  DROP COLUMN IF EXISTS duplicate_reviewed_at,
  DROP COLUMN IF EXISTS merged_into_rsvp_id,
  DROP COLUMN IF EXISTS duplicate_group_id,
  DROP COLUMN IF EXISTS updated_by_admin_id,
  DROP COLUMN IF EXISTS created_by_admin_id;

DROP TABLE IF EXISTS event_settings;
DROP TABLE IF EXISTS admin_audit_logs;
DROP TABLE IF EXISTS admin_sessions;
DROP TABLE IF EXISTS admin_users;

DELETE FROM schema_migrations WHERE version = '002_admin_dashboard';
