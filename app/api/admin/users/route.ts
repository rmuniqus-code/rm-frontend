import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'

export const GET = withAuth(async (_request: NextRequest, user) => {
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin().auth.admin.listUsers({ perPage: 1000 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const users = (data?.users ?? []).map(u => ({
    id: u.id,
    email: u.email ?? '',
    name: (u.user_metadata?.name as string | undefined) ?? u.email ?? '',
    role: (u.app_metadata?.role as string | undefined) ?? 'employee',
    lastSignIn: u.last_sign_in_at ?? null,
    createdAt: u.created_at ?? null,
    confirmed: !!u.email_confirmed_at,
  }))

  return NextResponse.json({ users })
})
