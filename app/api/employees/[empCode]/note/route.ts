import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'

const EDITOR_ROLES = new Set(['admin', 'rm'])

async function resolveEmployeeId(empCode: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from('employees').select('id').eq('employee_id', empCode).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

export const GET = withAuth(async (_request: NextRequest, _user, ctx: any) => {
  const { empCode } = await ctx.params
  const employeeId = await resolveEmployeeId(empCode)
  if (!employeeId) return NextResponse.json({ error: 'employee not found' }, { status: 404 })

  const { data } = await supabaseAdmin().from('employee_notes').select('note, updated_by, updated_at').eq('employee_id', employeeId).maybeSingle()
  return NextResponse.json({ note: (data as any)?.note ?? '', updatedBy: (data as any)?.updated_by ?? null, updatedAt: (data as any)?.updated_at ?? null })
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
  const { data, error } = await supabaseAdmin().from('employee_notes')
    .upsert({ employee_id: employeeId, note: String(note), updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: 'employee_id' })
    .select('note, updated_by, updated_at').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ note: (data as any).note, updatedBy: (data as any).updated_by, updatedAt: (data as any).updated_at })
})
