/**
 * Audit Log API
 *
 * GET /api/audit-log?users=John,Sarah&entity=Allocation&limit=50
 *   Fetch audit log entries with multi-select user filter
 *
 * POST /api/audit-log
 *   Create an audit log entry (called by other APIs on data changes)
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ok, fail, withErrorHandling, parseInt32 } from '@/lib/api-helpers'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const url = new URL(req.url)
  const users = url.searchParams.get('users')    // comma-separated user names
  const entity = url.searchParams.get('entity')   // 'Allocation', 'Employee', etc.
  const action = url.searchParams.get('action')   // 'Created', 'Updated', etc.
  const limit = parseInt32(url.searchParams.get('limit'), 50)
  const offset = parseInt32(url.searchParams.get('offset'), 0)

  let query = supabaseAdmin()
    .from('audit_log')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Multi-select user filter: "John,Sarah" → IN filter
  if (users) {
    const userList = users.split(',').map(u => u.trim()).filter(Boolean)
    if (userList.length > 0) {
      query = query.in('user_name', userList)
    }
  }

  if (entity) query = query.eq('entity', entity)
  if (action) query = query.eq('action', action)

  const { data, error, count } = await query
  if (error) return fail(500, error.message)

  // Also return distinct user names for the filter dropdown
  const { data: userNames } = await supabaseAdmin()
    .from('audit_log')
    .select('user_name')
    .order('user_name')

  const distinctUsers = [...new Set((userNames ?? []).map((r: any) => r.user_name))].filter(Boolean)

  return ok({ entries: data ?? [], total: count ?? 0, limit, offset, users: distinctUsers })
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json()

  const { data, error } = await supabaseAdmin()
    .from('audit_log')
    .insert({
      user_name:   body.user_name,
      user_id:     body.user_id ?? null,
      action:      body.action,
      entity:      body.entity,
      entity_name: body.entity_name ?? null,
      entity_id:   body.entity_id ?? null,
      field:       body.field ?? null,
      old_value:   body.old_value ?? null,
      new_value:   body.new_value ?? null,
      metadata:    body.metadata ?? {},
    })
    .select()
    .single()

  if (error) return fail(500, error.message)
  return ok(data, { status: 201 })
})
