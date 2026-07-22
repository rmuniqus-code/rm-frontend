import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'

export const GET = withAuth(async (_request: NextRequest, _user, ctx: any) => {
  const { id } = await ctx.params
  try {
    const data = await query(
      `SELECT * FROM request_shortlisted_resources WHERE request_id = $1 ORDER BY fit_score DESC NULLS LAST`,
      [id],
    )
    return NextResponse.json({ data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})
