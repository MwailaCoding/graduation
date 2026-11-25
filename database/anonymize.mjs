import pg from "pg";

const { Pool } = pg;

function parseArgs(argv) {
  let force = false;
  let now = new Date();

  for (const arg of argv) {
    if (arg === "--force") {
      force = true;
    } else if (arg.startsWith("--now=")) {
      const raw = arg.slice("--now=".length).trim();
      const parsed = new Date(raw);
      if (!Number.isFinite(parsed.getTime())) {
        throw new Error("Invalid --now ISO timestamp.");
      }
      now = parsed;
    }
  }

  const simulatedIso = process.env.RSVP_SIMULATED_NOW_ISO?.trim();
  if (argv.every((arg) => !arg.startsWith("--now=")) && simulatedIso) {
    const parsed = new Date(simulatedIso);
    if (Number.isFinite(parsed.getTime())) {
      now = parsed;
    }
  }

  return { force, now };
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Missing DATABASE_URL environment variable. Run with --env-file=.env.local."
    );
  }
  return new Pool({ connectionString });
}

async function main() {
  let pool;
  try {
    const { force, now } = parseArgs(process.argv.slice(2));
    const cutoffIso = now.toISOString();
    pool = createPool();

    const client = await pool.connect();
    let anonymizedCount = 0;

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
        [cutoffIso, force]
      );

      anonymizedCount = updateResult.rowCount ?? 0;

      await client.query(
        "DELETE FROM rsvp_rate_limits WHERE expires_at < NOW()"
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
        [cutoffIso, anonymizedCount]
      );

      await client.query("COMMIT");
      console.log(
        `[anonymize] Completed successfully. cutoff=${cutoffIso} records_anonymized=${anonymizedCount}`
      );
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
          [cutoffIso, safeSummary]
        )
        .catch(() => {});

      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown anonymization error";
    console.error(`[anonymize] Failed: ${message}`);
    process.exitCode = 1;
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
  }
}

await main();
