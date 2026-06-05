import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'
import { logAudit } from '@/lib/server/audit'

export const POST = withAuth(async (_request: NextRequest, user, ctx: any) => {
  const { id } = await ctx.params
  const sb = supabaseAdmin()

  const { data: auditRows, error: auditErr } = await sb.from('audit_log').select('*').eq('entity', 'Request').eq('entity_id', id).order('created_at', { ascending: false }).limit(1)
  if (auditErr) return NextResponse.json({ error: auditErr.message }, { status: 500 })

  const last = auditRows?.[0]
  if (!last) return NextResponse.json({ error: 'No audit history to undo' }, { status: 404 })

  const revert: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const changes = ((last as any).metadata as any)?.changes as Array<{ field: string; from: unknown; to: unknown }> | undefined

  if (changes && changes.length > 0) {
    for (const c of changes) revert[c.field] = c.from
  } else if ((last as any).field && (last as any).old_value !== undefined) {
    revert[(last as any).field] = (last as any).old_value
  } else {
    return NextResponse.json({ error: 'Latest audit entry has no reversible changes' }, { status: 400 })
  }

  const { data: updated, error: updateErr } = await sb.from('resource_requests').update(revert).eq('id', id).select().single()
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  logAudit({ action: 'Updated', entity: 'Request', entityName: (last as any).entity_name ?? `#${(updated as any).request_number}`, entityId: id, userName: user.name ?? 'System', field: 'undo', metadata: { revertedAuditId: (last as any).id, revertedFields: Object.keys(revert).filter(k => k !== 'updated_at') } })

  return NextResponse.json({ request: updated, reverted: revert })
})
