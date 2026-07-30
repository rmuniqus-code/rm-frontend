import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { withAuth } from '@/lib/server/auth'

export const GET = withAuth(async (_request: NextRequest, user) => {
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const users = await query<{ id: string; email: string; name: string; role: string }>(
    `SELECT id::text, COALESCE(email, emp_code || '@uniqus.com') as email, name, 'employee' as role FROM employees ORDER BY name`
  )

  return NextResponse.json({
    users: users.map(u => ({ ...u, lastSignIn: null, createdAt: null, confirmed: true })),
  })
})
