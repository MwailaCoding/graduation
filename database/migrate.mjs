import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Missing DATABASE_URL environment variable. Run with --env-file=.env.local."
    );
  }
  return new Pool({ connectionString });
}

async function listUpMigrations() {
  const entries = await fs.readdir(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".sql") &&
        !entry.name.endsWith(".down.sql")
    )
    .map((entry) => ({
      version: entry.name.slice(0, -".sql".length),
      upPath: path.join(MIGRATIONS_DIR, entry.name),
      downPath: path.join(
        MIGRATIONS_DIR,
        `${entry.name.slice(0, -".sql".length)}.down.sql`
      ),
    }))
    .sort((a, b) => a.version.localeCompare(b.version));
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(64) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function runUp(pool) {
  const migrations = await listUpMigrations();
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);
    const { rows } = await client.query(
      "SELECT version FROM schema_migrations ORDER BY version ASC"
    );
    const applied = new Set(rows.map((row) => row.version));

    for (const migration of migrations) {
      if (applied.has(migration.version)) {
        console.log(`[migrate] Skipping ${migration.version} (already applied)`);
        continue;
      }

      const sql = await fs.readFile(migration.upPath, "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING",
          [migration.version]
        );
        await client.query("COMMIT");
        console.log(`[migrate] Applied ${migration.version}`);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
    }
  } finally {
    client.release();
  }
}

async function runDown(pool) {
  const migrations = await listUpMigrations();
  const migrationMap = new Map(migrations.map((m) => [m.version, m]));
  const client = await pool.connect();

  try {
    const regResult = await client.query(
      "SELECT to_regclass('public.schema_migrations') AS table_name"
    );
    if (!regResult.rows[0]?.table_name) {
      console.log("[migrate] No schema_migrations table found; nothing to roll back.");
      return;
    }

    const { rows } = await client.query(
      "SELECT version FROM schema_migrations ORDER BY version DESC"
    );

    if (rows.length === 0) {
      console.log("[migrate] No applied migrations to roll back.");
      return;
    }

    for (const row of rows) {
      const migration = migrationMap.get(row.version);
      if (!migration) {
        throw new Error(`Missing migration metadata for version: ${row.version}`);
      }

      const downSql = await fs.readFile(migration.downPath, "utf8");
      await client.query("BEGIN");
      try {
        await client.query(downSql);
        await client.query("COMMIT");
        console.log(`[migrate] Rolled back ${migration.version}`);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
      }
    }
  } finally {
    client.release();
  }
}

async function main() {
  const direction = process.argv[2] ?? "up";
  if (direction !== "up" && direction !== "down") {
    console.error("Usage: node --env-file=.env.local database/migrate.mjs [up|down]");
    process.exitCode = 1;
    return;
  }

  let pool;
  try {
    pool = createPool();
    if (direction === "up") {
      await runUp(pool);
    } else {
      await runDown(pool);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown migration error";
    console.error(`[migrate] Failed (${direction}): ${message}`);
    process.exitCode = 1;
  } finally {
    if (pool) {
      await pool.end().catch(() => {});
    }
  }
}

await main();
