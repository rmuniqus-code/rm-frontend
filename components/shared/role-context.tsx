'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

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
  // permissions
  canApprove: boolean
  canEditBooking: boolean
  canViewAllResources: boolean
  canExport: boolean
  canSmartAllocate: boolean
  canCheckAvailability: boolean
  canAccessAdmin: boolean
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

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<UserRole>('rm')

  const user = MOCK_USERS[role]

  const value: RoleContextType = {
    user,
    role,
    setRole,
    roleLabel: roleLabels[role],
    canApprove: role === 'admin' || role === 'rm' || role === 'slh',
    canEditBooking: role === 'admin' || role === 'rm',
    canViewAllResources: role === 'admin' || role === 'rm',
    canExport: role === 'admin' || role === 'rm' || role === 'slh',
    canSmartAllocate: role === 'admin' || role === 'rm',
    canCheckAvailability: role === 'admin' || role === 'rm',
    canAccessAdmin: role === 'admin',
  }

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole must be used within a RoleProvider')
  return ctx
}
