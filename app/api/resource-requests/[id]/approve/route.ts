/**
 * Approve or reject a resource request.
 *
 * POST /api/resource-requests/:id/approve
 *   body: { decision: 'approved' | 'rejected', approved_by: uuid, notes?: string,
 *           allocated_employee?: string, hours_per_day?: number }
 *
 * RULES:
 *   - Approval REQUIRES a valid employee allocation. If no employee is found
 *     or no allocations can be created, the approval is rejected with 400.
 *   - Rejection does not require allocation.
 *
 * Side effect on approval:
 *   Inserts confirmed forecast_allocations for each week in the request's
 *   date range. The next forecast tracker upload may overwrite these,
 *   which is the intended behavior — Excel remains source of truth.
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ok, fail, withErrorHandling } from '@/lib/api-helpers'
import { logAudit } from '@/lib/audit'
import { notifyBookingConfirmed } from '@/lib/notify'

type Ctx = { params: Promise<{ id: string }> }

/** Get all Mondays between two dates (inclusive). */
function weekStartsBetween(from: string, to: string): string[] {
  const result: string[] = []
  const start = new Date(from)
  const end = new Date(to)

  // Snap start to Monday (ISO weekday: Mon=1)
  const day = start.getUTCDay()
  const offset = (day === 0 ? -6 : 1 - day)
  start.setUTCDate(start.getUTCDate() + offset)

  while (start <= end) {
    result.push(start.toISOString().split('T')[0])
    start.setUTCDate(start.getUTCDate() + 7)
  }
  return result
}

