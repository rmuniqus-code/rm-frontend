import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { logAudit } from '@/lib/server/audit'
import { notifyAllocationAction, resolveEmployeeIdByEmail } from '@/lib/server/notify'

const EDITOR_ROLES = new Set(['admin', 'rm'])

function safeISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isIsoMonday(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  const dt = new Date(d + 'T00:00:00'); return !Number.isNaN(dt.getTime()) && dt.getDay() === 1
}

function addWeeks(iso: string, n: number): string {
  const dt = new Date(iso + 'T00:00:00'); dt.setDate(dt.getDate() + 7 * n); return safeISODate(dt)
}

function pluralWeeks(n: number): string { return `${n} week${n === 1 ? '' : 's'}` }

export const POST = withAuth(async (request: NextRequest, user) => {
  if (!EDITOR_ROLES.has(user.role)) return NextResponse.json({ error: 'Forbidden — editor role required' }, { status: 403 })

  const body = await request.json()
  if (!body.fromWeekStart || !isIsoMonday(body.fromWeekStart)) {
    return NextResponse.json({ error: 'fromWeekStart must be an ISO Monday' }, { status: 400 })
  }

  const empRow = await queryOne<{ id: string }>('SELECT id FROM employees WHERE employee_id = $1', [body.empCode])
  const employeeId = empRow?.id ?? null
  if (!employeeId) return NextResponse.json({ error: 'employee not found' }, { status: 404 })

  let projectId: string | null = null
  if (body.projectName) {
    const projRow = await queryOne<{ id: string }>('SELECT id FROM projects WHERE name ILIKE $1', [body.projectName.trim()])
    projectId = projRow?.id ?? null
  }

  let source: Record<string, unknown> | null
  if (projectId) {
    source = await queryOne<Record<string, unknown>>(
      'SELECT * FROM forecast_allocations WHERE employee_id = $1 AND week_start = $2 AND project_id = $3',
      [employeeId, body.fromWeekStart, projectId]
    )
  } else {
    source = await queryOne<Record<string, unknown>>(
      'SELECT * FROM forecast_allocations WHERE employee_id = $1 AND week_start = $2 AND project_id IS NULL',
      [employeeId, body.fromWeekStart]
    )
  }
  if (!source) return NextResponse.json({ error: 'source allocation not found' }, { status: 404 })

  let weeks: string[] = []
  if (typeof body.byWeeks === 'number' && body.byWeeks > 0) {
    for (let i = 1; i <= body.byWeeks; i++) weeks.push(addWeeks(body.fromWeekStart, i))
  } else if (body.throughWeekStart && isIsoMonday(body.throughWeekStart)) {
    let next = addWeeks(body.fromWeekStart, 1)
    while (next <= body.throughWeekStart) { weeks.push(next); next = addWeeks(next, 1) }
  } else {
    return NextResponse.json({ error: 'pass byWeeks (>0) or throughWeekStart' }, { status: 400 })
  }
  if (weeks.length === 0) return NextResponse.json({ allocations: [] })

  const pct = body.allocationPct !== undefined ? Number(body.allocationPct) : Number(source.allocation_pct)
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return NextResponse.json({ error: 'allocationPct must be 0–100' }, { status: 400 })

  // Delete existing rows in the target weeks
  if (projectId) {
    await query(
      'DELETE FROM forecast_allocations WHERE employee_id = $1 AND week_start = ANY($2) AND project_id = $3',
      [employeeId, weeks, projectId]
    )
  } else {
    await query(
      'DELETE FROM forecast_allocations WHERE employee_id = $1 AND week_start = ANY($2) AND project_id IS NULL',
      [employeeId, weeks]
    )
  }

  const inserted: unknown[] = []
  try {
    for (const w of weeks) {
      const newRow = await queryOne<Record<string, unknown>>(
        'INSERT INTO forecast_allocations (employee_id, project_id, week_start, allocation_pct, allocation_status, raw_text) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [employeeId, projectId, w, pct, source.allocation_status, source.raw_text]
      )
      if (newRow) inserted.push(newRow)
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const empData = await queryOne<{ name: string | null; employee_id: string }>('SELECT name, employee_id FROM employees WHERE id = $1', [employeeId])
  const empName = empData?.name ?? empData?.employee_id ?? null
  let projDisplay: string | null = body.projectName ?? null
  if (!projDisplay && projectId) {
    const projData = await queryOne<{ name: string }>('SELECT name FROM projects WHERE id = $1', [projectId])
    projDisplay = projData?.name ?? null
  }
  if (!projDisplay) projDisplay = source.allocation_status as string

  const extendDesc = `extended +${pluralWeeks(weeks.length)} at ${pct}% ${source.allocation_status} (through ${weeks[weeks.length - 1]})`
  await logAudit({ userName: user.name, action: 'Updated', entity: 'Allocation', entityName: `${empName ?? '(unknown)'} → ${projDisplay ?? '(no project)'}`, entityId: employeeId, field: 'allocation', newValue: extendDesc, metadata: { employee: empName, employeeId, project: projDisplay, projectId, extendedFrom: body.fromWeekStart, addedWeeks: weeks, allocationPct: pct, allocationStatus: source.allocation_status } })

  const actorEmpIdExt = await resolveEmployeeIdByEmail(user.email)
  await notifyAllocationAction({ action: 'extended', employeeName: empName, projectName: projDisplay, change: extendDesc, resourceEmployeeId: employeeId, actorEmployeeId: actorEmpIdExt, actorName: user.name, relatedEntityId: employeeId })

  return NextResponse.json({ allocations: inserted })
})
