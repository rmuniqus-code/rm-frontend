import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'

export const GET = withAuth(async (_request: NextRequest, _user, ctx: any) => {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  try {
    const entries = await query<Record<string, unknown>>(
      `SELECT * FROM audit_log WHERE entity = 'Allocation' AND entity_id = $1 ORDER BY created_at DESC`,
      [id],
    )
    return NextResponse.json({ entries })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
})
