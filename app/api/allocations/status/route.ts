import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { logAudit } from '@/lib/server/audit'
import { notifyAllocationAction, resolveEmployeeIdByEmail } from '@/lib/server/notify'

const EDITOR_ROLES = new Set(['admin', 'rm'])

function isIsoMonday(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  const dt = new Date(d + 'T00:00:00'); return !Number.isNaN(dt.getTime()) && dt.getDay() === 1
}

function pluralWeeks(n: number): string { return `${n} week${n === 1 ? '' : 's'}` }

export const POST = withAuth(async (request: NextRequest, user) => {
  if (!EDITOR_ROLES.has(user.role)) return NextResponse.json({ error: 'Forbidden — editor role required' }, { status: 403 })

  const body = await request.json()
  const status = String(body.status ?? '')
  if (status !== 'proposed' && status !== 'confirmed') {
    return NextResponse.json({ error: 'status must be proposed or confirmed' }, { status: 400 })
  }

  // Single-row by ID path
  if (body.id && !body.applyToAllWeeks) {
    const before = await queryOne<Record<string, unknown>>('SELECT * FROM forecast_allocations WHERE id = $1', [body.id])
    if (!before) return NextResponse.json({ error: 'allocation not found' }, { status: 404 })
    let updated: Record<string, unknown> | null
    try {
      updated = await queryOne<Record<string, unknown>>(
        'UPDATE forecast_allocations SET allocation_status = $1, updated_at = $2 WHERE id = $3 RETURNING *',
        [status, new Date().toISOString(), body.id]
      )
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }

    const empData = await queryOne<{ name: string | null; employee_id: string }>('SELECT name, employee_id FROM employees WHERE id = $1', [before.employee_id])
    const empName = empData?.name ?? null
    let projDisplay: string | null = null
    if (before.project_id) {
      const projData = await queryOne<{ name: string }>('SELECT name FROM projects WHERE id = $1', [before.project_id])
      projDisplay = projData?.name ?? null
    }
    projDisplay = projDisplay ?? (before.allocation_status as string)

    await logAudit({ userName: user.name, action: 'Updated', entity: 'Allocation', entityId: body.id, entityName: `${empName ?? '(unknown)'} → ${projDisplay}`, field: 'allocation_status', oldValue: before.allocation_status as string, newValue: status, metadata: { employee: empName, employeeId: before.employee_id, project: projDisplay, projectId: before.project_id, weekStart: before.week_start } })

    const actorEmpIdSt = await resolveEmployeeIdByEmail(user.email)
    await notifyAllocationAction({ action: 'status_changed', employeeName: empName, projectName: projDisplay, change: `status changed from ${before.allocation_status} to ${status} (week of ${before.week_start})`, resourceEmployeeId: before.employee_id as string, actorEmployeeId: actorEmpIdSt, actorName: user.name, relatedEntityId: body.id })
    return NextResponse.json({ allocation: updated, updated: 1 })
  }

  // Natural-key path: empCode + projectName + weekStart
  const empRow = await queryOne<{ id: string }>('SELECT id FROM employees WHERE employee_id = $1', [body.empCode])
  const employeeId = empRow?.id ?? null
  if (!employeeId) return NextResponse.json({ error: 'employee not found' }, { status: 404 })
  if (!body.projectName) return NextResponse.json({ error: 'projectName required' }, { status: 400 })
  const projRow = await queryOne<{ id: string }>('SELECT id FROM projects WHERE name ILIKE $1', [body.projectName.trim()])
  const projectId = projRow?.id ?? null
  if (!projectId) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  if (!body.weekStart || !isIsoMonday(body.weekStart)) {
    return NextResponse.json({ error: 'weekStart (ISO Monday) is required for the natural-key path' }, { status: 400 })
  }

  let matches: Record<string, unknown>[]
  try {
    if (body.applyToAllWeeks) {
      matches = await query<Record<string, unknown>>(
        'SELECT * FROM forecast_allocations WHERE employee_id = $1 AND project_id = $2 AND week_start >= $3',
        [employeeId, projectId, body.weekStart]
      )
    } else {
      matches = await query<Record<string, unknown>>(
        'SELECT * FROM forecast_allocations WHERE employee_id = $1 AND project_id = $2 AND week_start = $3',
        [employeeId, projectId, body.weekStart]
      )
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
  if (matches.length === 0) return NextResponse.json({ updated: 0, allocations: [] })

  const ids = matches.map(r => r.id as string)
  const prevStatuses = matches.map(r => r.allocation_status as string)
  let updated: Record<string, unknown>[]
  try {
    updated = await query<Record<string, unknown>>(
      'UPDATE forecast_allocations SET allocation_status = $1, updated_at = $2 WHERE id = ANY($3) RETURNING *',
      [status, new Date().toISOString(), ids]
    )
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const empData = await queryOne<{ name: string | null; employee_id: string }>('SELECT name, employee_id FROM employees WHERE id = $1', [employeeId])
  const empName = empData?.name ?? null
  const projDisplay = body.projectName

  await Promise.all(ids.map((id: string, i: number) => logAudit({ userName: user.name, action: 'Updated', entity: 'Allocation', entityId: id, entityName: `${empName ?? '(unknown)'} → ${projDisplay}`, field: 'allocation_status', oldValue: prevStatuses[i] ?? undefined, newValue: status, metadata: { employee: empName, employeeId, project: projDisplay, projectId, weekStart: (matches[i] as any).week_start, applyToAllWeeks: !!body.applyToAllWeeks } })))

  const actorEmpIdSt2 = await resolveEmployeeIdByEmail(user.email)
  const weekRange = ids.length === 1 ? `week of ${matches[0].week_start}` : `${pluralWeeks(ids.length)} from ${body.weekStart}`
  await notifyAllocationAction({ action: 'status_changed', employeeName: empName, projectName: projDisplay, change: `status → ${status} (${weekRange})`, resourceEmployeeId: employeeId, actorEmployeeId: actorEmpIdSt2, actorName: user.name, relatedEntityId: employeeId })

  return NextResponse.json({ allocations: updated, updated: ids.length })
})
