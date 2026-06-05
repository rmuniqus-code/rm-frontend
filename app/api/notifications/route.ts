import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'
import { parseInt32 } from '@/lib/server/api-utils'
import { resolveEmployeeIdByEmail } from '@/lib/server/notify'

export const GET = withAuth(async (request: NextRequest, user) => {
  const sp = request.nextUrl.searchParams
  const unreadOnly = sp.get('unread_only') === 'true'
  const limit = parseInt32(sp.get('limit'), 20)

  const employeeId = await resolveEmployeeIdByEmail(user.email)

  let query = supabaseAdmin().from('notifications').select('*', { count: 'exact' })
    .order('created_at', { ascending: false }).limit(limit)

  if (employeeId) {
    query = query.or(`recipient_id.is.null,recipient_id.eq.${employeeId}`)
  }
  if (unreadOnly) query = query.eq('is_read', false)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const unreadCount = unreadOnly ? (count ?? 0) : (data?.filter((n: any) => !n.is_read).length ?? 0)
  return NextResponse.json({ notifications: data ?? [], total: count ?? 0, unreadCount })
})

export const POST = withAuth(async (request: NextRequest) => {
  const body = await request.json()
  const required = ['type', 'title', 'message']
  const missing = required.filter(f => !body[f])
  if (missing.length) return NextResponse.json({ error: `Missing required fields: ${missing.join(', ')}` }, { status: 400 })

  const { data, error } = await supabaseAdmin().from('notifications').insert({
    type: body.type, title: body.title, message: body.message,
    recipient_id: body.recipient_id ?? null,
    related_entity_type: body.related_entity_type ?? null,
    related_entity_id: body.related_entity_id ?? null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
})

export const PATCH = withAuth(async (request: NextRequest) => {
  const body = await request.json()
  if (body.mark_all) {
    const { error } = await supabaseAdmin().from('notifications').update({ is_read: true }).eq('is_read', false)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, message: 'All notifications marked as read' })
  }
  if (body.ids && Array.isArray(body.ids)) {
    const { error } = await supabaseAdmin().from('notifications').update({ is_read: true }).in('id', body.ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true, updated: body.ids.length })
  }
  return NextResponse.json({ error: 'Provide either { mark_all: true } or { ids: [...] }' }, { status: 400 })
})

export const DELETE = withAuth(async () => {
  const { error } = await supabaseAdmin().from('notifications').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, message: 'All notifications cleared' })
})
