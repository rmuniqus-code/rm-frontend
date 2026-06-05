import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withHandler } from '@/lib/server/auth'

export const POST = withHandler(async (request: NextRequest) => {
  const body = await request.json()
  const { email, password, name } = body as { email?: string; password?: string; name?: string }

  if (!email || !password || !name) {
    return NextResponse.json({ error: 'email, password, and name are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const { error } = await supabaseAdmin().auth.admin.createUser({
    email, password, user_metadata: { name },
    app_metadata: { role: 'employee' }, email_confirm: true,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ message: 'Account created. You can sign in now.' }, { status: 201 })
})
