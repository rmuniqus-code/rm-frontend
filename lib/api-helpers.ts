/**
 * Shared API route utilities.
 *
 * Standardizes:
 *   - Error responses (consistent shape for the frontend)
 *   - Try/catch boilerplate
 *   - Query param parsing (dates, ints)
 */

import { NextResponse } from 'next/server'

export type ApiError = { error: string; details?: unknown }

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init)
}

export function fail(status: number, message: string, details?: unknown) {
  return NextResponse.json({ error: message, details } satisfies ApiError, { status })
}

/**
 * Wrap an async handler. Catches thrown errors and returns 500 with
 * the error message — never leaks stack traces or service-role state.
 */
export function withErrorHandling<T extends unknown[]>(
  handler: (...args: T) => Promise<Response>,
) {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args)
    } catch (err) {
      console.error('[api error]', err)
      const message = err instanceof Error ? err.message : 'Internal server error'
      return fail(500, message)
    }
  }
}

// ─── Query param parsing ─────────────────────────────────────

export function parseISODate(val: string | null): string | null {
  if (!val) return null
  const d = new Date(val)
  if (isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}

export function parseInt32(val: string | null, fallback: number): number {
  if (!val) return fallback
  const n = parseInt(val, 10)
  return isNaN(n) ? fallback : n
}
