import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'
import { parseISODate } from '@/lib/server/api-utils'

export const GET = withAuth(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const from = parseISODate(sp.get('from'))
  const to = parseISODate(sp.get('to'))

  if (!from || !to) return NextResponse.json({ error: 'from and to (YYYY-MM-DD) are required' }, { status: 400 })

  const { data, error } = await supabaseAdmin().rpc('fn_over_allocated', { p_from: from, p_to: to })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ from, to, conflicts: data, count: data?.length ?? 0 })
})
