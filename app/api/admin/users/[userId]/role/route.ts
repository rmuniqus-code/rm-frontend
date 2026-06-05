import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'

const VALID_ROLES = new Set(['admin', 'rm', 'slh', 'employee'])

export const PUT = withAuth(
  async (request: NextRequest, user, ctx: any) => {
    if (user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { userId } = await ctx.params
    const body = await request.json()
    const { role } = body as { role?: string }

    if (!role || !VALID_ROLES.has(role)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${[...VALID_ROLES].join(', ')}` }, { status: 400 })
    }

    const { error } = await supabaseAdmin().auth.admin.updateUserById(userId, { app_metadata: { role } })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, userId, role })
  },
)
