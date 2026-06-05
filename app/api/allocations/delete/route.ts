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
  const { data } = await supabaseAdmin().from('employees').select('id').eq('employee_id', empCode).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

async function resolveProjectId(name?: string | null): Promise<string | null | undefined> {
  if (name === undefined) return undefined
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

export const POST = withAuth(async (request: NextRequest, user) => {
  if (!EDITOR_ROLES.has(user.role)) return NextResponse.json({ error: 'Forbidden — editor role required' }, { status: 403 })

  const body = await request.json()
  const sb = supabaseAdmin()

  // By ID
  if (body.id) {
    const { data: before } = await sb.from('forecast_allocations').select('*').eq('id', body.id).maybeSingle()
    if (!before) return NextResponse.json({ error: 'allocation not found' }, { status: 404 })
    const { error } = await sb.from('forecast_allocations').delete().eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const empName = await fetchEmployeeName((before as any).employee_id)
    const projDisplay = (await fetchProjectName((before as any).project_id)) ?? (before as any).allocation_status
    await logAudit({ userName: user.name, action: 'Deleted', entity: 'Allocation', entityId: body.id, entityName: `${empName ?? '(unknown)'} → ${projDisplay ?? '(no project)'}`, field: 'allocation', oldValue: `${(before as any).allocation_pct}% ${(before as any).allocation_status} (week of ${(before as any).week_start})`, newValue: 'deleted', metadata: { employee: empName, employeeId: (before as any).employee_id, project: projDisplay, projectId: (before as any).project_id, weekStart: (before as any).week_start, allocationPct: (before as any).allocation_pct, allocationStatus: (before as any).allocation_status } })
    const actorEmpId = await resolveEmployeeIdByEmail(user.email)
    await notifyAllocationAction({ action: 'deleted', employeeName: empName, projectName: projDisplay, change: `removed from ${projDisplay} (week of ${(before as any).week_start})`, resourceEmployeeId: (before as any).employee_id, actorEmployeeId: actorEmpId, actorName: user.name, relatedEntityId: body.id })
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
      let q = sb.from('forecast_allocations').select('id,days_mask').eq('employee_id', employeeId).eq('week_start', monday)
      if (projectId !== undefined) q = projectId ? (q as any).eq('project_id', projectId) : (q as any).is('project_id', null)
      const { data: rows, error: fetchErr } = await q
      if (fetchErr || !rows) continue

      for (const row of rows as { id: string; days_mask: number | null }[]) {
        const currentMask = row.days_mask ?? 31
        const newMask = currentMask & ~clearBits & 0x1f
        if (newMask === 0) { await sb.from('forecast_allocations').delete().eq('id', row.id); totalDeleted++ }
        else if (newMask !== currentMask) { await sb.from('forecast_allocations').update({ days_mask: newMask }).eq('id', row.id); totalDeleted++ }
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

  let q = sb.from('forecast_allocations').select('*').eq('employee_id', employeeId).in('week_start', weekStarts)
  if (projectId !== undefined) q = projectId ? (q as any).eq('project_id', projectId) : (q as any).is('project_id', null)
  const { data: rowsToDelete, error: fetchErr } = await q
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!rowsToDelete || rowsToDelete.length === 0) return NextResponse.json({ deleted: 0 })

  const ids = rowsToDelete.map((r: any) => r.id)
  const { error: delErr } = await sb.from('forecast_allocations').delete().in('id', ids)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  const empName = await fetchEmployeeName(employeeId)
  const projDisplay = body.projectName ?? (typeof projectId === 'string' ? await fetchProjectName(projectId) : null) ?? '(multiple)'
  const sortedDel = [...weekStarts].sort()
  await logAudit({ userName: user.name, action: 'Deleted', entity: 'Allocation', entityName: `${empName ?? '(unknown)'} → ${projDisplay}`, entityId: employeeId, field: 'allocation', newValue: `deleted ${pluralWeeks(ids.length)} (${sortedDel[0]}${weekStarts.length > 1 ? ` – ${sortedDel[sortedDel.length - 1]}` : ''})`, metadata: { employee: empName, employeeId, project: projDisplay, projectId, weekStarts: sortedDel, rowsDeleted: ids.length, ids } })

  const actorEmpIdDel = await resolveEmployeeIdByEmail(user.email)
  await notifyAllocationAction({ action: 'deleted', employeeName: empName, projectName: projDisplay, change: `removed for ${pluralWeeks(ids.length)} (${sortedDel[0]}${weekStarts.length > 1 ? ` – ${sortedDel[sortedDel.length - 1]}` : ''})`, resourceEmployeeId: employeeId, actorEmployeeId: actorEmpIdDel, actorName: user.name, relatedEntityId: employeeId })

  return NextResponse.json({ deleted: ids.length })
})
