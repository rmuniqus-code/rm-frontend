import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'

const EDITOR_ROLES = new Set(['admin', 'rm'])

export const GET = withAuth(async (_request: NextRequest, user) => {
  if (!EDITOR_ROLES.has(user.role)) {
    return NextResponse.json({ error: 'Forbidden — editor role required' }, { status: 403 })
  }

  const { data } = await supabaseAdmin().from('employee_notes').select('employee_id, note, updated_by, updated_at')
  const uuids = (data ?? []).map((r: any) => r.employee_id)
  const { data: empRows } = await supabaseAdmin().from('employees').select('id, employee_id').in('id', uuids)

  const codeById = new Map<string, string>()
  for (const e of empRows ?? []) codeById.set((e as any).id, (e as any).employee_id)

  const notes: Record<string, string> = {}
  for (const r of data ?? []) {
    const code = codeById.get((r as any).employee_id)
    if (code && (r as any).note) notes[code] = (r as any).note
  }

  return NextResponse.json({ notes })
})
