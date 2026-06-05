import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'
import { parseInt32 } from '@/lib/server/api-utils'

export const GET = withAuth(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const users = sp.get('users') ?? undefined
  const entity = sp.get('entity') ?? undefined
  const action = sp.get('action') ?? undefined
  const limit = parseInt32(sp.get('limit'), 50)
  const offset = parseInt32(sp.get('offset'), 0)

  let query = supabaseAdmin()
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (users) {
    const userList = users.split(',').map(u => u.trim()).filter(Boolean)
    if (userList.length > 0) query = query.in('user_name', userList)
  }
  if (entity) query = query.eq('entity', entity)
  if (action) query = query.eq('action', action)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: userNames } = await supabaseAdmin().from('audit_log').select('user_name').order('user_name')
  const distinctUsers = [...new Set((userNames ?? []).map((r: any) => r.user_name))].filter(Boolean)

  return NextResponse.json({ entries: data ?? [], total: count ?? 0, limit, offset, users: distinctUsers })
})

export const POST = withAuth(async (request: NextRequest) => {
  const body = await request.json()

  const { data, error } = await supabaseAdmin()
    .from('audit_log')
    .insert({
      user_name: body.user_name, user_id: body.user_id ?? null,
      action: body.action, entity: body.entity,
      entity_name: body.entity_name ?? null, entity_id: body.entity_id ?? null,
      field: body.field ?? null, old_value: body.old_value ?? null,
      new_value: body.new_value ?? null, metadata: body.metadata ?? {},
    })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
})
