/**
 * Fetch helper for the external backend API.
 *
 * Reads NEXT_PUBLIC_API_BASE_URL. When unset, calls fall through to
 * same-origin — preserving the existing Next.js /api/* routes so the
 * app keeps working during the migration.
 *
 * When the backend base URL is set, the Supabase access token is
 * attached as a Bearer header so the backend's requireAuth middleware
 * can verify the caller.
 */

import { createClient } from '@/utils/supabase/client'

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''

async function bearerHeader(): Promise<Record<string, string>> {
  if (!API_BASE) return {}
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { authorization: `Bearer ${token}` } : {}
}

/**
 * Low-level variant — returns the raw Response so callers can keep their
 * existing `res.ok` / `res.json()` handling. Same URL resolution + bearer
 * token rules as `api()`.
 */
export async function apiRaw(path: string, init: RequestInit = {}): Promise<Response> {
  const auth = await bearerHeader()
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...auth,
      ...(init.headers ?? {}),
    },
  })
}

/** Resolve a backend path to its full URL (for XHR, etc.). */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`
}

/** Return `{ authorization: 'Bearer ...' }` or {}. For XHR. */
export async function apiAuthHeader(): Promise<Record<string, string>> {
  return bearerHeader()
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const auth = await bearerHeader()
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...auth,
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

/**
 * Inline allocation management — POST endpoints under /api/allocations.
 * Backend resolves emp_code → employee.id and project_name → project.id,
 * applies role gating, writes forecast_allocations, and audits every
 * action. Frontend never mutates the DB directly.
 */
export const allocations = {
  create: (body: {
    empCode?: string
    employeeId?: string
    projectName?: string | null
    projectId?: string | null
    weekStarts: string[]
    allocationPct?: number
    allocationStatus?: string
    rawText?: string | null
  }) => api<{ allocations: unknown[] }>('/api/allocations/create', {
    method: 'POST', body: JSON.stringify(body),
  }),

  update: (body: {
    id?: string
    empCode?: string
    projectName?: string | null
    weekStart?: string
    patch: {
      allocationPct?: number
      allocationStatus?: string
      projectName?: string | null
      projectId?: string | null
      weekStart?: string
      rawText?: string | null
    }
  }) => api<{ allocation: unknown }>('/api/allocations/update', {
    method: 'POST', body: JSON.stringify(body),
  }),

  remove: (body: {
    id?: string
    empCode?: string
    projectName?: string | null
    weekStarts?: string[]
  }) => api<{ deleted: number }>('/api/allocations/delete', {
    method: 'POST', body: JSON.stringify(body),
  }),

  extend: (body: {
    empCode: string
    projectName?: string | null
    fromWeekStart: string
    byWeeks?: number
    throughWeekStart?: string
    allocationPct?: number
  }) => api<{ allocations: unknown[] }>('/api/allocations/extend', {
    method: 'POST', body: JSON.stringify(body),
  }),

  setStatus: (body: {
    id?: string
    empCode?: string
    projectName?: string | null
    weekStart?: string
    status: 'proposed' | 'confirmed'
    applyToAllWeeks?: boolean
  }) => api<{ updated: number; allocation?: unknown; allocations?: unknown[] }>(
    '/api/allocations/status',
    { method: 'POST', body: JSON.stringify(body) },
  ),
}

/**
 * Upload a file via multipart/form-data.
 * Does NOT set content-type (browser sets the multipart boundary).
 */
export async function apiUpload<T = unknown>(path: string, formData: FormData): Promise<T> {
  const auth = await bearerHeader()
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { ...auth },
    body: formData,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}
