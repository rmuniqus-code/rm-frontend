import { type NextRequest, NextResponse } from 'next/server'

/**
 * Auth is handled client-side by <AuthProvider> + <RequireAuth> from @ai-universe/auth-react.
 * This middleware is a pass-through so Next.js PKCE redirects and static assets are not blocked.
 */
export function middleware(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
