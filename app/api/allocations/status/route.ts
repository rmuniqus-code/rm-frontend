import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
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

  const sb = supabaseAdmin()

  if (body.id && !body.applyToAllWeeks) {
    const { data: before } = await sb.from('forecast_allocations').select('*').eq('id', body.id).maybeSingle()
    if (!before) return NextResponse.json({ error: 'allocation not found' }, { status: 404 })
    const { data: updated, error } = await sb.from('forecast_allocations').update({ allocation_status: status, updated_at: new Date().toISOString() }).eq('id', body.id).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: empData } = await sb.from('employees').select('name, employee_id').eq('id', (before as any).employee_id).maybeSingle()
    const empName = (empData?.name as string | undefined) ?? null
    const { data: projData } = (before as any).project_id ? await sb.from('projects').select('name').eq('id', (before as any).project_id).maybeSingle() : { data: null }
    const projDisplay = projData?.name ?? (before as any).allocation_status

    await logAudit({ userName: user.name, action: 'Updated', entity: 'Allocation', entityId: body.id, entityName: `${empName ?? '(unknown)'} → ${projDisplay}`, field: 'allocation_status', oldValue: (before as any).allocation_status, newValue: status, metadata: { employee: empName, employeeId: (before as any).employee_id, project: projDisplay, projectId: (before as any).project_id, weekStart: (before as any).week_start } })

    const actorEmpIdSt = await resolveEmployeeIdByEmail(user.email)
    await notifyAllocationAction({ action: 'status_changed', employeeName: empName, projectName: projDisplay, change: `status changed from ${(before as any).allocation_status} to ${status} (week of ${(before as any).week_start})`, resourceEmployeeId: (before as any).employee_id, actorEmployeeId: actorEmpIdSt, actorName: user.name, relatedEntityId: body.id })
    return NextResponse.json({ allocation: updated, updated: 1 })
  }

  const { data: empRow } = await sb.from('employees').select('id').eq('employee_id', body.empCode).maybeSingle()
  const employeeId = (empRow?.id as string | undefined) ?? null
  if (!employeeId) return NextResponse.json({ error: 'employee not found' }, { status: 404 })
  if (!body.projectName) return NextResponse.json({ error: 'projectName required' }, { status: 400 })
  const { data: projRow } = await sb.from('projects').select('id').ilike('name', body.projectName.trim()).maybeSingle()
  const projectId = (projRow?.id as string | undefined) ?? null
  if (!projectId) return NextResponse.json({ error: 'project not found' }, { status: 404 })

  if (!body.weekStart || !isIsoMonday(body.weekStart)) {
    return NextResponse.json({ error: 'weekStart (ISO Monday) is required for the natural-key path' }, { status: 400 })
  }

  let q = sb.from('forecast_allocations').select('*').eq('employee_id', employeeId).eq('project_id', projectId)
  q = body.applyToAllWeeks ? (q as any).gte('week_start', body.weekStart) : (q as any).eq('week_start', body.weekStart)
  const { data: matches, error: fetchErr } = await q
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!matches || matches.length === 0) return NextResponse.json({ updated: 0, allocations: [] })

  const ids = matches.map((r: any) => r.id)
  const prevStatuses = matches.map((r: any) => r.allocation_status)
  const { data: updated, error } = await sb.from('forecast_allocations').update({ allocation_status: status, updated_at: new Date().toISOString() }).in('id', ids).select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: empData } = await sb.from('employees').select('name, employee_id').eq('id', employeeId).maybeSingle()
  const empName = (empData?.name as string | undefined) ?? null
  const projDisplay = body.projectName

  await Promise.all(ids.map((id: string, i: number) => logAudit({ userName: user.name, action: 'Updated', entity: 'Allocation', entityId: id, entityName: `${empName ?? '(unknown)'} → ${projDisplay}`, field: 'allocation_status', oldValue: prevStatuses[i] ?? undefined, newValue: status, metadata: { employee: empName, employeeId, project: projDisplay, projectId, weekStart: (matches[i] as any).week_start, applyToAllWeeks: !!body.applyToAllWeeks } })))

  const actorEmpIdSt2 = await resolveEmployeeIdByEmail(user.email)
  const weekRange = ids.length === 1 ? `week of ${(matches[0] as any).week_start}` : `${pluralWeeks(ids.length)} from ${body.weekStart}`
  await notifyAllocationAction({ action: 'status_changed', employeeName: empName, projectName: projDisplay, change: `status → ${status} (${weekRange})`, resourceEmployeeId: employeeId, actorEmployeeId: actorEmpIdSt2, actorName: user.name, relatedEntityId: employeeId })

  return NextResponse.json({ allocations: updated ?? [], updated: ids.length })
})
