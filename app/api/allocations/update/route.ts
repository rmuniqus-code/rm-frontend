import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
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
  const { data } = await supabaseAdmin().from('employees').select('id').eq('employee_id', empCode).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

async function resolveProjectId(name?: string | null): Promise<string | null> {
  if (!name) return null
  const { data } = await supabaseAdmin().from('projects').select('id').ilike('name', name.trim()).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

async function findAllocation(opts: { id?: string; employeeId?: string; projectId?: string | null; weekStart?: string }): Promise<any | null> {
  const sb = supabaseAdmin()
  if (opts.id) { const { data } = await sb.from('forecast_allocations').select('*').eq('id', opts.id).maybeSingle(); return data ?? null }
  if (!opts.employeeId || !opts.weekStart) return null
  let q = sb.from('forecast_allocations').select('*').eq('employee_id', opts.employeeId).eq('week_start', opts.weekStart)
  q = opts.projectId ? q.eq('project_id', opts.projectId) : q.is('project_id', null)
  const { data } = await q.maybeSingle(); return data ?? null
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
  const patch = (body.patch ?? {}) as Record<string, unknown>
  if (!patch || Object.keys(patch).length === 0) return NextResponse.json({ error: 'patch object is required' }, { status: 400 })

  const employeeId = body.id ? undefined : await resolveEmployeeId(body.empCode)
  const projectIdLookup = body.projectName !== undefined ? await resolveProjectId(body.projectName) : undefined

  if (body.projectName !== undefined && body.projectName !== null && projectIdLookup === null) {
    return NextResponse.json({ error: 'project not found' }, { status: 404 })
  }

  const before = await findAllocation({ id: body.id, employeeId: employeeId ?? undefined, projectId: projectIdLookup ?? null, weekStart: body.weekStart })
  if (!before) return NextResponse.json({ error: 'allocation not found' }, { status: 404 })

  const next: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.allocationPct !== undefined) {
    const n = Number(patch.allocationPct); if (!Number.isFinite(n) || n < 0) return NextResponse.json({ error: 'allocationPct must be 0 or greater' }, { status: 400 }); next.allocation_pct = n
  }
  if (patch.allocationStatus !== undefined) {
    const s = String(patch.allocationStatus); if (!VALID_STATUSES.has(s)) return NextResponse.json({ error: `invalid allocationStatus: ${s}` }, { status: 400 }); next.allocation_status = s
  }
  if (patch.weekStart !== undefined) {
    const w = String(patch.weekStart); if (!isIsoMonday(w)) return NextResponse.json({ error: 'patch.weekStart must be an ISO Monday' }, { status: 400 }); next.week_start = w
  }
  if (patch.projectName !== undefined) {
    const newProjectId = await resolveProjectId(patch.projectName as string | null)
    if (patch.projectName && !newProjectId) return NextResponse.json({ error: 'project not found' }, { status: 404 })
    next.project_id = newProjectId
  } else if (patch.projectId !== undefined) {
    next.project_id = patch.projectId
  }
  if (patch.rawText !== undefined) next.raw_text = patch.rawText

  if (Object.keys(next).length === 1) return NextResponse.json({ error: 'no editable fields in patch' }, { status: 400 })

  const { data: updated, error } = await supabaseAdmin().from('forecast_allocations').update(next).eq('id', before.id).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const empName = await fetchEmployeeName(before.employee_id)
  const projDisplay = body.projectName ?? (await fetchProjectName(before.project_id)) ?? before.allocation_status
  await logAuditDiff({ userName: user.name, action: 'Updated', entity: 'Allocation', entityId: before.id, entityName: `${empName ?? '(unknown)'} → ${projDisplay ?? '(no project)'}`, metadata: { employee: empName, employeeId: before.employee_id, project: projDisplay, projectId: before.project_id, weekStart: before.week_start } }, before as Record<string, unknown>, updated as Record<string, unknown>, ['allocation_pct', 'allocation_status', 'project_id', 'week_start', 'raw_text'])

  const changes: string[] = []
  if (next.allocation_pct !== undefined) changes.push(`load → ${next.allocation_pct}%`)
  if (next.allocation_status !== undefined) changes.push(`status → ${next.allocation_status}`)
  if (next.week_start !== undefined) changes.push(`week → ${next.week_start}`)
  const updateDesc = changes.length > 0 ? changes.join(', ') : 'updated'

  const actorEmployeeId = await resolveEmployeeIdByEmail(user.email)
  await notifyAllocationAction({ action: 'updated', employeeName: empName, projectName: projDisplay, change: `${updateDesc} (week of ${before.week_start})`, resourceEmployeeId: before.employee_id, actorEmployeeId, actorName: user.name, relatedEntityId: before.id })

  return NextResponse.json({ allocation: updated })
})
