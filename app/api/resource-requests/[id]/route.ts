import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'
import { logAudit, logAuditDiff } from '@/lib/server/audit'

const EDITABLE = [
  'resource_requested', 'request_type', 'booking_type', 'start_date', 'end_date',
  'hours_per_day', 'total_hours', 'role_needed', 'grade_needed', 'primary_skill',
  'notes', 'opportunity_id', 'skill_set', 'travel_requirements', 'project_status',
  'loading_pct', 'em_ep_name', 'service_line', 'sub_service_line',
]

export const GET = withAuth(async (_request: NextRequest, _user, ctx: any) => {
  const { id } = await ctx.params
  const { data, error } = await supabaseAdmin()
    .from('resource_requests')
    .select(`*, project:projects(id, name, client, engagement_manager), requester:employees!resource_requests_requested_by_fkey(id, name, employee_id), approver:employees!resource_requests_approved_by_fkey(id, name, employee_id)`)
    .eq('id', id).single()

  if (error) return NextResponse.json({ error: error.message }, { status: error.code === 'PGRST116' ? 404 : 500 })
  return NextResponse.json(data)
})

export const PATCH = withAuth(async (request: NextRequest, user, ctx: any) => {
  const { id } = await ctx.params
  const body = await request.json()
  const sb = supabaseAdmin()

  const { data: before } = await sb.from('resource_requests').select('*, project:projects(name)').eq('id', id).single()

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const f of EDITABLE) { if (f in body) update[f] = body[f] }

  const { data, error } = await sb.from('resource_requests').update(update).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (before) {
    const projectName = (before as any).project?.name ?? 'Unknown Project'
    if (body.resource_requested && body.resource_requested !== (before as any).resource_requested) {
      logAudit({ action: 'Assigned', entity: 'Request', entityName: `#${(before as any).request_number} — ${projectName}`, entityId: id, userName: user.name ?? 'System', field: 'resource_requested', oldValue: (before as any).resource_requested ?? 'Unassigned', newValue: body.resource_requested })
    } else {
      logAuditDiff({ action: 'Updated', entity: 'Request', entityName: `#${(before as any).request_number} — ${projectName}`, entityId: id, userName: user.name ?? 'System' }, before as any, body, EDITABLE)
    }
  }

  return NextResponse.json(data)
})

export const DELETE = withAuth(async (_request: NextRequest, user, ctx: any) => {
  const { id } = await ctx.params
  const sb = supabaseAdmin()
  const { data: before } = await sb.from('resource_requests').select('request_number, project:projects(name), role_needed').eq('id', id).single()

  const { error } = await sb.from('resource_requests').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (before) {
    logAudit({ action: 'Deleted', entity: 'Request', entityName: `#${(before as any).request_number} — ${(before as any).project?.name ?? 'Unknown'}`, entityId: id, userName: user.name ?? 'System', field: 'request', oldValue: (before as any).role_needed ?? '' })
  }

  return NextResponse.json({ deleted: true })
})
