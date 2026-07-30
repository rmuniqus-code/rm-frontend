import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/server/auth'

export const POST = withAuth(async (_request: NextRequest, user) => {
  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  return NextResponse.json({ error: 'User creation is managed via Keycloak admin panel' }, { status: 501 })
})
