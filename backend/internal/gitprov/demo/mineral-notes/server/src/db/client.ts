import { Pool } from "pg";
import { env } from "../config";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
  }
  return pool;
}

export interface QueryResultRow {
  [column: string]: string | number | boolean | null;
}

export async function query<T extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query<T>(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(
  work: (client: { query: (sql: string, params?: unknown[]) => Promise<{ rows: QueryResultRow[] }> }) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client as never);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
