import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __pgPool?: Pool;
};

function getDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Missing required environment variable: DATABASE_URL. Configure it in your environment variables or .env.local."
    );
  }
  return connectionString;
}

export function getPool(): Pool {
  if (!globalForDb.__pgPool) {
    globalForDb.__pgPool = new Pool({
      connectionString: getDatabaseUrl(),
    });
  }
  return globalForDb.__pgPool;
}

export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop, receiver) {
    const targetPool = getPool();
    const value = Reflect.get(targetPool, prop, receiver);
    if (typeof value === "function") {
      return value.bind(targetPool);
    }
    return value;
  },
});

export async function checkDatabaseConnection(): Promise<boolean> {
  const result = await pool.query<{ ok: number }>("SELECT 1 AS ok");
  return result.rows[0]?.ok === 1;
}
