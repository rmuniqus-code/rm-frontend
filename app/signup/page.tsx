'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Signup is handled by Keycloak/admin. Redirect users to login
 * where the auth-kit PKCE flow will take them to Keycloak.
 */
export default function SignupPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/login')
  }, [router])

  return null
}
