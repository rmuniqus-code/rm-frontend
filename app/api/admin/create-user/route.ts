import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { withAuth } from '@/lib/server/auth'

const VALID_ROLES = new Set(['admin', 'rm', 'slh', 'employee'])

export const POST = withAuth(async (request: NextRequest, user) => {
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { email, name, role, tempPassword } = await request.json() as {
    email?: string; name?: string; role?: string; tempPassword?: string
  }

  if (!email || !name || !role || !tempPassword) {
    return NextResponse.json({ error: 'email, name, role, and tempPassword are required' }, { status: 400 })
  }
  if (tempPassword.length < 8) {
    return NextResponse.json({ error: 'tempPassword must be at least 8 characters' }, { status: 400 })
  }
  if (!VALID_ROLES.has(role)) {
    return NextResponse.json({ error: `Invalid role. Must be one of: ${[...VALID_ROLES].join(', ')}` }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin().auth.admin.createUser({
    email, password: tempPassword, user_metadata: { name },
    app_metadata: { role }, email_confirm: true,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({
    message: `User created. Share these credentials — email: ${email}, temp password: ${tempPassword}`,
    userId: data.user?.id,
  }, { status: 201 })
})
