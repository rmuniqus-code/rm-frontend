import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { logAudit } from '@/lib/server/audit'
import { notifyAllocationAction, resolveEmployeeIdByEmail } from '@/lib/server/notify'

const EDITOR_ROLES = new Set(['admin', 'rm'])
const VALID_STATUSES = new Set(['confirmed', 'proposed', 'available', 'leave', 'jip', 'maternity', 'unconfirmed', 'leaver'])
const SL_PREFIX_MAP: Record<string, string> = { ARC: 'ARC', ADVISORY: 'ADV', CONSULTING: 'CON', TAX: 'TAX', TECHNOLOGY: 'TCH', GRC: 'GRC', SCC: 'SCC', AUDIT: 'ARC', FORENSICS: 'FOR', RISK: 'RSK' }

function safeISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isIsoMonday(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false
  const dt = new Date(d + 'T00:00:00')
  return !Number.isNaN(dt.getTime()) && dt.getDay() === 1
}

function addWeeks(iso: string, n: number): string {
  const dt = new Date(iso + 'T00:00:00'); dt.setDate(dt.getDate() + 7 * n); return safeISODate(dt)
}

function pluralWeeks(n: number): string { return `${n} week${n === 1 ? '' : 's'}` }

async function resolveEmployeeId(id?: string, empCode?: string): Promise<string | null> {
  if (id) return id
  if (!empCode) return null
  const row = await queryOne<{ id: string }>('SELECT id FROM employees WHERE employee_id = $1', [empCode])
  return row?.id ?? null
}

