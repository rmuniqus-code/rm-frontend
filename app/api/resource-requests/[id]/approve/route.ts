import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { logAudit } from '@/lib/server/audit'
import { notifyAllocationConfirmed, resolveEmployeeIdByEmail } from '@/lib/server/notify'

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

  const req = await queryOne<any>(
    `SELECT rr.*,
      json_build_object(
        'name', p.name, 'code', p.code,
        'project_description', p.project_description,
        'engagement_manager', p.engagement_manager,
        'engagement_partner', p.engagement_partner
      ) AS project
     FROM resource_requests rr
     LEFT JOIN projects p ON p.id = rr.project_id
     WHERE rr.id = $1`,
    [id],
  )
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const projectName = req.project?.name ?? 'Unknown Project'

  if (decision === 'rejected') {
    try {
      await query(
        `UPDATE resource_requests SET approval_status = 'rejected', lifecycle_status = 'rejected', notes = $1, updated_at = $2 WHERE id = $3`,
        [body.notes ?? null, new Date().toISOString(), id],
      )
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
    logAudit({ action: 'Rejected', entity: 'Request', entityName: `#${req.request_number} — ${projectName}`, entityId: id, userName: user.name ?? 'System', field: 'approval_status', oldValue: req.approval_status ?? 'pending', newValue: 'rejected' })
    return NextResponse.json({ request: { ...req, approval_status: 'rejected', lifecycle_status: 'rejected' }, allocationsCreated: 0 })
  }

  if (decision === 'approved' && req.approval_status !== 'em_approved') {
    return NextResponse.json({ error: `Cannot approve — request must be in 'em_approved' status (currently '${req.approval_status}').` }, { status: 400 })
  }

  const allocatedName = body.allocated_employee ? String(body.allocated_employee).trim() : req.resource_requested ? String(req.resource_requested).trim() : null
  if (!allocatedName) return NextResponse.json({ error: 'Approval requires an allocated employee.' }, { status: 400 })

  let empRow: { id: string; skill_set: string | null } | null = null
  empRow = await queryOne<{ id: string; skill_set: string | null }>(
    `SELECT id, skill_set FROM employees WHERE employee_id = $1 LIMIT 1`,
    [allocatedName],
  )
  if (!empRow) {
    empRow = await queryOne<{ id: string; skill_set: string | null }>(
      `SELECT id, skill_set FROM employees WHERE LOWER(name) = LOWER($1) LIMIT 1`,
      [allocatedName],
    )
  }
  if (!empRow) return NextResponse.json({ error: `Employee "${allocatedName}" not found.` }, { status: 400 })
  if (!req.start_date || !req.end_date) return NextResponse.json({ error: 'Request must have start_date and end_date.' }, { status: 400 })

  const weeks = weekStartsBetween(req.start_date, req.end_date)
  if (weeks.length === 0) return NextResponse.json({ error: 'No valid weeks found.' }, { status: 400 })

  const bodyHpd = (typeof body.hours_per_day === 'number' && body.hours_per_day > 0) ? body.hours_per_day : null
  const reqLoadingPct = (req.loading_pct != null && Number(req.loading_pct) > 0) ? Math.min(200, Number(req.loading_pct)) : null
  const reqHpd = (req.hours_per_day && req.hours_per_day > 0) ? req.hours_per_day : null
  const pct = bodyHpd !== null ? Math.min(200, (bodyHpd / 8) * 100) : reqLoadingPct ?? (reqHpd !== null ? Math.min(200, (reqHpd / 8) * 100) : 100)

  try {
    // Delete existing allocations for the same employee/project/weeks
    await query(
      `DELETE FROM forecast_allocations WHERE employee_id = $1 AND project_id = $2 AND week_start = ANY($3::date[])`,
      [empRow.id, req.project_id, weeks],
    )

    // Bulk insert new allocations using unnest
    await query(
      `INSERT INTO forecast_allocations (employee_id, project_id, week_start, allocation_pct, allocation_status, raw_text, source_file)
       SELECT $1, $2, unnest($3::date[]), $4, 'confirmed', $5, 'resource_request_approval'`,
      [empRow.id, req.project_id, weeks, pct, `Approved request #${req.request_number}`],
    )
  } catch (err: any) {
    return NextResponse.json({ error: `Allocation creation failed: ${err.message}` }, { status: 500 })
  }

  const allocationsCreated = weeks.length

  const updateFields: string[] = [
    `approval_status = 'approved'`,
    `lifecycle_status = 'approved'`,
    `notes = $1`,
    `updated_at = $2`,
  ]
  const updateParams: unknown[] = [body.notes ?? null, new Date().toISOString()]
  let uIdx = 3

  if (body.approved_by) { updateFields.push(`approved_by = $${uIdx++}`); updateParams.push(body.approved_by) }
  if (body.allocated_employee) {
    updateFields.push(`resource_requested = $${uIdx++}`); updateParams.push(allocatedName)
    updateFields.push(`hours_per_day = $${uIdx++}`); updateParams.push((pct / 100) * 8)
  }
  updateParams.push(id)

  try {
    const updatedRequest = await queryOne<any>(
      `WITH upd AS (
        UPDATE resource_requests SET ${updateFields.join(', ')} WHERE id = $${uIdx} RETURNING *
      )
      SELECT upd.*,
        json_build_object(
          'name', p.name, 'code', p.code,
          'project_description', p.project_description,
          'engagement_manager', p.engagement_manager,
          'engagement_partner', p.engagement_partner
        ) AS project
      FROM upd
      LEFT JOIN projects p ON p.id = upd.project_id`,
      updateParams,
    )
    if (!updatedRequest) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

    logAudit({ action: 'Approved', entity: 'Request', entityName: `#${req.request_number} — ${projectName}`, entityId: id, userName: user.name ?? 'System', field: 'approval_status', oldValue: req.approval_status ?? 'pending', newValue: 'approved', metadata: { allocatedEmployee: allocatedName, allocationsCreated, hoursPerDay: (pct / 100) * 8 } })
    logAudit({ action: 'Created', entity: 'Allocation', entityName: `${allocatedName} → ${projectName}`, entityId: id, userName: user.name ?? 'System', field: 'allocation', newValue: `${allocationsCreated} weeks confirmed`, metadata: { employee: allocatedName, project: projectName, weeks: allocationsCreated, startDate: req.start_date, endDate: req.end_date } })

    const project = req.project ?? {}
    const emEpName = req.em_ep_name ?? (project.engagement_manager && project.engagement_partner ? `${project.engagement_manager} / ${project.engagement_partner}` : project.engagement_manager ?? project.engagement_partner ?? null)
    const actorEmployeeId = await resolveEmployeeIdByEmail(user.email)

    notifyAllocationConfirmed({ requestId: id, resourceEmployeeId: empRow.id, resourceName: allocatedName, roleSkill: empRow.skill_set ?? req.primary_skill ?? null, startDate: req.start_date, endDate: req.end_date, loadingPct: pct, projectName, projectCode: project.code ?? null, emEpName, projectDescription: project.project_description ?? null, actorEmployeeId })

    return NextResponse.json({ request: updatedRequest, allocationsCreated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})
