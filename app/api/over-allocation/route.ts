import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'
import { parseISODate } from '@/lib/server/api-utils'

export const GET = withAuth(async (request: NextRequest) => {
  const sp = request.nextUrl.searchParams
  const from = parseISODate(sp.get('from'))
  const to = parseISODate(sp.get('to'))

  if (!from || !to) return NextResponse.json({ error: 'from and to (YYYY-MM-DD) are required' }, { status: 400 })

  try {
    const data = await query(`SELECT * FROM fn_over_allocated($1, $2)`, [from, to])
    return NextResponse.json({ from, to, conflicts: data, count: data.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})
