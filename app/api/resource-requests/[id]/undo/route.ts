import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { logAudit } from '@/lib/server/audit'

export const POST = withAuth(async (_request: NextRequest, user, ctx: any) => {
  const { id } = await ctx.params

  let auditRows: any[]
  try {
    auditRows = await query(
      `SELECT * FROM audit_log WHERE entity = 'Request' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id],
    )
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  const last = auditRows[0]
  if (!last) return NextResponse.json({ error: 'No audit history to undo' }, { status: 404 })

  const revert: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const changes = (last.metadata as any)?.changes as Array<{ field: string; from: unknown; to: unknown }> | undefined

  if (changes && changes.length > 0) {
    for (const c of changes) revert[c.field] = c.from
  } else if (last.field && last.old_value !== undefined) {
    revert[last.field] = last.old_value
  } else {
    return NextResponse.json({ error: 'Latest audit entry has no reversible changes' }, { status: 400 })
  }

  const fields = Object.keys(revert)
  const setClauses = fields.map((f, i) => `${f} = $${i + 1}`).join(', ')
  const params: unknown[] = [...Object.values(revert), id]

  try {
    const updated = await queryOne<any>(
      `UPDATE resource_requests SET ${setClauses} WHERE id = $${fields.length + 1} RETURNING *`,
      params,
    )
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    logAudit({ action: 'Updated', entity: 'Request', entityName: last.entity_name ?? `#${updated.request_number}`, entityId: id, userName: user.name ?? 'System', field: 'undo', metadata: { revertedAuditId: last.id, revertedFields: fields.filter(k => k !== 'updated_at') } })

    return NextResponse.json({ request: updated, reverted: revert })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})
