import { NextRequest, NextResponse } from 'next/server'
import { queryOne } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { logAuditDiff } from '@/lib/server/audit'
import { notifyAllocationAction, resolveEmployeeIdByEmail } from '@/lib/server/notify'

const EDITOR_ROLES = new Set(['admin', 'rm'])
const VALID_STATUSES = new Set(['confirmed', 'proposed', 'available', 'leave', 'jip', 'maternity', 'unconfirmed', 'leaver'])

function isIsoMonday(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  const dt = new Date(d + 'T00:00:00')
  return !Number.isNaN(dt.getTime()) && dt.getDay() === 1
}

async function resolveEmployeeId(empCode?: string): Promise<string | null> {
  if (!empCode) return null
  const row = await queryOne<{ id: string }>('SELECT id FROM employees WHERE employee_id = $1', [empCode])
  return row?.id ?? null
}

async function resolveProjectId(name?: string | null): Promise<string | null> {
  if (!name) return null
  const row = await queryOne<{ id: string }>('SELECT id FROM projects WHERE name ILIKE $1', [name.trim()])
  return row?.id ?? null
}

async function findAllocation(opts: { id?: string; employeeId?: string; projectId?: string | null; weekStart?: string }): Promise<Record<string, unknown> | null> {
  if (opts.id) {
    return queryOne<Record<string, unknown>>('SELECT * FROM forecast_allocations WHERE id = $1', [opts.id])
  }
  if (!opts.employeeId || !opts.weekStart) return null
  if (opts.projectId) {
    return queryOne<Record<string, unknown>>(
      'SELECT * FROM forecast_allocations WHERE employee_id = $1 AND week_start = $2 AND project_id = $3',
      [opts.employeeId, opts.weekStart, opts.projectId]
    )
  }
  return queryOne<Record<string, unknown>>(
    'SELECT * FROM forecast_allocations WHERE employee_id = $1 AND week_start = $2 AND project_id IS NULL',
    [opts.employeeId, opts.weekStart]
  )
}

async function fetchEmployeeName(employeeId: string): Promise<string | null> {
  const row = await queryOne<{ name: string | null; employee_id: string }>('SELECT name, employee_id FROM employees WHERE id = $1', [employeeId])
  return row?.name ?? row?.employee_id ?? null
}

async function fetchProjectName(projectId: string | null): Promise<string | null> {
  if (!projectId) return null
  const row = await queryOne<{ name: string }>('SELECT name FROM projects WHERE id = $1', [projectId])
  return row?.name ?? null
}

export const POST = withAuth(async (request: NextRequest, user) => {
  if (!EDITOR_ROLES.has(user.role)) return NextResponse.json({ error: 'Forbidden — editor role required' }, { status: 403 })

  const body = await request.json()
  const patch = (body.patch ?? {}) as Record<string, unknown>
  if (!patch || Object.keys(patch).length === 0) return NextResponse.json({ error: 'patch object is required' }, { status: 400 })

  const employeeId = body.id ? undefined : await resolveEmployeeId(body.empCode)
  const projectIdLookup = body.projectName !== undefined ? await resolveProjectId(body.projectName) : undefined

  if (body.projectName !== undefined && body.projectName !== null && projectIdLookup === null) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }

  const before = await findAllocation({ id: body.id, employeeId: employeeId ?? undefined, projectId: projectIdLookup ?? null, weekStart: body.weekStart })
  if (!before) return NextResponse.json({ error: 'allocation not found' }, { status: 404 })

  // Build dynamic SET clause from validated patch fields
  const setClauses: string[] = []
  const params: unknown[] = []
  let paramIdx = 1

  if (patch.allocationPct !== undefined) {
    const n = Number(patch.allocationPct)
    if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'allocationPct must be 0 or greater' }, { status: 400 })
    setClauses.push(`allocation_pct = $${paramIdx++}`); params.push(n)
  }
  if (patch.allocationStatus !== undefined) {
    const s = String(patch.allocationStatus)
    if (!VALID_STATUSES.has(s)) return NextResponse.json({ error: `invalid allocationStatus: ${s}` }, { status: 400 })
    setClauses.push(`allocation_status = $${paramIdx++}`); params.push(s)
  }
  if (patch.weekStart !== undefined) {
    const w = String(patch.weekStart)
    if (!isIsoMonday(w)) return NextResponse.json({ error: 'patch.weekStart must be an ISO Monday' }, { status: 400 })
    setClauses.push(`week_start = $${paramIdx++}`); params.push(w)
  }
  if (patch.projectName !== undefined) {
    const newProjectId = await resolveProjectId(patch.projectName as string | null)
    if (patch.projectName && !newProjectId) return NextResponse.json({ error: 'project not found' }, { status: 404 })
    setClauses.push(`project_id = $${paramIdx++}`); params.push(newProjectId)
  } else if (patch.projectId !== undefined) {
    setClauses.push(`project_id = $${paramIdx++}`); params.push(patch.projectId)
  }
  if (patch.rawText !== undefined) {
    setClauses.push(`raw_text = $${paramIdx++}`); params.push(patch.rawText)
  }

  if (setClauses.length === 0) return NextResponse.json({ error: 'no editable fields in patch' }, { status: 400 })

  setClauses.push(`updated_at = $${paramIdx++}`)
  params.push(new Date().toISOString())
  params.push(before.id)

  let updated: Record<string, unknown> | null
  try {
    updated = await queryOne<Record<string, unknown>>(
      `UPDATE forecast_allocations SET ${setClauses.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      params
    )
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const empName = await fetchEmployeeName(before.employee_id as string)
  const projDisplay = body.projectName ?? (await fetchProjectName(before.project_id as string | null)) ?? (before.allocation_status as string)
  await logAuditDiff({ userName: user.name, action: 'Updated', entity: 'Allocation', entityId: before.id as string, entityName: `${empName ?? '(unknown)'} → ${projDisplay ?? '(no project)'}`, metadata: { employee: empName, employeeId: before.employee_id, project: projDisplay, projectId: before.project_id, weekStart: before.week_start } }, before as Record<string, unknown>, updated as Record<string, unknown>, ['allocation_pct', 'allocation_status', 'project_id', 'week_start', 'raw_text'])

  const changes: string[] = []
  if (patch.allocationPct !== undefined) changes.push(`load → ${patch.allocationPct}%`)
  if (patch.allocationStatus !== undefined) changes.push(`status → ${patch.allocationStatus}`)
  if (patch.weekStart !== undefined) changes.push(`week → ${patch.weekStart}`)
  const updateDesc = changes.length > 0 ? changes.join(', ') : 'updated'

  const actorEmployeeId = await resolveEmployeeIdByEmail(user.email)
  await notifyAllocationAction({ action: 'updated', employeeName: empName, projectName: projDisplay, change: `${updateDesc} (week of ${before.week_start})`, resourceEmployeeId: before.employee_id as string, actorEmployeeId, actorName: user.name, relatedEntityId: before.id as string })

  return NextResponse.json({ allocation: updated })
})
