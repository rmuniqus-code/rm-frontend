import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
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

  const sb = supabaseAdmin()
  const { data: empRow } = await sb.from('employees').select('id').eq('employee_id', body.empCode).maybeSingle()
  const employeeId = (empRow?.id as string | undefined) ?? null
  if (!employeeId) return NextResponse.json({ error: 'employee not found' }, { status: 404 })

  let projectId: string | null = null
  if (body.projectName) {
    const { data: projRow } = await sb.from('projects').select('id').ilike('name', body.projectName.trim()).maybeSingle()
    projectId = (projRow?.id as string | undefined) ?? null
  }

  let source: any | null = null
  {
    let q = sb.from('forecast_allocations').select('*').eq('employee_id', employeeId).eq('week_start', body.fromWeekStart)
    q = projectId ? (q as any).eq('project_id', projectId) : (q as any).is('project_id', null)
    const { data } = await q.maybeSingle(); source = data
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

  let del = sb.from('forecast_allocations').delete().eq('employee_id', employeeId).in('week_start', weeks)
  del = projectId ? (del as any).eq('project_id', projectId) : (del as any).is('project_id', null)
  await del

  const rows = weeks.map(w => ({ employee_id: employeeId, project_id: projectId, week_start: w, allocation_pct: pct, allocation_status: source.allocation_status, raw_text: source.raw_text }))
  const { data: inserted, error } = await sb.from('forecast_allocations').insert(rows).select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: empData } = await sb.from('employees').select('name, employee_id').eq('id', employeeId).maybeSingle()
  const empName = (empData?.name as string | undefined) ?? (empData?.employee_id as string | undefined) ?? null
  const projDisplay = body.projectName ?? (projectId ? ((await sb.from('projects').select('name').eq('id', projectId).maybeSingle()).data?.name as string | undefined) : null) ?? source.allocation_status

  const extendDesc = `extended +${pluralWeeks(weeks.length)} at ${pct}% ${source.allocation_status} (through ${weeks[weeks.length - 1]})`
  await logAudit({ userName: user.name, action: 'Updated', entity: 'Allocation', entityName: `${empName ?? '(unknown)'} → ${projDisplay ?? '(no project)'}`, entityId: employeeId, field: 'allocation', newValue: extendDesc, metadata: { employee: empName, employeeId, project: projDisplay, projectId, extendedFrom: body.fromWeekStart, addedWeeks: weeks, allocationPct: pct, allocationStatus: source.allocation_status } })

  const actorEmpIdExt = await resolveEmployeeIdByEmail(user.email)
  await notifyAllocationAction({ action: 'extended', employeeName: empName, projectName: projDisplay, change: extendDesc, resourceEmployeeId: employeeId, actorEmployeeId: actorEmpIdExt, actorName: user.name, relatedEntityId: employeeId })

  return NextResponse.json({ allocations: inserted ?? [] })
})
