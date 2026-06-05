import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'
import { logAudit } from '@/lib/server/audit'
import { notifyAllocationConfirmed } from '@/lib/server/notify'
import { resolveEmployeeIdByEmail } from '@/lib/server/notify'

function weekStartsBetween(from: string, to: string): string[] {
  const result: string[] = []
  const start = new Date(from)
  const end = new Date(to)
  const day = start.getUTCDay()
  const offset = (day === 0 ? -6 : 1 - day)
  start.setUTCDate(start.getUTCDate() + offset)
  while (start <= end) {
    result.push(start.toISOString().split('T')[0])
    start.setUTCDate(start.getUTCDate() + 7)
  }
  return result
}

export const POST = withAuth(async (request: NextRequest, user, ctx: any) => {
  const { id } = await ctx.params
  const body = await request.json()
  const decision = body.decision as 'approved' | 'rejected'

  if (!['approved', 'rejected'].includes(decision)) {
    return NextResponse.json({ error: 'decision must be "approved" or "rejected"' }, { status: 400 })
  }

  const sb = supabaseAdmin()
  const { data: request_data, error: fetchErr } = await sb.from('resource_requests')
    .select('*, project:projects(name, code, project_description, engagement_manager, engagement_partner)')
    .eq('id', id).single()

  if (fetchErr || !request_data) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const req = request_data as any
  const projectName = req.project?.name ?? 'Unknown Project'

  if (decision === 'rejected') {
    const { error: updateErr } = await sb.from('resource_requests').update({ approval_status: 'rejected', lifecycle_status: 'rejected', notes: body.notes ?? undefined, updated_at: new Date().toISOString() }).eq('id', id)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    logAudit({ action: 'Rejected', entity: 'Request', entityName: `#${req.request_number} — ${projectName}`, entityId: id, userName: user.name ?? 'System', field: 'approval_status', oldValue: req.approval_status ?? 'pending', newValue: 'rejected' })
    return NextResponse.json({ request: { ...req, approval_status: 'rejected', lifecycle_status: 'rejected' }, allocationsCreated: 0 })
  }

  if (decision === 'approved' && req.approval_status !== 'em_approved') {
    return NextResponse.json({ error: `Cannot approve — request must be in 'em_approved' status (currently '${req.approval_status}').` }, { status: 400 })
  }

  const allocatedName = body.allocated_employee ? String(body.allocated_employee).trim() : req.resource_requested ? String(req.resource_requested).trim() : null
  if (!allocatedName) return NextResponse.json({ error: 'Approval requires an allocated employee.' }, { status: 400 })

  let empRow: { id: string; skill_set: string | null } | null = null
  const { data: byId } = await sb.from('employees').select('id, skill_set').eq('employee_id', allocatedName).limit(1).maybeSingle()
  if (byId) { empRow = byId as any } else {
    const { data: byName } = await sb.from('employees').select('id, skill_set').ilike('name', allocatedName).limit(1).maybeSingle()
    empRow = byName as any
  }

  if (!empRow) return NextResponse.json({ error: `Employee "${allocatedName}" not found.` }, { status: 400 })
  if (!req.start_date || !req.end_date) return NextResponse.json({ error: 'Request must have start_date and end_date.' }, { status: 400 })

  const weeks = weekStartsBetween(req.start_date, req.end_date)
  if (weeks.length === 0) return NextResponse.json({ error: 'No valid weeks found.' }, { status: 400 })

  const bodyHpd = (typeof body.hours_per_day === 'number' && body.hours_per_day > 0) ? body.hours_per_day : null
  const reqLoadingPct = (req.loading_pct != null && Number(req.loading_pct) > 0) ? Math.min(200, Number(req.loading_pct)) : null
  const reqHpd = (req.hours_per_day && req.hours_per_day > 0) ? req.hours_per_day : null
  const pct = bodyHpd !== null ? Math.min(200, (bodyHpd / 8) * 100) : reqLoadingPct ?? (reqHpd !== null ? Math.min(200, (reqHpd / 8) * 100) : 100)

  const rows = weeks.map(w => ({ employee_id: empRow!.id, project_id: req.project_id, week_start: w, allocation_pct: pct, allocation_status: 'confirmed', raw_text: `Approved request #${req.request_number}`, source_file: 'resource_request_approval' }))

  await sb.from('forecast_allocations').delete().eq('employee_id', empRow.id).eq('project_id', req.project_id).in('week_start', weeks)

  const { error: insertErr } = await sb.from('forecast_allocations').insert(rows)
  if (insertErr) return NextResponse.json({ error: `Allocation creation failed: ${insertErr.message}` }, { status: 500 })

  const allocationsCreated = rows.length

  const updatePayload: Record<string, unknown> = { approval_status: 'approved', lifecycle_status: 'approved', notes: body.notes ?? undefined, updated_at: new Date().toISOString() }
  if (body.approved_by) updatePayload.approved_by = body.approved_by
  if (body.allocated_employee) { updatePayload.resource_requested = allocatedName; updatePayload.hours_per_day = (pct / 100) * 8 }

  const { data: updatedRequest, error: updateErr } = await sb.from('resource_requests').update(updatePayload).eq('id', id).select('*, project:projects(name, code, project_description, engagement_manager, engagement_partner)').single()
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  logAudit({ action: 'Approved', entity: 'Request', entityName: `#${req.request_number} — ${projectName}`, entityId: id, userName: user.name ?? 'System', field: 'approval_status', oldValue: req.approval_status ?? 'pending', newValue: 'approved', metadata: { allocatedEmployee: allocatedName, allocationsCreated, hoursPerDay: (pct / 100) * 8 } })
  logAudit({ action: 'Created', entity: 'Allocation', entityName: `${allocatedName} → ${projectName}`, entityId: id, userName: user.name ?? 'System', field: 'allocation', newValue: `${allocationsCreated} weeks confirmed`, metadata: { employee: allocatedName, project: projectName, weeks: allocationsCreated, startDate: req.start_date, endDate: req.end_date } })

  const project = req.project ?? {}
  const emEpName = req.em_ep_name ?? (project.engagement_manager && project.engagement_partner ? `${project.engagement_manager} / ${project.engagement_partner}` : project.engagement_manager ?? project.engagement_partner ?? null)
  const actorEmployeeId = await resolveEmployeeIdByEmail(user.email)

  notifyAllocationConfirmed({ requestId: id, resourceEmployeeId: empRow.id, resourceName: allocatedName, roleSkill: empRow.skill_set ?? req.primary_skill ?? null, startDate: req.start_date, endDate: req.end_date, loadingPct: pct, projectName, projectCode: project.code ?? null, emEpName, projectDescription: project.project_description ?? null, actorEmployeeId })

  return NextResponse.json({ request: updatedRequest, allocationsCreated })
})
