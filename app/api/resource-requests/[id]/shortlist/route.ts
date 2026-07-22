import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { logAudit } from '@/lib/server/audit'

export const POST = withAuth(async (request: NextRequest, user, ctx: any) => {
  const { id } = await ctx.params
  const body = await request.json()

  const before = await queryOne<any>(
    `SELECT rr.*, p.name AS project_name
     FROM resource_requests rr
     LEFT JOIN projects p ON p.id = rr.project_id
     WHERE rr.id = $1`,
    [id],
  )
  if (!before) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  if (!['pending', 'shortlisted'].includes(before.approval_status ?? '')) {
    return NextResponse.json({ error: `Cannot shortlist — request is already in '${before.approval_status}' status.` }, { status: 400 })
  }

  const resources: Array<any> = body.resources ?? []
  if (resources.length === 0) return NextResponse.json({ error: 'At least one shortlisted resource is required' }, { status: 400 })

  try {
    await query(`DELETE FROM request_shortlisted_resources WHERE request_id = $1`, [id])

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const resolvedResources = await Promise.all(resources.map(async r => {
      let empId = r.employee_id ?? null
      if (empId && !UUID_RE.test(empId)) {
        const found = await queryOne<{ id: string }>(
          `SELECT id FROM employees WHERE employee_id = $1`,
          [empId],
        )
        empId = found?.id ?? null
      }
      return { ...r, employee_id: empId }
    }))

    const rows = resolvedResources.map(r => ({
      request_id: id, employee_id: r.employee_id ?? null, employee_name: r.employee_name,
      grade: r.grade ?? null, service_line: r.service_line ?? null,
      sub_service_line: r.sub_service_line ?? null, location: r.location ?? null,
      utilization_pct: r.utilization_pct ?? null, fit_score: r.fit_score ?? null,
      shortlisted_by: user.name ?? 'RM', notes: r.notes ?? null, status: 'shortlisted',
    }))

    if (rows.length > 0) {
      const COLS = 12
      const placeholders = rows.map((_, i) => {
        const base = i * COLS + 1
        return `(${Array.from({ length: COLS }, (_, j) => `$${base + j}`).join(', ')})`
      }).join(', ')
      const insertParams = rows.flatMap(r => [
        r.request_id, r.employee_id, r.employee_name, r.grade,
        r.service_line, r.sub_service_line, r.location,
        r.utilization_pct, r.fit_score, r.shortlisted_by, r.notes, r.status,
      ])
      await query(
        `INSERT INTO request_shortlisted_resources
           (request_id, employee_id, employee_name, grade, service_line, sub_service_line,
            location, utilization_pct, fit_score, shortlisted_by, notes, status)
         VALUES ${placeholders}`,
        insertParams,
      )
    }

    const updated = await queryOne<any>(
      `UPDATE resource_requests
       SET approval_status = 'shortlisted', lifecycle_status = 'under_review', updated_at = $1
       WHERE id = $2
       RETURNING *`,
      [new Date().toISOString(), id],
    )
    if (!updated) return NextResponse.json({ error: 'Update failed' }, { status: 500 })

    const projectName = before.project_name ?? 'Unknown Project'
    logAudit({ action: 'Updated', entity: 'Request', entityName: `#${before.request_number} — ${projectName}`, entityId: id, userName: user.name ?? 'System', field: 'approval_status', oldValue: before.approval_status ?? 'pending', newValue: 'shortlisted', metadata: { shortlisted_count: resources.length, resources: resources.map(r => r.employee_name) } })

    return NextResponse.json({ request: updated, shortlisted: rows.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})
