import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'
import { parseInt32 } from '@/lib/server/api-utils'
import { notifyRequestRaised } from '@/lib/server/notify'
import { logAudit } from '@/lib/server/audit'

export const GET = withAuth(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const status = sp.get('status') ?? undefined
  const projectId = sp.get('projectId') ?? undefined
  const limit = parseInt32(sp.get('limit'), 50)
  const offset = parseInt32(sp.get('offset'), 0)

  let query = supabaseAdmin()
    .from('resource_requests')
    .select(`
      id, request_number, request_type, booking_type, approval_status,
      resource_requested, start_date, end_date, hours_per_day, total_hours,
      role_needed, grade_needed, primary_skill, notes, created_at,
      opportunity_id, skill_set, travel_requirements, project_status,
      loading_pct, em_ep_name, lifecycle_status,
      service_line, sub_service_line,
      em_approved_resource_id, em_approved_at, em_approval_notes,
      project:projects(id, name, client, code, zoho_project_id),
      requester:employees!resource_requests_requested_by_fkey(id, name, employee_id)
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('approval_status', status)
  if (projectId) query = query.eq('project_id', projectId)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data, total: count ?? 0, limit, offset })
})

export const POST = withAuth(async (request: NextRequest, user) => {
  const body = await request.json()

  const required = ['role_needed', 'start_date', 'end_date']
  const missing = required.filter(f => !body[f])
  if (missing.length) return NextResponse.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 })

  const sb = supabaseAdmin()
  let projectId = body.project_id ?? null
  if (!projectId && body.project_name) {
    const { data: existing } = await sb.from('projects').select('id').ilike('name', body.project_name).limit(1).single()
    if (existing) {
      projectId = existing.id
    } else {
      const { data: created } = await sb.from('projects').insert({ name: body.project_name, engagement_manager: body.em_ep_name ?? null }).select('id').single()
      projectId = created?.id ?? null
    }
  }

  const { data, error } = await sb.from('resource_requests').insert({
    project_id: projectId,
    resource_requested: body.resource_requested ?? null,
    request_type: body.request_type ?? 'New Staff',
    booking_type: body.booking_type ?? 'tentative',
    requested_by: body.requested_by ?? null,
    start_date: body.start_date, end_date: body.end_date,
    hours_per_day: body.hours_per_day ?? 8, total_hours: body.total_hours ?? null,
    role_needed: body.role_needed, grade_needed: body.grade_needed ?? null,
    primary_skill: body.primary_skill ?? null, notes: body.notes ?? null,
    opportunity_id: body.opportunity_id ?? null, skill_set: body.skill_set ?? null,
    travel_requirements: body.travel_requirements ?? null, project_status: body.project_status ?? null,
    loading_pct: body.loading_pct ?? 100, em_ep_name: body.em_ep_name ?? null,
    service_line: body.service_line ?? null, sub_service_line: body.sub_service_line ?? null,
    lifecycle_status: 'submitted',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  notifyRequestRaised(data.id, body.project_name ?? 'Unknown Project', body.role_needed)

  logAudit({
    action: 'Created', entity: 'Request',
    entityName: `#${data.request_number} — ${body.project_name ?? 'Unknown Project'}`,
    entityId: data.id, userName: user.name ?? 'System',
    field: 'request', newValue: `${body.role_needed} | ${body.start_date} – ${body.end_date}`,
    metadata: { projectName: body.project_name, roleNeeded: body.role_needed, startDate: body.start_date, endDate: body.end_date, hoursPerDay: body.hours_per_day ?? 8, loadingPct: body.loading_pct ?? 100, resourceRequested: body.resource_requested ?? null },
  })

  return NextResponse.json(data, { status: 201 })
})
