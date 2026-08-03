import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/server/db'
import { withPermission } from '@/lib/server/auth'

export const GET = withPermission('manage_users', async (_request: NextRequest) => {
  const users = await query<{
    id: string; email: string; name: string; role: string
    created_at: string | null
  }>(
    `SELECT id::text, COALESCE(email, '') as email, COALESCE(name, '') as name,
            role, created_at::text
     FROM app_users
     ORDER BY name`,
  )

  return NextResponse.json({
    users: users.map(u => ({ ...u, lastSignIn: null, createdAt: u.created_at, confirmed: true })),
  })
})
