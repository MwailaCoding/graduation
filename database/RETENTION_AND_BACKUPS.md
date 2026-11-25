# RSVP Database Migrations, Data Retention & Backup Safeguards

## 1. Migrations

- **Apply migrations (idempotent):**
  ```bash
  npm run db:migrate
  ```
- **Rollback Phase 7 RSVP schema:**
  ```bash
  npm run db:migrate:down
  ```
- Applied versions are tracked in `schema_migrations`.

## 2. Authoritative Event & Retention Schedule

- **Timezone:** `Africa/Nairobi` (EAT, UTC+3)
- **Event date:** Saturday, 12 December 2026 at 12:00 PM
- **RSVP Closure Deadline:** `2026-12-12 00:00:00 Africa/Nairobi`
- **Personal-Data Retention Period:** 90 days after the event date
- **Planned Anonymization Date:** `2027-03-12 00:00:00 Africa/Nairobi` (`2027-03-11T21:00:00.000Z`)

## 3. Automated Retention & Irreversible Anonymization

After the retention deadline, the system permanently destroys identifying fields (`full_name`, `phone_e164`, `phone_country`, `dietary_requirements`, `congratulatory_message`, `management_token_hash`, `idempotency_key`, `organizer_notes`) and sets `is_anonymized = TRUE` and `anonymized_at = NOW()`. Only non-identifying aggregate attendance status (`attendance_status`, `attendee_count`) and timestamps remain.

### Execution Mechanisms

1. **Primary Scheduled Job (PrimeCloud / OS Cron):**
   Schedule a daily job on the hosting environment (e.g. `0 1 * * *` EAT) running:
   ```bash
   node database/anonymize.mjs
   ```
   Every execution logs a non-PII status row (`ran_at`, `cutoff_at`, `records_anonymized`, `status`, `error_summary`) into `rsvp_retention_runs` so failures are never silent and Phase 8 Admin Dashboard can monitor retention health.
2. **Defense-in-Depth Application Safeguard:**
   `ensureRetentionEnforcedIfDue()` runs on server-side page entry (`src/app/page.tsx` and `src/app/rsvp/manage/[token]/page.tsx`) at most once per hour per process once `RETENTION_ANONYMIZATION_DATE` has passed, ensuring expired personal data is not kept indefinitely if an external cron misses a run.

## 4. Backup Retention (14 Days) & Restore Safeguards

- **Backup Retention Policy:** Automated PostgreSQL backups/snapshots in PrimeCloud must be configured with a strict **14-day maximum retention window** so personal data cannot persist indefinitely in cold backups after anonymization (`12 March 2027` + 14 days = `26 March 2027` maximum backup expiry).
- **Mandatory Post-Restore Procedure:** Whenever a PostgreSQL backup is restored (disaster recovery or environment cloning), operators **must immediately execute**:
  ```bash
  node database/anonymize.mjs
  ```
  before re-enabling application traffic. This guarantees any expired RSVP rows present in a snapshot taken before anonymization are irreversibly re-anonymized upon restore and never silently reintroduced.
- **Infrastructure Limitation Note:** Automated cloud snapshot deletion/retention policy (14 days) is a PrimeCloud infrastructure/database-service configuration applied during Phase 11 deployment and cannot be enforced solely from inside the Next.js application container.

## 5. Rate Limiting & Proxy Trust Note

- Rate limiting is persisted in PostgreSQL (`rsvp_rate_limits`) using keyed HMAC-SHA256 hashes of the client key (zero raw IPs stored), making limits consistent across multiple Node/Next.js server instances.
- In production behind PrimeCloud's reverse proxy, configure the proxy to set a trusted `x-forwarded-for` / `x-real-ip` header and set `RATE_LIMIT_PEPPER` in the server environment.
