import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'
import { logAudit } from '@/lib/server/audit'

export const POST = withAuth(async (request: NextRequest, user, ctx: any) => {
  const { id } = await ctx.params
  const body = await request.json()
  const sb = supabaseAdmin()

  const { data: before, error: fetchErr } = await sb.from('resource_requests').select('*, project:projects(name)').eq('id', id).single()
  if (fetchErr || !before) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  if (!['pending', 'shortlisted'].includes((before as any).approval_status ?? '')) {
    return NextResponse.json({ error: `Cannot shortlist — request is already in '${(before as any).approval_status}' status.` }, { status: 400 })
  }

  const resources: Array<any> = body.resources ?? []
  if (resources.length === 0) return NextResponse.json({ error: 'At least one shortlisted resource is required' }, { status: 400 })

  await sb.from('request_shortlisted_resources').delete().eq('request_id', id)

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const resolvedResources = await Promise.all(resources.map(async r => {
    let empId = r.employee_id ?? null
    if (empId && !UUID_RE.test(empId)) {
      const { data } = await sb.from('employees').select('id').eq('employee_id', empId).maybeSingle()
      empId = data?.id ?? null
    }
    return { ...r, employee_id: empId }
  }))

  const rows = resolvedResources.map(r => ({
    request_id: id, employee_id: r.employee_id ?? null, employee_name: r.employee_name,
    grade: r.grade ?? null, service_line: r.service_line ?? null,
    sub_service_line: r.sub_service_line ?? null, location: r.location ?? null,
    utilization_pct: r.utilization_pct ?? null, fit_score: r.fit_score ?? null,
    shortlisted_by: user.name ?? 'RM', notes: r.notes ?? null, status: 'shortlisted',
  }))

  const { error: insertErr } = await sb.from('request_shortlisted_resources').insert(rows)
  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  const { data: updated, error: updateErr } = await sb.from('resource_requests')
    .update({ approval_status: 'shortlisted', lifecycle_status: 'under_review', updated_at: new Date().toISOString() })
    .eq('id', id).select().single()
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  const projectName = (before as any).project?.name ?? 'Unknown Project'
  logAudit({ action: 'Updated', entity: 'Request', entityName: `#${(before as any).request_number} — ${projectName}`, entityId: id, userName: user.name ?? 'System', field: 'approval_status', oldValue: (before as any).approval_status ?? 'pending', newValue: 'shortlisted', metadata: { shortlisted_count: resources.length, resources: resources.map(r => r.employee_name) } })

  return NextResponse.json({ request: updated, shortlisted: rows.length })
})
