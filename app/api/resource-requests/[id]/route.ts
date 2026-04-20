/**
 * Resource Request — detail, update, delete
 *
 * GET    /api/resource-requests/:id
 * PATCH  /api/resource-requests/:id   (partial update)
 * DELETE /api/resource-requests/:id
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ok, fail, withErrorHandling } from '@/lib/api-helpers'
import { logAuditDiff, logAudit } from '@/lib/audit'

type Ctx = { params: Promise<{ id: string }> }

export const GET = withErrorHandling(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params
  const { data, error } = await supabaseAdmin()
    .from('resource_requests')
    .select(`
      *,
      project:projects(id, name, client, engagement_manager),
      requester:employees!resource_requests_requested_by_fkey(id, name, employee_id),
      approver:employees!resource_requests_approved_by_fkey(id, name, employee_id)
    `)
    .eq('id', id)
    .single()

  if (error) return fail(error.code === 'PGRST116' ? 404 : 500, error.message)
  return ok(data)
})

export const PATCH = withErrorHandling(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params
  const body = await req.json()

  const sb = supabaseAdmin()

  // Fetch current state for audit diff
  const { data: before } = await sb
    .from('resource_requests')
    .select('*, project:projects(name)')
    .eq('id', id)
    .single()

  // Whitelist editable fields — never trust the body shape.
  // approval_status and lifecycle_status are intentionally excluded:
  // they may only be changed via POST /approve (which enforces allocation).
  const editable = [
    'resource_requested', 'request_type', 'booking_type',
    'start_date', 'end_date', 'hours_per_day', 'total_hours',
    'role_needed', 'grade_needed', 'primary_skill', 'notes',
    'opportunity_id', 'skill_set',
    'travel_requirements', 'project_status', 'loading_pct',
    'em_ep_name', 'service_line', 'sub_service_line',
  ]
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const f of editable) {
    if (f in body) update[f] = body[f]
  }

  const { data, error } = await sb
    .from('resource_requests')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return fail(500, error.message)

  // Audit: log changed fields (non-blocking)
  if (before) {
    const projectName = (before as any).project?.name ?? 'Unknown Project'

    // Special case: resource assignment
    if (body.resource_requested && body.resource_requested !== before.resource_requested) {
      logAudit({
        action: 'Assigned',
        entity: 'Request',
        entityName: `#${before.request_number} — ${projectName}`,
        entityId: id,
        userName: body._audit_user ?? 'System',
        field: 'resource_requested',
        oldValue: before.resource_requested ?? 'Unassigned',
        newValue: body.resource_requested,
      })
    } else {
      logAuditDiff(
        {
          action: 'Updated',
          entity: 'Request',
          entityName: `#${before.request_number} — ${projectName}`,
          entityId: id,
          userName: body._audit_user ?? 'System',
        },
        before,
        body,
        editable,
      )
    }
  }

  return ok(data)
})

export const DELETE = withErrorHandling(async (_req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params
  const sb = supabaseAdmin()

  // Fetch before deleting for audit trail
  const { data: before } = await sb
    .from('resource_requests')
    .select('request_number, project:projects(name), role_needed')
    .eq('id', id)
    .single()

  const { error } = await sb
    .from('resource_requests')
    .delete()
    .eq('id', id)

  if (error) return fail(500, error.message)

  if (before) {
    logAudit({
      action: 'Deleted',
      entity: 'Request',
      entityName: `#${(before as any).request_number} — ${(before as any).project?.name ?? 'Unknown'}`,
      entityId: id,
      userName: 'System',
      field: 'request',
      oldValue: (before as any).role_needed ?? '',
    })
  }

  return ok({ deleted: true })
})
