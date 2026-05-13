'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { createClient } from '@/utils/supabase/client'

export type UserRole = 'admin' | 'rm' | 'employee' | 'slh'

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
  // permissions
  canApprove: boolean          // admin | rm | slh  — final-approve step
  canShortlist: boolean        // admin | rm only   — shortlist candidates for EM/EP review
  canEditBooking: boolean
  canViewAllResources: boolean
  canExport: boolean
  canSmartAllocate: boolean
  canCheckAvailability: boolean
  canAccessAdmin: boolean
  canViewEmployeeNotes: boolean  // admin, rm, slh — never shown to the employee themselves
}

const roleLabels: Record<UserRole, string> = {
  admin: 'Admin',
  rm: 'Resource Manager',
  employee: 'Employee',
  slh: 'Service Line Head',
}

const MOCK_USERS: Record<UserRole, MockUser> = {
  admin: { role: 'admin', name: 'Raj Patel', location: 'Mumbai', department: 'IT' },
  rm: { role: 'rm', name: 'Sarah Chen', location: 'New York', department: 'ARC' },
  employee: { role: 'employee', name: 'Priya Kapoor', location: 'Mumbai', department: 'GRC' },
  slh: { role: 'slh', name: 'Michael Torres', location: 'New York', department: 'Consulting' },
}

const RoleContext = createContext<RoleContextType | undefined>(undefined)

const VALID_ROLES = new Set<UserRole>(['admin', 'rm', 'employee', 'slh'])

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>('rm')
  const [realName, setRealName] = useState<string | null>(null)
  const [realEmail, setRealEmail] = useState<string>('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      const sessionRole =
        data.session?.user?.app_metadata?.role ??
        data.session?.user?.user_metadata?.role
      if (sessionRole && VALID_ROLES.has(sessionRole as UserRole)) {
        setRole(sessionRole as UserRole)
      }
      const email = data.session?.user?.email ?? ''
      const name = data.session?.user?.user_metadata?.name
      setRealEmail(email)
      if (name) setRealName(name)
      else if (email) setRealName(email.split('@')[0])
    })
  }, [])

  const updateDisplayName = async (name: string) => {
    const supabase = createClient()
    await supabase.auth.updateUser({ data: { name } })
    setRealName(name)
  }

  const mockUser = MOCK_USERS[role]
  const user: MockUser = { ...mockUser, name: realName ?? '' }

  const value: RoleContextType = {
    user,
    role,
    setRole,
    roleLabel: roleLabels[role],
    email: realEmail,
    updateDisplayName,
    canApprove: role === 'admin' || role === 'rm' || role === 'slh',
    canShortlist: role === 'admin' || role === 'rm',
    canEditBooking: role === 'admin' || role === 'rm',
    canViewAllResources: role === 'admin' || role === 'rm',
    canExport: role === 'admin' || role === 'rm' || role === 'slh',
    canSmartAllocate: role === 'admin' || role === 'rm',
    canCheckAvailability: role === 'admin' || role === 'rm',
    canAccessAdmin: role === 'admin',
    canViewEmployeeNotes: role === 'admin' || role === 'rm' || role === 'slh',
  }

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole must be used within a RoleProvider')
  return ctx
}
