import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'

export const GET = withAuth(async (_request: NextRequest, _user, ctx: any) => {
  const { id } = await ctx.params
  const { data, error } = await supabaseAdmin()
    .from('request_shortlisted_resources')
    .select('*')
    .eq('request_id', id)
    .order('fit_score', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
})
