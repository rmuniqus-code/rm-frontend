'use client'

import type { ReactNode } from 'react'
import { useRole, type UserRole } from '@/components/shared/role-context'

interface RoleGuardProps {
  /** Roles allowed to see the children. If not provided, uses `permission` instead. */
  allowedRoles?: UserRole[]
  /** Named permission from useRole() — checked if allowedRoles not specified */
  permission?: keyof Omit<ReturnType<typeof useRole>, 'role' | 'setRole' | 'roleLabel' | 'user'>
  /** Fallback to render when access is denied. Defaults to null. */
  fallback?: ReactNode
  children: ReactNode
}

/**
 * Conditionally renders children based on the current user's role or permission.
 *
 * Usage:
 *   <RoleGuard allowedRoles={['admin', 'rm']}>…</RoleGuard>
 *   <RoleGuard permission="canApprove">…</RoleGuard>
 */
export default function RoleGuard({ allowedRoles, permission, fallback = null, children }: RoleGuardProps) {
  const roleCtx = useRole()

  let allowed = false

  if (allowedRoles) {
    allowed = allowedRoles.includes(roleCtx.role)
  } else if (permission) {
    allowed = !!roleCtx[permission]
  }

  return allowed ? <>{children}</> : <>{fallback}</>
}
