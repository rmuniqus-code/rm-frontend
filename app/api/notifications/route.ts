import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { parseInt32 } from '@/lib/server/api-utils'
import { resolveEmployeeIdByEmail } from '@/lib/server/notify'

export const GET = withAuth(async (request: NextRequest, user) => {
  const sp = request.nextUrl.searchParams
  const unreadOnly = sp.get('unread_only') === 'true'
  const limit = parseInt32(sp.get('limit'), 20)

  const employeeId = await resolveEmployeeIdByEmail(user.email)

  const params: unknown[] = []
  const conditions: string[] = []

  if (employeeId) {
    params.push(employeeId)
    conditions.push(`(recipient_id IS NULL OR recipient_id = $${params.length})`)
  }
  if (unreadOnly) {
    conditions.push('is_read = false')
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit)
  const limitIdx = params.length

  try {
    const rows = await query<Record<string, unknown>>(
      `SELECT *, COUNT(*) OVER() AS _total FROM notifications ${where} ORDER BY created_at DESC LIMIT $${limitIdx}`,
      params,
    )

    const total = rows.length > 0 ? Number((rows[0] as any)._total) : 0
    const notifications = rows.map(r => { const { _total, ...rest } = r as any; return rest })
    const unreadCount = unreadOnly ? total : notifications.filter((n: any) => !n.is_read).length

    return NextResponse.json({ notifications, total, unreadCount })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})

export const POST = withAuth(async (request: NextRequest) => {
  const body = await request.json()
  const required = ['type', 'title', 'message']
  const missing = required.filter(f => !body[f])
  if (missing.length) return NextResponse.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 })

  try {
    const row = await queryOne<Record<string, unknown>>(
      `INSERT INTO notifications (type, title, message, recipient_id, related_entity_type, related_entity_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        body.type,
        body.title,
        body.message,
        body.recipient_id ?? null,
        body.related_entity_type ?? null,
        body.related_entity_id ?? null,
      ],
    )
    return NextResponse.json(row, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})

export const PATCH = withAuth(async (request: NextRequest) => {
  const body = await request.json()

  try {
    if (body.mark_all) {
      await query('UPDATE notifications SET is_read = true WHERE is_read = false', [])
      return NextResponse.json({ success: true, message: 'All notifications marked as read' })
    }
    if (body.ids && Array.isArray(body.ids)) {
      await query('UPDATE notifications SET is_read = true WHERE id = ANY($1)', [body.ids])
      return NextResponse.json({ success: true, updated: body.ids.length })
    }
    return NextResponse.json({ error: 'Provide either { mark_all: true } or { ids: [...] }' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})

export const DELETE = withAuth(async () => {
  try {
    await query('DELETE FROM notifications', [])
    return NextResponse.json({ success: true, message: 'All notifications cleared' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})
