import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'

export const GET = withAuth(async (_request: NextRequest, _user, ctx: any) => {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data, error } = await supabaseAdmin()
    .from('audit_log')
    .select('*')
    .eq('entity', 'Allocation')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entries: data ?? [] })
})