async function resolveProjectId(id?: string | null, name?: string | null): Promise<string | null> {
  if (id) return id
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

function allocationLabel(empName: string | null, projectOrStatus: string | null | undefined): string {
  return `${empName ?? '(unknown)'} → ${projectOrStatus ?? '(no project)'}`
}

function serviceLinePrefix(hint: string): string {
  const h = (hint ?? '').trim().toUpperCase()
  for (const [key, code] of Object.entries(SL_PREFIX_MAP)) { if (h.startsWith(key) || h.includes(key)) return code }
  const clean = h.replace(/[^A-Z]/g, '')
  return (clean.slice(0, 3) || 'GEN').padEnd(3, 'X')
}

async function generateProjectCode(serviceLineHint: string): Promise<string> {
  const year = new Date().getFullYear()
  const prefix = serviceLinePrefix(serviceLineHint)
  const rows = await query<{ code: string | null }>('SELECT code FROM projects WHERE code LIKE $1', [`%-${year}-%`])
  const maxSeq = rows.reduce((max: number, p: { code: string | null }) => {
    const parts = (p.code ?? '').split('-'); const seq = parts.length >= 3 ? (parseInt(parts[parts.length - 1]) || 0) : 0; return Math.max(max, seq)
  }, 0)
  return `${prefix}-${year}-${String(maxSeq + 1).padStart(3, '0')}`
}

export const POST = withAuth(async (request: NextRequest, user) => {
  if (!EDITOR_ROLES.has(user.role)) return NextResponse.json({ error: 'Forbidden — editor role required' }, { status: 403 })

  const body = await request.json()
  const weekStarts: string[] = Array.isArray(body.weekStarts) ? body.weekStarts : []
  if (weekStarts.length === 0 || !weekStarts.every(isIsoMonday)) {
    return NextResponse.json({ error: 'weekStarts must be a non-empty array of ISO Monday dates' }, { status: 400 })
  }

  const status = (body.allocationStatus ?? 'confirmed') as string
  if (!VALID_STATUSES.has(status)) return NextResponse.json({ error: `invalid allocationStatus: ${status}` }, { status: 400 })

  const pct = Number(body.allocationPct ?? 100)
  if (!Number.isFinite(pct) || pct < 0) return NextResponse.json({ error: 'allocationPct must be 0 or greater' }, { status: 400 })

  const employeeId = await resolveEmployeeId(body.employeeId, body.empCode)
  if (!employeeId) return NextResponse.json({ error: 'employee not found' }, { status: 404 })

  let projectId = await resolveProjectId(body.projectId ?? null, body.projectName ?? null)
  if ((body.projectName || body.projectId) && !projectId) {
    if (body.autoCreateProject && body.projectName) {
      const code = await generateProjectCode(body.serviceLineHint ?? '')
      try {
        const newProj = await queryOne<{ id: string }>(
          'INSERT INTO projects (name, code, status, sub_team) VALUES ($1, $2, $3, $4) RETURNING id',
          [body.projectName.trim(), code, 'active', body.serviceLineHint ?? null]
        )
        if (!newProj) return NextResponse.json({ error: 'failed to create project' }, { status: 500 })
        projectId = newProj.id
      } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 })
      }
    } else {
      return NextResponse.json({ error: 'project not found' }, { status: 404 })
    }
  }

  // Explicit days_mask: caller passes this per-week when extending to a partial week.
  // Accepts 1–30 (bit 0=Mon … bit 4=Fri). 0 / 31 / absent → full week (no mask stored).
  const explicitMask: number | null =
    typeof body.daysMask === 'number' && body.daysMask > 0 && body.daysMask < 31
      ? body.daysMask
      : null

  // Fallback: throughDate sets a mask on only the last week row (legacy path).
  let lastWeekMask: number | null = null
  if (explicitMask === null) {
    const throughDate: string | undefined = body.throughDate
    if (throughDate && /^\d{4}-\d{2}-\d{2}$/.test(throughDate)) {
      const dow = new Date(throughDate + 'T00:00:00').getDay()
      if (dow >= 1 && dow <= 5) {
        const mask = (1 << dow) - 1
        if (mask < 31) lastWeekMask = mask
      }
    }
  }

  const sortedWeekStarts = [...weekStarts].sort()
  const lastWeek = sortedWeekStarts[sortedWeekStarts.length - 1]

  // When extending with an explicit partial-week mask, merge (OR) into any existing
  // row for that week rather than deleting it. This preserves Mon-Wed when extending
  // Thu-Fri within the same week.
  if (explicitMask !== null) {
    const upserted: unknown[] = []
    for (const w of weekStarts) {
      let existingRow: { id: string; days_mask: number | null } | null
      if (projectId) {
        existingRow = await queryOne<{ id: string; days_mask: number | null }>(
          'SELECT id, days_mask FROM forecast_allocations WHERE employee_id = $1 AND week_start = $2 AND project_id = $3',
          [employeeId, w, projectId]
        )
      } else {
        existingRow = await queryOne<{ id: string; days_mask: number | null }>(
          'SELECT id, days_mask FROM forecast_allocations WHERE employee_id = $1 AND week_start = $2 AND project_id IS NULL',
          [employeeId, w]
        )
      }

      if (existingRow) {
        const currentMask = existingRow.days_mask ?? 31
        const mergedMask = currentMask | explicitMask
        const updated = await queryOne<Record<string, unknown>>(
          'UPDATE forecast_allocations SET days_mask = $1, allocation_pct = $2, allocation_status = $3 WHERE id = $4 RETURNING *',
          [mergedMask, pct, status, existingRow.id]
        )
        if (updated) upserted.push(updated)
      } else {
        const newRow = await queryOne<Record<string, unknown>>(
          'INSERT INTO forecast_allocations (employee_id, project_id, week_start, allocation_pct, allocation_status, raw_text, days_mask) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
          [employeeId, projectId, w, pct, status, body.rawText ?? null, explicitMask]
        )
        if (newRow) upserted.push(newRow)
      }
    }
    const empName = await fetchEmployeeName(employeeId)
    const projDisplay = body.projectName ?? (projectId ? await fetchProjectName(projectId) : null) ?? status
    await logAudit({ userName: user.name, action: 'Created', entity: 'Allocation', entityName: allocationLabel(empName, projDisplay), entityId: employeeId, field: 'allocation', newValue: `partial week(s) at ${pct}% ${status}`, metadata: { employee: empName, employeeId, project: projDisplay, projectId, weekStarts: sortedWeekStarts, allocationPct: pct, allocationStatus: status } })
    return NextResponse.json({ allocations: upserted })
  }

  // Bulk path: delete existing then insert
  try {
    if (projectId) {
      await query(
        'DELETE FROM forecast_allocations WHERE employee_id = $1 AND week_start = ANY($2) AND project_id = $3',
        [employeeId, weekStarts, projectId]
      )
    } else {
      await query(
        'DELETE FROM forecast_allocations WHERE employee_id = $1 AND week_start = ANY($2) AND project_id IS NULL',
        [employeeId, weekStarts]
      )
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const inserted: unknown[] = []
  try {
    for (const w of weekStarts) {
      const maskForRow = w === lastWeek && lastWeekMask !== null ? lastWeekMask : null
      const newRow = await queryOne<Record<string, unknown>>(
        'INSERT INTO forecast_allocations (employee_id, project_id, week_start, allocation_pct, allocation_status, raw_text, days_mask) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [employeeId, projectId, w, pct, status, body.rawText ?? null, maskForRow]
      )
      if (newRow) inserted.push(newRow)
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }

  const empName = await fetchEmployeeName(employeeId)
  const projDisplay = body.projectName ?? (projectId ? await fetchProjectName(projectId) : null) ?? status
  const changeDesc = `${pluralWeeks(weekStarts.length)} at ${pct}% ${status} (${sortedWeekStarts[0]}${weekStarts.length > 1 ? ` – ${sortedWeekStarts[sortedWeekStarts.length - 1]}` : ''})`

  await logAudit({ userName: user.name, action: 'Created', entity: 'Allocation', entityName: allocationLabel(empName, projDisplay), entityId: employeeId, field: 'allocation', newValue: changeDesc, metadata: { employee: empName, employeeId, project: projDisplay, projectId, weekStarts: sortedWeekStarts, allocationPct: pct, allocationStatus: status, rowsCreated: inserted.length } })

  const actorEmployeeId = await resolveEmployeeIdByEmail(user.email)
  await notifyAllocationAction({ action: 'created', employeeName: empName, projectName: projDisplay, change: `assigned for ${changeDesc}`, resourceEmployeeId: employeeId, actorEmployeeId, actorName: user.name, relatedEntityId: employeeId })

  return NextResponse.json({ allocations: inserted })
})
