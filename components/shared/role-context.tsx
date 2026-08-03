'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useAuth } from '@ai-universe/auth-react'
import { apiRaw } from '@/lib/api'

export type UserRole = 'admin' | 'rm' | 'employee' | 'slh' | 'viewer'

export interface MockUser {
  role: UserRole
  name: string
  location: string
  department: string
}

interface RoleContextType {
  user: MockUser
  role: UserRole
  setRole: (role: UserRole) => void
  roleLabel: string
  email: string
  updateDisplayName: (name: string) => Promise<void>
  // permissions — driven by role_permissions table
  canApprove: boolean
  canShortlist: boolean
  canEditBooking: boolean
  canViewAllResources: boolean
  canExport: boolean
  canSmartAllocate: boolean
  canCheckAvailability: boolean
  canAccessAdmin: boolean
  canViewEmployeeNotes: boolean
}

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  rm: 'Resource Manager',
  employee: 'Employee',
  slh: 'Service Line Head',
  viewer: 'Viewer',
}

const MOCK_USERS: Record<UserRole, MockUser> = {
  admin:    { role: 'admin',    name: 'Raj Patel',        location: 'Mumbai',   department: 'IT' },
  rm:       { role: 'rm',       name: 'Sarah Chen',       location: 'New York', department: 'ARC' },
  employee: { role: 'employee', name: 'Priya Kapoor',     location: 'Mumbai',   department: 'GRC' },
  slh:      { role: 'slh',      name: 'Michael Torres',   location: 'New York', department: 'Consulting' },
  viewer:   { role: 'viewer',   name: 'Guest',            location: '',         department: '' },
}

// Maps each can* boolean to the permission_id in role_permissions table
const PERMISSION_MAP = {
  canApprove:            'approve_requests',
  canShortlist:          'manage_resources',
  canEditBooking:        'edit_allocations',
  canViewAllResources:   'view_all',
  canExport:             'view_reports',
  canSmartAllocate:      'smart_allocate',
  canCheckAvailability:  'view_all',
  canAccessAdmin:        'manage_users',
  canViewEmployeeNotes:  'view_service_line',
} as const

const RoleContext = createContext<RoleContextType | undefined>(undefined)

const VALID_ROLES = new Set<UserRole>(['admin', 'rm', 'employee', 'slh', 'viewer'])

function buildPermissions(grantedSet: Set<string>): Pick<RoleContextType,
  'canApprove' | 'canShortlist' | 'canEditBooking' | 'canViewAllResources' |
  'canExport' | 'canSmartAllocate' | 'canCheckAvailability' | 'canAccessAdmin' | 'canViewEmployeeNotes'
> {
  return {
    canApprove:           grantedSet.has(PERMISSION_MAP.canApprove),
    canShortlist:         grantedSet.has(PERMISSION_MAP.canShortlist),
    canEditBooking:       grantedSet.has(PERMISSION_MAP.canEditBooking),
    canViewAllResources:  grantedSet.has(PERMISSION_MAP.canViewAllResources),
    canExport:            grantedSet.has(PERMISSION_MAP.canExport),
    canSmartAllocate:     grantedSet.has(PERMISSION_MAP.canSmartAllocate),
    canCheckAvailability: grantedSet.has(PERMISSION_MAP.canCheckAvailability),
    canAccessAdmin:       grantedSet.has(PERMISSION_MAP.canAccessAdmin),
    canViewEmployeeNotes: grantedSet.has(PERMISSION_MAP.canViewEmployeeNotes),
  }
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>('viewer')
  const [realName, setRealName] = useState<string | null>(null)
  const [realEmail, setRealEmail] = useState<string>('')
  const [grantedSet, setGrantedSet] = useState<Set<string>>(new Set())

  const { role: authRole, email: authEmail, isAuthenticated } = useAuth()

  // Sync role from auth (which reads from /api/v1/auth/me → DB)
  useEffect(() => {
    if (!isAuthenticated || !authEmail) return
    if (authRole && VALID_ROLES.has(authRole as UserRole)) {
      setRole(authRole as UserRole)
    }
    setRealEmail(authEmail)
    setRealName(prev => prev ?? authEmail.split('@')[0])
  }, [isAuthenticated, authRole, authEmail])

  // Load permission matrix for this role from DB
  useEffect(() => {
    if (!isAuthenticated || !role) return
    apiRaw('/api/role-permissions')
      .then(res => res.json())
      .then((data: { permissions?: { role_id: string; permission_id: string; granted: boolean }[] }) => {
        const granted = new Set<string>(
          (data.permissions ?? [])
            .filter(p => p.role_id === role && p.granted)
            .map(p => p.permission_id),
        )
        setGrantedSet(granted)
      })
      .catch(() => {})
  }, [isAuthenticated, role])

  const updateDisplayName = async (name: string) => { setRealName(name) }

  const mockUser = MOCK_USERS[role] ?? MOCK_USERS.viewer
  const user: MockUser = { ...mockUser, name: realName ?? '' }

  const value: RoleContextType = {
    user,
    role,
    setRole,
    roleLabel: roleLabels[role] ?? role,
    email: realEmail,
    updateDisplayName,
    ...buildPermissions(grantedSet),
  }

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole must be used within a RoleProvider')
  return ctx
}
