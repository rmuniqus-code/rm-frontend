import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
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
  const { data } = await supabaseAdmin().from('employees').select('id').eq('employee_id', empCode).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

async function resolveProjectId(id?: string | null, name?: string | null): Promise<string | null> {
  if (id) return id
  if (!name) return null
  const { data } = await supabaseAdmin().from('projects').select('id').ilike('name', name.trim()).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

async function fetchEmployeeName(employeeId: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from('employees').select('name, employee_id').eq('id', employeeId).maybeSingle()
  return (data?.name as string | undefined) ?? (data?.employee_id as string | undefined) ?? null
}

async function fetchProjectName(projectId: string | null): Promise<string | null> {
  if (!projectId) return null
  const { data } = await supabaseAdmin().from('projects').select('name').eq('id', projectId).maybeSingle()
  return (data?.name as string | undefined) ?? null
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
  const { data } = await supabaseAdmin().from('projects').select('code').like('code', `%-${year}-%`)
  const maxSeq = (data ?? []).reduce((max: number, p: { code: string | null }) => {
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
      const { data: newProj, error: createErr } = await supabaseAdmin().from('projects').insert({ name: body.projectName.trim(), code, status: 'active', sub_team: body.serviceLineHint ?? null }).select('id').single()
      if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })
      projectId = (newProj as { id: string }).id
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

  const sb = supabaseAdmin()
  const sortedWeekStarts = [...weekStarts].sort()
  const lastWeek = sortedWeekStarts[sortedWeekStarts.length - 1]

  // When extending with an explicit partial-week mask, merge (OR) into any existing
  // row for that week rather than deleting it. This preserves Mon-Wed when extending
  // Thu-Fri within the same week.
  if (explicitMask !== null) {
    const upserted: unknown[] = []
    for (const w of weekStarts) {
      let existQ = sb.from('forecast_allocations').select('id,days_mask')
        .eq('employee_id', employeeId).eq('week_start', w)
      existQ = projectId ? (existQ as any).eq('project_id', projectId) : (existQ as any).is('project_id', null)
      const { data: existingRow } = await existQ.maybeSingle()

      if (existingRow) {
        const currentMask = (existingRow as any).days_mask ?? 31
        const mergedMask = currentMask | explicitMask
        const { data: updated } = await sb.from('forecast_allocations')
          .update({ days_mask: mergedMask, allocation_pct: pct, allocation_status: status })
          .eq('id', (existingRow as any).id).select('*').single()
        if (updated) upserted.push(updated)
      } else {
        const { data: newRow } = await sb.from('forecast_allocations')
          .insert({ employee_id: employeeId, project_id: projectId, week_start: w, allocation_pct: pct, allocation_status: status, raw_text: body.rawText ?? null, days_mask: explicitMask })
          .select('*').single()
        if (newRow) upserted.push(newRow)
      }
    }
    const empName = await fetchEmployeeName(employeeId)
    const projDisplay = body.projectName ?? (projectId ? await fetchProjectName(projectId) : null) ?? status
    await logAudit({ userName: user.name, action: 'Created', entity: 'Allocation', entityName: allocationLabel(empName, projDisplay), entityId: employeeId, field: 'allocation', newValue: `partial week(s) at ${pct}% ${status}`, metadata: { employee: empName, employeeId, project: projDisplay, projectId, weekStarts: sortedWeekStarts, allocationPct: pct, allocationStatus: status } })
    return NextResponse.json({ allocations: upserted })
  }

  const rows = weekStarts.map(w => {
    const maskForRow = w === lastWeek && lastWeekMask !== null ? lastWeekMask : null
    return {
      employee_id: employeeId,
      project_id: projectId,
      week_start: w,
      allocation_pct: pct,
      allocation_status: status,
      raw_text: body.rawText ?? null,
      ...(maskForRow !== null ? { days_mask: maskForRow } : {}),
    }
  })

  let del = sb.from('forecast_allocations').delete().eq('employee_id', employeeId).in('week_start', weekStarts)
  del = projectId ? del.eq('project_id', projectId) : del.is('project_id', null)
  const { error: delErr } = await del
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  const { data: inserted, error: insErr } = await sb.from('forecast_allocations').insert(rows).select('*')
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  const empName = await fetchEmployeeName(employeeId)
  const projDisplay = body.projectName ?? (projectId ? await fetchProjectName(projectId) : null) ?? status
  const changeDesc = `${pluralWeeks(weekStarts.length)} at ${pct}% ${status} (${sortedWeekStarts[0]}${weekStarts.length > 1 ? ` – ${sortedWeekStarts[sortedWeekStarts.length - 1]}` : ''})`

  await logAudit({ userName: user.name, action: 'Created', entity: 'Allocation', entityName: allocationLabel(empName, projDisplay), entityId: employeeId, field: 'allocation', newValue: changeDesc, metadata: { employee: empName, employeeId, project: projDisplay, projectId, weekStarts: sortedWeekStarts, allocationPct: pct, allocationStatus: status, rowsCreated: inserted?.length ?? 0 } })

  const actorEmployeeId = await resolveEmployeeIdByEmail(user.email)
  await notifyAllocationAction({ action: 'created', employeeName: empName, projectName: projDisplay, change: `assigned for ${changeDesc}`, resourceEmployeeId: employeeId, actorEmployeeId, actorName: user.name, relatedEntityId: employeeId })

  return NextResponse.json({ allocations: inserted ?? [] })
})