export const POST = withErrorHandling(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params
  const body = await req.json()

  const decision = body.decision as 'approved' | 'rejected'
  if (!['approved', 'rejected'].includes(decision)) {
    return fail(400, 'decision must be "approved" or "rejected"')
  }

  const sb = supabaseAdmin()

  // Fetch the current request (needed for both approve and reject paths)
  const { data: request, error: fetchErr } = await sb
    .from('resource_requests')
    .select('*, project:projects(name)')
    .eq('id', id)
    .single()

  if (fetchErr || !request) return fail(404, 'Request not found')

  const projectName = (request as any).project?.name ?? 'Unknown Project'

  // ── REJECTION PATH — simple status update ────────────────────
  if (decision === 'rejected') {
    const { error: updateErr } = await sb
      .from('resource_requests')
      .update({
        approval_status: 'rejected',
        lifecycle_status: 'rejected',
        notes: body.notes ?? undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateErr) return fail(500, updateErr.message)

    logAudit({
      action: 'Rejected',
      entity: 'Request',
      entityName: `#${request.request_number} — ${projectName}`,
      entityId: id,
      userName: body._audit_user ?? 'System',
      field: 'approval_status',
      oldValue: request.approval_status ?? 'pending',
      newValue: 'rejected',
    })

    return ok({ request: { ...request, approval_status: 'rejected', lifecycle_status: 'rejected' }, allocationsCreated: 0 })
  }

  // ── APPROVAL PATH — allocation is REQUIRED ───────────────────

  // 1. Resolve the employee to allocate
  const allocatedName = body.allocated_employee
    ? String(body.allocated_employee).trim()
    : request.resource_requested
      ? String(request.resource_requested).trim()
      : null

  if (!allocatedName) {
    return fail(400, 'Approval requires an allocated employee. Provide allocated_employee or ensure resource_requested is set on the request.')
  }

  // Look up the resource by employee_id (exact) or name (case-insensitive).
  // Use two separate queries to avoid PostgREST .or() parsing issues with
  // names that contain spaces (e.g. "Rajdeep Dam").
  let empRow: { id: string } | null = null
  const { data: byId } = await sb
    .from('employees')
    .select('id')
    .eq('employee_id', allocatedName)
    .limit(1)
    .maybeSingle()
  if (byId) {
    empRow = byId
  } else {
    const { data: byName } = await sb
      .from('employees')
      .select('id')
      .ilike('name', allocatedName)
      .limit(1)
      .maybeSingle()
    empRow = byName
  }

  if (!empRow) {
    return fail(400, `Employee "${allocatedName}" not found. Cannot approve without a valid resource allocation.`)
  }
  const emp = empRow

  // 2. Validate date range
  if (!request.start_date || !request.end_date) {
    return fail(400, 'Request must have start_date and end_date to approve.')
  }

  const weeks = weekStartsBetween(request.start_date, request.end_date)
  if (weeks.length === 0) {
    return fail(400, 'No valid weeks found between start_date and end_date.')
  }

  // 3. Calculate allocation percentage.
  // Priority: (a) hours_per_day override from the allocation modal,
  //           (b) loading_pct stored on the request (already 0-100 %),
  //           (c) hours_per_day stored on the request,
  //           (d) default 100 % (full allocation).
  const bodyHpd = (typeof body.hours_per_day === 'number' && body.hours_per_day > 0)
    ? body.hours_per_day : null
  const reqLoadingPct = (request.loading_pct != null && Number(request.loading_pct) > 0)
    ? Math.min(200, Number(request.loading_pct)) : null
  const reqHpd = (request.hours_per_day && request.hours_per_day > 0)
    ? request.hours_per_day : null

  const pct = bodyHpd !== null
    ? Math.min(200, (bodyHpd / 8) * 100)          // explicit modal override
    : reqLoadingPct ?? (reqHpd !== null ? Math.min(200, (reqHpd / 8) * 100) : 100)

  // 4. Create allocation rows
  const rows = weeks.map(w => ({
    employee_id: emp.id,
    project_id: request.project_id,
    week_start: w,
    allocation_pct: pct,
    allocation_status: 'confirmed' as const,
    raw_text: `Approved request #${request.request_number}`,
    source_file: 'resource_request_approval',
  }))

  // Idempotent: replace existing rows for these (employee, week, project)
  await sb.from('forecast_allocations')
    .delete()
    .eq('employee_id', emp.id)
    .eq('project_id', request.project_id)
    .in('week_start', weeks)

  const { error: insertErr } = await sb
    .from('forecast_allocations')
    .insert(rows)

  if (insertErr) return fail(500, `Allocation creation failed: ${insertErr.message}`)

  const allocationsCreated = rows.length

  // 5. NOW update the request status (only after allocations succeed)
  const updatePayload: Record<string, unknown> = {
    approval_status: 'approved',
    lifecycle_status: 'approved',
    notes: body.notes ?? undefined,
    updated_at: new Date().toISOString(),
  }
  if (body.approved_by) updatePayload.approved_by = body.approved_by

  // Update resource_requested and hours_per_day if an override was provided
  if (body.allocated_employee) {
    updatePayload.resource_requested = allocatedName
    updatePayload.hours_per_day = (pct / 100) * 8
  }

  const { data: updatedRequest, error: updateErr } = await sb
    .from('resource_requests')
    .update(updatePayload)
    .eq('id', id)
    .select('*, project:projects(name)')
    .single()

  if (updateErr) return fail(500, updateErr.message)

  // 6. Audit trail (non-blocking)
  logAudit({
    action: 'Approved',
    entity: 'Request',
    entityName: `#${request.request_number} — ${projectName}`,
    entityId: id,
    userName: body._audit_user ?? 'System',
    field: 'approval_status',
    oldValue: request.approval_status ?? 'pending',
    newValue: 'approved',
    metadata: {
      allocatedEmployee: allocatedName,
      allocationsCreated,
      hoursPerDay: (pct / 100) * 8,
    },
  })

  logAudit({
    action: 'Created',
    entity: 'Allocation',
    entityName: `${allocatedName} → ${projectName}`,
    entityId: id,
    userName: body._audit_user ?? 'System',
    field: 'allocation',
    newValue: `${allocationsCreated} weeks confirmed`,
    metadata: {
      employee: allocatedName,
      project: projectName,
      weeks: allocationsCreated,
      startDate: request.start_date,
      endDate: request.end_date,
    },
  })

  notifyBookingConfirmed(
    allocatedName,
    projectName,
    request.start_date,
    request.end_date,
  )

  return ok({ request: updatedRequest, allocationsCreated })
})
