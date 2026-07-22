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
  const dt = new Date(d + 'T00:00:00')
  return !Number.isNaN(dt.getTime()) && dt.getDay() === 1
}

function toMondayISO(iso: string): string {
  const d = new Date(iso + 'T00:00:00'); const dow = d.getDay(); const diff = dow === 0 ? -6 : 1 - dow; d.setDate(d.getDate() + diff); return safeISODate(d)
}

function dayBit(iso: string): number {
  const dow = new Date(iso + 'T00:00:00').getDay(); if (dow < 1 || dow > 5) return 0; return 1 << (dow - 1)
}

function pluralWeeks(n: number): string { return `${n} week${n === 1 ? '' : 's'}` }

async function resolveEmployeeId(empCode?: string): Promise<string | null> {
  if (!empCode) return null
  const row = await queryOne<{ id: string }>('SELECT id FROM employees WHERE employee_id = $1', [empCode])
  return row?.id ?? null
}

async function resolveProjectId(name?: string | null): Promise<string | null | undefined> {
  if (name === undefined) return undefined
  if (!name) return null
  const row = await queryOne<{ id: string }>('SELECT id FROM projects WHERE name ILIKE $1', [name.trim()])
  return row?.id ?? null
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

  // By ID
  if (body.id) {
    const before = await queryOne<Record<string, unknown>>('SELECT * FROM forecast_allocations WHERE id = $1', [body.id])
    if (!before) return NextResponse.json({ error: 'allocation not found' }, { status: 404 })
    try {
      await query('DELETE FROM forecast_allocations WHERE id = $1', [body.id])
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
    const empName = await fetchEmployeeName(before.employee_id as string)
    const projDisplay = (await fetchProjectName(before.project_id as string | null)) ?? (before.allocation_status as string)
    await logAudit({ userName: user.name, action: 'Deleted', entity: 'Allocation', entityId: body.id, entityName: `${empName ?? '(unknown)'} → ${projDisplay ?? '(no project)'}`, field: 'allocation', oldValue: `${before.allocation_pct}% ${before.allocation_status} (week of ${before.week_start})`, newValue: 'deleted', metadata: { employee: empName, employeeId: before.employee_id, project: projDisplay, projectId: before.project_id, weekStart: before.week_start, allocationPct: before.allocation_pct, allocationStatus: before.allocation_status } })
    const actorEmpId = await resolveEmployeeIdByEmail(user.email)
    await notifyAllocationAction({ action: 'deleted', employeeName: empName, projectName: projDisplay, change: `removed from ${projDisplay} (week of ${before.week_start})`, resourceEmployeeId: before.employee_id as string, actorEmployeeId: actorEmpId, actorName: user.name, relatedEntityId: body.id })
    return NextResponse.json({ deleted: 1 })
  }

  const employeeId = await resolveEmployeeId(body.empCode)
  if (!employeeId) return NextResponse.json({ error: 'employee not found' }, { status: 404 })

  // Day-level delete
  if (Array.isArray(body.dates) && body.dates.length > 0) {
    const dates: string[] = body.dates
    const projectId = body.projectName !== undefined ? await resolveProjectId(body.projectName) : undefined

    const byWeek = new Map<string, number>()
    for (const d of dates) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
      const monday = toMondayISO(d); const bit = dayBit(d); if (!bit) continue
      byWeek.set(monday, (byWeek.get(monday) ?? 0) | bit)
    }

    if (byWeek.size === 0) return NextResponse.json({ deleted: 0 })

    let totalDeleted = 0
    const empName = await fetchEmployeeName(employeeId)
    const projDisplay = body.projectName ?? '(all projects)'

    for (const [monday, clearBits] of byWeek.entries()) {
      let rows: { id: string; days_mask: number | null }[]
      if (projectId !== undefined) {
        if (projectId) {
          rows = await query<{ id: string; days_mask: number | null }>(
            'SELECT id, days_mask FROM forecast_allocations WHERE employee_id = $1 AND week_start = $2 AND project_id = $3',
            [employeeId, monday, projectId]
          )
        } else {
          rows = await query<{ id: string; days_mask: number | null }>(
            'SELECT id, days_mask FROM forecast_allocations WHERE employee_id = $1 AND week_start = $2 AND project_id IS NULL',
            [employeeId, monday]
          )
        }
      } else {
        rows = await query<{ id: string; days_mask: number | null }>(
          'SELECT id, days_mask FROM forecast_allocations WHERE employee_id = $1 AND week_start = $2',
          [employeeId, monday]
        )
      }

      for (const row of rows) {
        const currentMask = row.days_mask ?? 31
        const newMask = currentMask & ~clearBits & 0x1f
        if (newMask === 0) {
          await query('DELETE FROM forecast_allocations WHERE id = $1', [row.id])
          totalDeleted++
        } else if (newMask !== currentMask) {
          await query('UPDATE forecast_allocations SET days_mask = $1 WHERE id = $2', [newMask, row.id])
          totalDeleted++
        }
      }
    }

    const sortedDates = [...dates].sort()
    await logAudit({ userName: user.name, action: 'Deleted', entity: 'Allocation', entityName: `${empName ?? '(unknown)'} → ${projDisplay}`, entityId: employeeId, field: 'allocation', newValue: `removed ${dates.length} day${dates.length !== 1 ? 's' : ''} (${sortedDates[0]}${dates.length > 1 ? ` – ${sortedDates.at(-1)}` : ''})`, metadata: { employee: empName, project: projDisplay, dates: sortedDates } })
    return NextResponse.json({ deleted: totalDeleted })
  }

  // Week-level delete
  const weekStarts: string[] = Array.isArray(body.weekStarts) ? body.weekStarts : []
  if (weekStarts.length === 0 || !weekStarts.every(isIsoMonday)) {
    return NextResponse.json({ error: 'weekStarts must be ISO Monday dates' }, { status: 400 })
  }
  const projectId = body.projectName !== undefined ? await resolveProjectId(body.projectName) : undefined

  let rowsToDelete: Record<string, unknown>[]
  try {
    if (projectId !== undefined) {
      if (projectId) {
        rowsToDelete = await query<Record<string, unknown>>(
          'SELECT * FROM forecast_allocations WHERE employee_id = $1 AND week_start = ANY($2) AND project_id = $3',
          [employeeId, weekStarts, projectId]
        )
      } else {
        rowsToDelete = await query<Record<string, unknown>>(
          'SELECT * FROM forecast_allocations WHERE employee_id = $1 AND week_start = ANY($2) AND project_id IS NULL',
          [employeeId, weekStarts]
        )
      }
    } else {
      rowsToDelete = await query<Record<string, unknown>>(
        'SELECT * FROM forecast_allocations WHERE employee_id = $1 AND week_start = ANY($2)',
        [employeeId, weekStarts]
      )
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  if (rowsToDelete.length === 0) return NextResponse.json({ deleted: 0 })

  const ids = rowsToDelete.map(r => r.id as string)
  try {
    await query('DELETE FROM forecast_allocations WHERE id = ANY($1)', [ids])
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const empName = await fetchEmployeeName(employeeId)
  const projDisplay = body.projectName ?? (typeof projectId === 'string' ? await fetchProjectName(projectId) : null) ?? '(multiple)'
  const sortedDel = [...weekStarts].sort()
  await logAudit({ userName: user.name, action: 'Deleted', entity: 'Allocation', entityName: `${empName ?? '(unknown)'} → ${projDisplay}`, entityId: employeeId, field: 'allocation', newValue: `deleted ${pluralWeeks(ids.length)} (${sortedDel[0]}${weekStarts.length > 1 ? ` – ${sortedDel[sortedDel.length - 1]}` : ''})`, metadata: { employee: empName, employeeId, project: projDisplay, projectId, weekStarts: sortedDel, rowsDeleted: ids.length, ids } })

  const actorEmpIdDel = await resolveEmployeeIdByEmail(user.email)
  await notifyAllocationAction({ action: 'deleted', employeeName: empName, projectName: projDisplay, change: `removed for ${pluralWeeks(ids.length)} (${sortedDel[0]}${weekStarts.length > 1 ? ` – ${sortedDel[sortedDel.length - 1]}` : ''})`, resourceEmployeeId: employeeId, actorEmployeeId: actorEmpIdDel, actorName: user.name, relatedEntityId: employeeId })

  return NextResponse.json({ deleted: ids.length })
})
