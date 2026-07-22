import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
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

  const conditions: string[] = []
  const params: unknown[] = []
  let paramIdx = 1

  if (status) { conditions.push(`rr.approval_status = $${paramIdx++}`); params.push(status) }
  if (projectId) { conditions.push(`rr.project_id = $${paramIdx++}`); params.push(projectId) }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const dataSql = `
    SELECT
      rr.id, rr.request_number, rr.request_type, rr.booking_type, rr.approval_status,
      rr.resource_requested, rr.start_date, rr.end_date, rr.hours_per_day, rr.total_hours,
      rr.role_needed, rr.grade_needed, rr.primary_skill, rr.notes, rr.created_at,
      rr.opportunity_id, rr.skill_set, rr.travel_requirements, rr.project_status,
      rr.loading_pct, rr.em_ep_name, rr.lifecycle_status,
      rr.service_line, rr.sub_service_line,
      rr.em_approved_resource_id, rr.em_approved_at, rr.em_approval_notes,
      CASE WHEN p.id IS NOT NULL THEN
        json_build_object('id', p.id, 'name', p.name, 'client', p.client, 'code', p.code, 'zoho_project_id', p.zoho_project_id)
      END AS project,
      CASE WHEN e.id IS NOT NULL THEN
        json_build_object('id', e.id, 'name', e.name, 'employee_id', e.employee_id)
      END AS requester
    FROM resource_requests rr
    LEFT JOIN projects p ON p.id = rr.project_id
    LEFT JOIN employees e ON e.id = rr.requested_by
    ${whereClause}
    ORDER BY rr.created_at DESC
    LIMIT $${paramIdx++} OFFSET $${paramIdx++}
  `
  const dataParams = [...params, limit, offset]

  const countSql = `
    SELECT COUNT(*) AS total FROM resource_requests rr ${whereClause}
  `

  try {
    const [data, countRows] = await Promise.all([
      query(dataSql, dataParams),
      query<{ total: string }>(countSql, params),
    ])
    const total = parseInt(countRows[0]?.total ?? '0', 10)
    return NextResponse.json({ data, total, limit, offset })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})

export const POST = withAuth(async (request: NextRequest, user) => {
  const body = await request.json()

  const required = ['role_needed', 'start_date', 'end_date']
  const missing = required.filter(f => !body[f])
  if (missing.length) return NextResponse.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 })

  let projectId = body.project_id ?? null
  if (!projectId && body.project_name) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM projects WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [body.project_name],
    )
    if (existing) {
      projectId = existing.id
    } else {
      const created = await queryOne<{ id: string }>(
        `INSERT INTO projects (name, engagement_manager) VALUES ($1, $2) RETURNING id`,
        [body.project_name, body.em_ep_name ?? null],
      )
      projectId = created?.id ?? null
    }
  }

  try {
    const data = await queryOne<any>(
      `INSERT INTO resource_requests (
        project_id, resource_requested, request_type, booking_type, requested_by,
        start_date, end_date, hours_per_day, total_hours, role_needed, grade_needed,
        primary_skill, notes, opportunity_id, skill_set, travel_requirements,
        project_status, loading_pct, em_ep_name, service_line, sub_service_line, lifecycle_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,'submitted')
      RETURNING *`,
      [
        projectId,
        body.resource_requested ?? null,
        body.request_type ?? 'New Staff',
        body.booking_type ?? 'tentative',
        body.requested_by ?? null,
        body.start_date,
        body.end_date,
        body.hours_per_day ?? 8,
        body.total_hours ?? null,
        body.role_needed,
        body.grade_needed ?? null,
        body.primary_skill ?? null,
        body.notes ?? null,
        body.opportunity_id ?? null,
        body.skill_set ?? null,
        body.travel_requirements ?? null,
        body.project_status ?? null,
        body.loading_pct ?? 100,
        body.em_ep_name ?? null,
        body.service_line ?? null,
        body.sub_service_line ?? null,
      ],
    )

    if (!data) return NextResponse.json({ error: 'Insert failed' }, { status: 500 })

    notifyRequestRaised(data.id, body.project_name ?? 'Unknown Project', body.role_needed)

    logAudit({
      action: 'Created', entity: 'Request',
      entityName: `#${data.request_number} — ${body.project_name ?? 'Unknown Project'}`,
      entityId: data.id, userName: user.name ?? 'System',
      field: 'request', newValue: `${body.role_needed} | ${body.start_date} – ${body.end_date}`,
      metadata: { projectName: body.project_name, roleNeeded: body.role_needed, startDate: body.start_date, endDate: body.end_date, hoursPerDay: body.hours_per_day ?? 8, loadingPct: body.loading_pct ?? 100, resourceRequested: body.resource_requested ?? null },
    })

    return NextResponse.json(data, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})
