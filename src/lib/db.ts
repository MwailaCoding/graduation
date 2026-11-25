import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __pgPool?: Pool;
};

function getDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Missing required environment variable: DATABASE_URL. Configure it in .env.local."
    );
  }
  return connectionString;
}

function createPool(): Pool {
  return new Pool({
    connectionString: getDatabaseUrl(),
  });
}

export const pool: Pool = globalForDb.__pgPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pgPool = pool;
}

export async function checkDatabaseConnection(): Promise<boolean> {
  const result = await pool.query<{ ok: number }>("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}
