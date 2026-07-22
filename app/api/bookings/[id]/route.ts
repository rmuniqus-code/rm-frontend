import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { logAuditDiff } from '@/lib/server/audit'

const EDITABLE_FIELDS = new Set(['allocation_pct', 'allocation_status', 'project_id', 'week_start', 'raw_text'])

export const PATCH = withAuth(async (request: NextRequest, user, ctx: any) => {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const body = await request.json() as Record<string, unknown>
  const editableKeys = Object.keys(body).filter(k => EDITABLE_FIELDS.has(k))
  if (editableKeys.length === 0) {
    return NextResponse.json({ error: 'no editable fields in payload' }, { status: 400 })
  }

  try {
    const before = await queryOne<Record<string, unknown>>(
      'SELECT * FROM forecast_allocations WHERE id = $1',
      [id],
    )
    if (!before) return NextResponse.json({ error: 'allocation not found' }, { status: 404 })

    // Build SET clause dynamically from editable keys
    const setClauses: string[] = ['updated_at = $1']
    const params: unknown[] = [new Date().toISOString()]

    for (const key of editableKeys) {
      params.push(body[key])
      setClauses.push(`${key} = $${params.length}`)
    }

    params.push(id)
    const idIdx = params.length

    const updated = await queryOne<Record<string, unknown>>(
      `UPDATE forecast_allocations SET ${setClauses.join(', ')} WHERE id = $${idIdx} RETURNING *`,
      params,
    )

    await logAuditDiff(
      { entity: 'Allocation', entityId: id, entityName: (before as any)?.raw_text ?? null, action: 'Updated', userName: user.email ?? 'system' },
      before as Record<string, unknown>,
      updated as Record<string, unknown>,
      ['allocation_pct', 'allocation_status', 'project_id', 'week_start', 'raw_text'],
    )

    return NextResponse.json({ allocation: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})
