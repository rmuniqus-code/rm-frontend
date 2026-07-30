'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { useAuth } from '@ai-universe/auth-react'

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

  const { role: authRole, email: authEmail, isAuthenticated } = useAuth()

  useEffect(() => {
    if (!isAuthenticated || !authEmail) return
    if (authRole && VALID_ROLES.has(authRole as UserRole)) {
      setRole(authRole as UserRole)
    }
    setRealEmail(authEmail)
    setRealName(prev => prev ?? authEmail.split('@')[0])
  }, [isAuthenticated, authRole, authEmail])

  const updateDisplayName = async (name: string) => {
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
