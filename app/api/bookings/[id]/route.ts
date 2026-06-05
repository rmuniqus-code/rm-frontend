import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'
import { logAuditDiff } from '@/lib/server/audit'

const EDITABLE_FIELDS = new Set(['allocation_pct', 'allocation_status', 'project_id', 'week_start', 'raw_text'])

export const PATCH = withAuth(async (request: NextRequest, user, ctx: any) => {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const body = await request.json() as Record<string, unknown>
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of Object.keys(body)) {
    if (EDITABLE_FIELDS.has(key)) patch[key] = body[key]
  }
  if (Object.keys(patch).length === 1) {
    return NextResponse.json({ error: 'no editable fields in payload' }, { status: 400 })
  }

  const sb = supabaseAdmin()
  const { data: before, error: fetchErr } = await sb.from('forecast_allocations').select('*').eq('id', id).maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!before) return NextResponse.json({ error: 'allocation not found' }, { status: 404 })

  const { data: updated, error: updateErr } = await sb.from('forecast_allocations').update(patch).eq('id', id).select('*').single()
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await logAuditDiff(
    { entity: 'Allocation', entityId: id, entityName: (before as any)?.raw_text ?? null, action: 'Updated', userName: user.email ?? 'system' },
    before as Record<string, unknown>,
    updated as Record<string, unknown>,
    ['allocation_pct', 'allocation_status', 'project_id', 'week_start', 'raw_text'],
  )

  return NextResponse.json({ allocation: updated })
})
