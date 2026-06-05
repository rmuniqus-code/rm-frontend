import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'
import { logAudit } from '@/lib/server/audit'

export const POST = withAuth(async (request: NextRequest, user, ctx: any) => {
  const { id } = await ctx.params
  const body = await request.json()
  const sb = supabaseAdmin()

  if (!body.shortlisted_resource_id) {
    return NextResponse.json({ error: 'shortlisted_resource_id is required' }, { status: 400 })
  }

  const { data: shortlisted, error: slErr } = await sb.from('request_shortlisted_resources')
    .select('*').eq('id', body.shortlisted_resource_id).eq('request_id', id).single()
  if (slErr || !shortlisted) return NextResponse.json({ error: 'Shortlisted resource not found for this request' }, { status: 404 })

  const { data: req, error: reqErr } = await sb.from('resource_requests').select('*, project:projects(name)').eq('id', id).single()
  if (reqErr || !req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  await sb.from('request_shortlisted_resources').update({ status: 'em_selected' }).eq('id', body.shortlisted_resource_id)

  const { data: updated, error: updateErr } = await sb.from('resource_requests').update({
    approval_status: 'em_approved',
    em_approved_resource_id: (shortlisted as any).employee_id ?? null,
    resource_requested: (shortlisted as any).employee_name,
    em_approved_at: new Date().toISOString(),
    em_approval_notes: body.notes ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).select().single()
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  const projectName = (req as any).project?.name ?? 'Unknown Project'
  logAudit({ action: 'Updated', entity: 'Request', entityName: `#${(req as any).request_number} — ${projectName}`, entityId: id, userName: user.name ?? 'System', field: 'approval_status', oldValue: 'shortlisted', newValue: 'em_approved', metadata: { selected_resource: (shortlisted as any).employee_name, em_notes: body.notes ?? null } })

  return NextResponse.json({ request: updated, selectedResource: shortlisted })
})
