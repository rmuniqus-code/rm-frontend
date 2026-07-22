import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { logAudit } from '@/lib/server/audit'

export const POST = withAuth(async (request: NextRequest, user, ctx: any) => {
  const { id } = await ctx.params
  const body = await request.json()

  if (!body.shortlisted_resource_id) {
    return NextResponse.json({ error: 'shortlisted_resource_id is required' }, { status: 400 })
  }

  const shortlisted = await queryOne<any>(
    `SELECT * FROM request_shortlisted_resources WHERE id = $1 AND request_id = $2`,
    [body.shortlisted_resource_id, id],
  )
  if (!shortlisted) return NextResponse.json({ error: 'Shortlisted resource not found for this request' }, { status: 404 })

  const req = await queryOne<any>(
    `SELECT rr.*, p.name AS project_name
     FROM resource_requests rr
     LEFT JOIN projects p ON p.id = rr.project_id
     WHERE rr.id = $1`,
    [id],
  )
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  try {
    await query(
      `UPDATE request_shortlisted_resources SET status = 'em_selected' WHERE id = $1`,
      [body.shortlisted_resource_id],
    )

    const updated = await queryOne<any>(
      `UPDATE resource_requests SET
        approval_status = 'em_approved',
        em_approved_resource_id = $1,
        resource_requested = $2,
        em_approved_at = $3,
        em_approval_notes = $4,
        updated_at = $5
       WHERE id = $6
       RETURNING *`,
      [
        shortlisted.employee_id ?? null,
        shortlisted.employee_name,
        new Date().toISOString(),
        body.notes ?? null,
        new Date().toISOString(),
        id,
      ],
    )
    if (!updated) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

    const projectName = req.project_name ?? 'Unknown Project'
    logAudit({ action: 'Updated', entity: 'Request', entityName: `#${req.request_number} — ${projectName}`, entityId: id, userName: user.name ?? 'System', field: 'approval_status', oldValue: 'shortlisted', newValue: 'em_approved', metadata: { selected_resource: shortlisted.employee_name, em_notes: body.notes ?? null } })

    return NextResponse.json({ request: updated, selectedResource: shortlisted })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})
