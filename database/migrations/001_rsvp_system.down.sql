-- Rollback for 001_rsvp_system.sql

DROP TABLE IF EXISTS rsvp_retention_runs;
DROP TABLE IF EXISTS rsvp_rate_limits;
DROP TABLE IF EXISTS rsvps;

DO $$
BEGIN
  IF to_regclass('public.schema_migrations') IS NOT NULL THEN
    DELETE FROM schema_migrations WHERE version = '001_rsvp_system';
    IF NOT EXISTS (SELECT 1 FROM schema_migrations) THEN
      DROP TABLE schema_migrations;
    END IF;
  END IF;
END
$$;
