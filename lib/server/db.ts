import { Pool } from 'pg'

let pool: Pool | null = null

export function getDb(): Pool {
  if (pool) return pool
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('Missing DATABASE_URL env var')
  pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 })
  return pool
}

/** Convenience: run a query and return rows */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  const db = getDb()
  const res = await db.query(sql, params)
  return res.rows as T[]
}

/** Convenience: run a query and return the first row or null */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(sql, params)
  return rows[0] ?? null
}
