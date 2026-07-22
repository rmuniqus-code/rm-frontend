import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'

const EDITOR_ROLES = new Set(['admin', 'rm'])

async function resolveEmployeeId(empCode: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>('SELECT id FROM employees WHERE employee_id = $1', [empCode])
  return row?.id ?? null
}

export const GET = withAuth(async (_request: NextRequest, _user, ctx: any) => {
  const { empCode } = await ctx.params
  const employeeId = await resolveEmployeeId(empCode)
  if (!employeeId) return NextResponse.json({ error: 'employee not found' }, { status: 404 })

  const data = await queryOne<{ note: string; updated_by: string | null; updated_at: string | null }>(
    'SELECT note, updated_by, updated_at FROM employee_notes WHERE employee_id = $1',
    [employeeId]
  )
  return NextResponse.json({ note: data?.note ?? '', updatedBy: data?.updated_by ?? null, updatedAt: data?.updated_at ?? null })
})

export const PUT = withAuth(async (request: NextRequest, user, ctx: any) => {
  if (!EDITOR_ROLES.has(user.role)) {
    return NextResponse.json({ error: 'Forbidden — editor role required' }, { status: 403 })
  }

  const { empCode } = await ctx.params
  const { note } = await request.json()
  if (note === undefined) return NextResponse.json({ error: 'note is required' }, { status: 400 })

  const employeeId = await resolveEmployeeId(empCode)
  if (!employeeId) return NextResponse.json({ error: 'employee not found' }, { status: 404 })

  const updatedBy = user.name ?? user.email ?? 'system'
  try {
    const data = await queryOne<{ note: string; updated_by: string; updated_at: string }>(
      `INSERT INTO employee_notes (employee_id, note, updated_by, updated_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (employee_id) DO UPDATE
         SET note = EXCLUDED.note, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
       RETURNING note, updated_by, updated_at`,
      [employeeId, String(note), updatedBy, new Date().toISOString()]
    )
    if (!data) return NextResponse.json({ error: 'upsert returned no data' }, { status: 500 })
    return NextResponse.json({ note: data.note, updatedBy: data.updated_by, updatedAt: data.updated_at })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
})
