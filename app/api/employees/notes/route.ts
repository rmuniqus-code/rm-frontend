import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'

const EDITOR_ROLES = new Set(['admin', 'rm'])

export const GET = withAuth(async (_request: NextRequest, user) => {
  if (!EDITOR_ROLES.has(user.role)) {
    return NextResponse.json({ error: 'Forbidden — editor role required' }, { status: 403 })
  }

  const rows = await query<{ employee_code: string; note: string }>(
    `SELECT e.employee_id AS employee_code, n.note
     FROM employee_notes n
     JOIN employees e ON e.id = n.employee_id
     WHERE n.note IS NOT NULL AND n.note <> ''`,
    []
  )

  const notes: Record<string, string> = {}
  for (const r of rows) {
    if (r.employee_code && r.note) notes[r.employee_code] = r.note
  }

  return NextResponse.json({ notes })
})
