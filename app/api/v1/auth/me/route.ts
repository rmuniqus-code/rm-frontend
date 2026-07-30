import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/server/auth'

export const GET = withAuth(async (_request: NextRequest, user) => {
  return NextResponse.json({
    userId: user.id,
    email: user.email ?? '',
    name: user.name,
    role: user.role,
    permissions: [],
    orgId: 'uniqus',
  })
})
