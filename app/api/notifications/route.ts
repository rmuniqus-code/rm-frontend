/**
 * Notifications API
 *
 * GET  /api/notifications?unread_only=true&limit=20
 *   Fetch recent notifications (most recent first)
 *
 * POST /api/notifications
 *   Create a new notification (used by other backend events)
 *
 * PATCH /api/notifications
 *   Mark notifications as read  { ids: string[] } or { mark_all: true }
 */

import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { ok, fail, withErrorHandling, parseInt32 } from '@/lib/api-helpers'

export const GET = withErrorHandling(async (req: NextRequest) => {
  const url = new URL(req.url)
  const unreadOnly = url.searchParams.get('unread_only') === 'true'
  const limit = parseInt32(url.searchParams.get('limit'), 20)

  let query = supabaseAdmin()
    .from('notifications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .limit(limit)

  if (unreadOnly) query = query.eq('is_read', false)

  const { data, error, count } = await query
  if (error) return fail(500, error.message)

  const unreadCount = unreadOnly
    ? (count ?? 0)
    : (data?.filter((n: any) => !n.is_read).length ?? 0)

  return ok({ notifications: data ?? [], total: count ?? 0, unreadCount })
})

export const POST = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json()

  const required = ['type', 'title', 'message']
  const missing = required.filter(f => !body[f])
  if (missing.length) return fail(400, `Missing required fields: ${missing.join(', ')}`)

  const { data, error } = await supabaseAdmin()
    .from('notifications')
    .insert({
      type:                body.type,
      title:               body.title,
      message:             body.message,
      recipient_id:        body.recipient_id ?? null,
      related_entity_type: body.related_entity_type ?? null,
      related_entity_id:   body.related_entity_id ?? null,
    })
    .select()
    .single()

  if (error) return fail(500, error.message)
  return ok(data, { status: 201 })
})

export const PATCH = withErrorHandling(async (req: NextRequest) => {
  const body = await req.json()

  if (body.mark_all) {
    // Mark all as read
    const { error } = await supabaseAdmin()
      .from('notifications')
      .update({ is_read: true })
      .eq('is_read', false)

    if (error) return fail(500, error.message)
    return ok({ success: true, message: 'All notifications marked as read' })
  }

  if (body.ids && Array.isArray(body.ids)) {
    const { error } = await supabaseAdmin()
      .from('notifications')
      .update({ is_read: true })
      .in('id', body.ids)

    if (error) return fail(500, error.message)
    return ok({ success: true, updated: body.ids.length })
  }

  return fail(400, 'Provide either { mark_all: true } or { ids: [...] }')
})

export const DELETE = withErrorHandling(async () => {
  const { error } = await supabaseAdmin()
    .from('notifications')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000') // delete all rows

  if (error) return fail(500, error.message)
  return ok({ success: true, message: 'All notifications cleared' })
})
