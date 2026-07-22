import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { parseInt32 } from '@/lib/server/api-utils'

export const GET = withAuth(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const users = sp.get('users') ?? undefined
  const entity = sp.get('entity') ?? undefined
  const action = sp.get('action') ?? undefined
  const limit = parseInt32(sp.get('limit'), 50)
  const offset = parseInt32(sp.get('offset'), 0)

  const params: unknown[] = []
  const conditions: string[] = []

  if (users) {
    const userList = users.split(',').map(u => u.trim()).filter(Boolean)
    if (userList.length > 0) {
      params.push(userList)
      conditions.push(`user_name = ANY($${params.length})`)
    }
  }
  if (entity) {
    params.push(entity)
    conditions.push(`entity = $${params.length}`)
  }
  if (action) {
    params.push(action)
    conditions.push(`action = $${params.length}`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  params.push(limit)
  const limitIdx = params.length
  params.push(offset)
  const offsetIdx = params.length

  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT *, COUNT(*) OVER() AS _total FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    )

    const total = rows.length > 0 ? Number((rows[0] as any)._total) : 0
    const entries = rows.map(r => { const { _total, ...rest } = r as any; return rest })

    const userRows = await query<{ user_name: string }>('SELECT DISTINCT user_name FROM audit_log WHERE user_name IS NOT NULL ORDER BY user_name', [])
    const distinctUsers = userRows.map(r => r.user_name)

    return NextResponse.json({ entries, total, limit, offset, users: distinctUsers })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})

export const POST = withAuth(async (request: NextRequest) => {
  const body = await request.json()

  try {
    const row = await queryOne<Record<string, unknown>>(
      `INSERT INTO audit_log (user_name, user_id, action, entity, entity_name, entity_id, field, old_value, new_value, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        body.user_name,
        body.user_id ?? null,
        body.action,
        body.entity,
        body.entity_name ?? null,
        body.entity_id ?? null,
        body.field ?? null,
        body.old_value ?? null,
        body.new_value ?? null,
        body.metadata ?? {},
      ],
    )
    return NextResponse.json(row, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})
