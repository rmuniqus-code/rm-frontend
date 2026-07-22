import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
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
  try {
    const data = await queryOne<any>(
      `SELECT
        rr.*,
        CASE WHEN p.id IS NOT NULL THEN
          json_build_object('id', p.id, 'name', p.name, 'client', p.client, 'engagement_manager', p.engagement_manager)
        END AS project,
        CASE WHEN req.id IS NOT NULL THEN
          json_build_object('id', req.id, 'name', req.name, 'employee_id', req.employee_id)
        END AS requester,
        CASE WHEN apr.id IS NOT NULL THEN
          json_build_object('id', apr.id, 'name', apr.name, 'employee_id', apr.employee_id)
        END AS approver
      FROM resource_requests rr
      LEFT JOIN projects p ON p.id = rr.project_id
      LEFT JOIN employees req ON req.id = rr.requested_by
      LEFT JOIN employees apr ON apr.id = rr.approved_by
      WHERE rr.id = $1`,
      [id],
    )
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})

export const PATCH = withAuth(async (request: NextRequest, user, ctx: any) => {
  const { id } = await ctx.params
  const body = await request.json()

  // Fetch before state for audit
  const before = await queryOne<any>(
    `SELECT rr.*, p.name AS project_name
     FROM resource_requests rr
     LEFT JOIN projects p ON p.id = rr.project_id
     WHERE rr.id = $1`,
    [id],
  )

  const setClauses: string[] = []
  const params: unknown[] = []
  let paramIdx = 1

  setClauses.push(`updated_at = $${paramIdx++}`)
  params.push(new Date().toISOString())

  for (const f of EDITABLE) {
    if (f in body) {
      setClauses.push(`${f} = $${paramIdx++}`)
      params.push(body[f])
    }
  }

  if (setClauses.length === 1) {
    // only updated_at — nothing to update
    const current = await queryOne(`SELECT * FROM resource_requests WHERE id = $1`, [id])
    return NextResponse.json(current)
  }

  params.push(id)
  try {
    const data = await queryOne<any>(
      `UPDATE resource_requests SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params,
    )
    if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (before) {
      const projectName = before.project_name ?? 'Unknown Project'
      // Reconstruct before shape matching original (project as nested object)
      const beforeCompat = { ...before, project: { name: projectName } }
      if (body.resource_requested && body.resource_requested !== before.resource_requested) {
        logAudit({ action: 'Assigned', entity: 'Request', entityName: `#${before.request_number} — ${projectName}`, entityId: id, userName: user.name ?? 'System', field: 'resource_requested', oldValue: before.resource_requested ?? 'Unassigned', newValue: body.resource_requested })
      } else {
        logAuditDiff({ action: 'Updated', entity: 'Request', entityName: `#${before.request_number} — ${projectName}`, entityId: id, userName: user.name ?? 'System' }, beforeCompat as any, body, EDITABLE)
      }
    }

    return NextResponse.json(data)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})

export const DELETE = withAuth(async (_request: NextRequest, user, ctx: any) => {
  const { id } = await ctx.params

  const before = await queryOne<any>(
    `SELECT rr.request_number, rr.role_needed, p.name AS project_name
     FROM resource_requests rr
     LEFT JOIN projects p ON p.id = rr.project_id
     WHERE rr.id = $1`,
    [id],
  )

  try {
    await query(`DELETE FROM resource_requests WHERE id = $1`, [id])
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  if (before) {
    logAudit({ action: 'Deleted', entity: 'Request', entityName: `#${before.request_number} — ${before.project_name ?? 'Unknown'}`, entityId: id, userName: user.name ?? 'System', field: 'request', oldValue: before.role_needed ?? '' })
  }

  return NextResponse.json({ deleted: true })
})
