'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import styled, { keyframes } from 'styled-components'
import Modal, { Section, SectionTitle, DetailGrid, DetailItem } from '@/components/shared/modal'
import { Shield, UserPlus, Edit2, Search, Lock, Users, Eye, RefreshCw, Loader2, Check, X, CheckCircle2, AlertCircle, Save } from 'lucide-react'
import { adminUsers, type AdminUser, apiRaw } from '@/lib/api'
import { useRole } from '@/components/shared/role-context'

type User = AdminUser & { _roleEditing?: boolean }

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface RoleConfig {
  id: string
  label: string
  description: string
  permissions: string[]
  color: string
  icon: React.ReactNode
}

const ROLES: RoleConfig[] = [
  { id: 'admin', label: 'Admin', description: 'Full system access, user management, configuration', permissions: ['manage_users', 'manage_roles', 'view_all', 'edit_all', 'approve_requests', 'configure_system', 'view_audit'], color: '#ef4444', icon: <Shield size={16} /> },
  { id: 'rm', label: 'Resource Manager', description: 'Manage resource allocation, approve requests, forecasting', permissions: ['view_all', 'edit_allocations', 'approve_requests', 'manage_resources', 'view_forecasting', 'smart_allocate'], color: '#3b82f6', icon: <Users size={16} /> },
  { id: 'slh', label: 'Service Line Head', description: 'View service line data, approve within service line', permissions: ['view_service_line', 'approve_requests', 'view_forecasting'], color: '#8b5cf6', icon: <Eye size={16} /> },
  { id: 'employee', label: 'Employee', description: 'View own data, submit requests, timesheet entry', permissions: ['view_own', 'submit_requests', 'enter_timesheet'], color: '#22c55e', icon: <Users size={16} /> },
  { id: 'viewer', label: 'Viewer', description: 'Read-only access to dashboards and reports', permissions: ['view_dashboards', 'view_reports'], color: '#64748b', icon: <Eye size={16} /> },
]

const ALL_PERMISSIONS = [
  { id: 'manage_users', label: 'Manage Users', group: 'Admin' },
  { id: 'manage_roles', label: 'Manage Roles', group: 'Admin' },
  { id: 'configure_system', label: 'System Configuration', group: 'Admin' },
  { id: 'view_all', label: 'View All Data', group: 'Data Access' },
  { id: 'view_service_line', label: 'View Service Line Data', group: 'Data Access' },
  { id: 'view_own', label: 'View Own Data', group: 'Data Access' },
  { id: 'view_dashboards', label: 'View Dashboards', group: 'Data Access' },
  { id: 'view_reports', label: 'View Reports', group: 'Data Access' },
  { id: 'edit_all', label: 'Edit All Records', group: 'Actions' },
  { id: 'edit_allocations', label: 'Edit Allocations', group: 'Actions' },
  { id: 'approve_requests', label: 'Approve Requests', group: 'Actions' },
  { id: 'manage_resources', label: 'Manage Resources', group: 'Actions' },
  { id: 'submit_requests', label: 'Submit Requests', group: 'Actions' },
  { id: 'enter_timesheet', label: 'Enter Timesheet', group: 'Actions' },
  { id: 'smart_allocate', label: 'Smart Allocation', group: 'Actions' },
  { id: 'view_forecasting', label: 'View Forecasting', group: 'Analytics' },
  { id: 'view_audit', label: 'View Audit Trail', group: 'Analytics' },
]

/* ─── Styled Components ────────────────────────────── */
const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
`

const PageTitleArea = styled.div`
  h1 { font-size: 22px; font-weight: 700; color: var(--color-text); display: flex; align-items: center; gap: 8px; }
  p { font-size: 14px; color: var(--color-text-secondary); margin-top: 4px; }
`

const TabBar = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--color-border);
  margin-bottom: 24px;
`

const Tab = styled.button<{ $active: boolean }>`
  padding: 10px 20px;
  font-size: 13px;
  font-weight: ${p => p.$active ? 600 : 400};
  color: ${p => p.$active ? 'var(--color-primary)' : 'var(--color-text-secondary)'};
  border-bottom: 2px solid ${p => p.$active ? 'var(--color-primary)' : 'transparent'};
  margin-bottom: -2px;
  white-space: nowrap;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 6px;
  &:hover { color: var(--color-primary); }
`

const ToolbarRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;
`

const SearchBox = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-card);
  min-width: 240px;
  svg { color: var(--color-text-muted); }
  input {
    border: none;
    outline: none;
    background: transparent;
    font-size: 13px;
    color: var(--color-text);
    flex: 1;
    &::placeholder { color: var(--color-text-muted); }
  }
`

const FilterSelect = styled.select`
  padding: 7px 10px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-card);
  font-size: 13px;
  color: var(--color-text);
  &:focus { outline: none; border-color: var(--color-primary); }
`

const AddBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  background: var(--color-primary);
  cursor: pointer;
  &:hover { opacity: 0.9; }
`

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;

  th {
    text-align: left;
    padding: 10px 14px;
    font-weight: 600;
    font-size: 11px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--color-bg);
    border-bottom: 1px solid var(--color-border);
  }

  td {
    padding: 10px 14px;
    border-bottom: 1px solid var(--color-border-light);
    vertical-align: middle;
  }

  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--color-bg); }
`

const RolePill = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  background: ${p => p.$color}18;
  color: ${p => p.$color};
  border: 1px solid ${p => p.$color}30;
`

const StatusBadge = styled.span<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: ${p => p.$active ? 'var(--color-success)' : 'var(--color-text-muted)'};
  &::before {
    content: '';
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: ${p => p.$active ? 'var(--color-success)' : 'var(--color-text-muted)'};
  }
`

const ActionBtns = styled.div`
  display: flex;
  gap: 6px;
`

const IconBtn = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid var(--color-border);
  background: transparent;
  cursor: pointer;
  color: ${p => p.$danger ? 'var(--color-danger)' : 'var(--color-text-secondary)'};
  &:hover { background: ${p => p.$danger ? '#fef2f2' : 'var(--color-bg)'}; }
`

/* Roles tab */
const RolesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
`

const RoleCard = styled.div`
  padding: 20px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  transition: all 0.15s;
  &:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.06); border-color: var(--color-primary); }
`

const RoleCardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
`

const RoleIcon = styled.div<{ $color: string }>`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: ${p => p.$color}18;
  color: ${p => p.$color};
`

const RoleCardTitle = styled.div`
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
`

const RoleCardDesc = styled.div`
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 12px;
  line-height: 1.5;
`

const PermissionChips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
`

const PermChip = styled.span`
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 600;
  background: var(--color-bg);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
`

const UserCount = styled.span`
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: 10px;
  display: block;
`

/* Permissions Matrix */
const MatrixTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  overflow: hidden;

  th {
    padding: 10px 12px;
    font-weight: 600;
    font-size: 11px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: var(--color-bg);
    border-bottom: 1px solid var(--color-border);
    text-align: center;
  }

  th:first-child { text-align: left; }

  td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--color-border-light);
    text-align: center;
  }

  td:first-child {
    text-align: left;
    font-weight: 500;
    color: var(--color-text);
  }

  tr:last-child td { border-bottom: none; }
`

const CheckIcon = styled.span<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: ${p => p.$active ? '#dcfce7' : 'var(--color-border-light)'};
  color: ${p => p.$active ? '#15803d' : 'var(--color-text-muted)'};
`

const GroupHeader = styled.td`
  font-weight: 700 !important;
  color: var(--color-text-secondary) !important;
  font-size: 11px !important;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--color-bg) !important;
  padding: 10px 16px !important;
  border-top: 2px solid var(--color-border) !important;
`

const spin = keyframes`from{transform:rotate(0deg)}to{transform:rotate(360deg)}`

const MatrixWrap = styled.div`
  overflow-x: auto; border: 1px solid var(--color-border);
  border-radius: 10px; background: var(--color-bg-card);
`

const CellBtn = styled.button<{ $granted: boolean; $saving: boolean; $isAdmin: boolean }>`
  display: inline-flex; align-items: center; justify-content: center;
  width: 32px; height: 32px; border-radius: 6px; margin: 6px;
  border: 1.5px solid ${p => p.$granted ? '#22c55e44' : 'var(--color-border)'};
  background: ${p => p.$granted ? '#dcfce7' : 'var(--color-bg)'};
  color: ${p => p.$granted ? '#15803d' : 'var(--color-text-muted)'};
  transition: all 0.15s; position: relative;
  cursor: ${p => p.$isAdmin ? 'pointer' : 'default'};
  opacity: ${p => p.$saving ? 0.6 : 1};
  ${p => p.$isAdmin && `
    &:hover {
      transform: scale(1.15);
      border-color: ${p.$granted ? '#ef4444' : '#22c55e'};
      background: ${p.$granted ? '#fef2f2' : '#f0fdf4'};
      color: ${p.$granted ? '#dc2626' : '#16a34a'};
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    }
    &:active { transform: scale(0.95); }
  `}
  svg.spin { animation: ${spin} 0.7s linear infinite; }
`

const CellTooltip = styled.div`
  position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
  background: #1e293b; color: #fff; border-radius: 5px;
  padding: 4px 8px; font-size: 10px; white-space: nowrap; pointer-events: none;
  opacity: 0; transition: opacity 0.15s; z-index: 100;
  ${CellBtn}:hover & { opacity: 1; }
  &::after { content:''; position:absolute; top:100%; left:50%; transform:translateX(-50%);
    border:4px solid transparent; border-top-color:#1e293b; }
`

const ToastBar = styled.div<{ $type: 'success' | 'error' }>`
  position: fixed; bottom: 24px; right: 24px; z-index: 9999;
  display: flex; align-items: center; gap: 10px;
  padding: 12px 18px; border-radius: 10px; font-size: 13px; font-weight: 500;
  background: ${p => p.$type === 'success' ? '#f0fdf4' : '#fef2f2'};
  color: ${p => p.$type === 'success' ? '#15803d' : '#dc2626'};
  border: 1px solid ${p => p.$type === 'success' ? '#bbf7d0' : '#fecaca'};
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  animation: fadeIn 0.2s ease;
`

const MatrixInfo = styled.div`
  display: flex; align-items: center; gap: 8px; margin-bottom: 14px;
  font-size: 12px; color: var(--color-text-secondary);
  svg { color: var(--color-primary); }
`

const DEFAULT_GRANTS: Record<string, Record<string, boolean>> = {
  admin:    { manage_users:true, manage_roles:true, configure_system:true, view_all:true, edit_all:true, approve_requests:true, view_audit:true },
  rm:       { view_all:true, edit_allocations:true, approve_requests:true, manage_resources:true, smart_allocate:true, view_forecasting:true },
  slh:      { view_service_line:true, approve_requests:true, view_forecasting:true },
  employee: { view_own:true, submit_requests:true, enter_timesheet:true },
  viewer:   { view_dashboards:true, view_reports:true },
}

interface PermRow {
  role_id: string; permission_id: string; granted: boolean;
  updated_by?: string | null; updated_at?: string | null;
}

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
`

const StatBox = styled.div`
  padding: 16px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 10px;
  h4 { font-size: 11px; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 4px; }
  span { font-size: 22px; font-weight: 800; color: var(--color-text); }
`

// ─── Form for Add/Edit User Modal ──────────
const FormGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
`

const FormField = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`

const FormLabel = styled.label`
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
`

const FormInput = styled.input`
  padding: 9px 12px;
  border: 1.5px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-surface, var(--color-bg-card));
  outline: none;
  &:focus { border-color: var(--color-primary); }
`

const FormSelect2 = styled.select`
  padding: 9px 12px;
  border: 1.5px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-surface, var(--color-bg-card));
  outline: none;
  &:focus { border-color: var(--color-primary); }
`

const ModalActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
`

const SaveBtn = styled.button`
  padding: 9px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  background: var(--color-primary);
  cursor: pointer;
  &:hover { opacity: 0.9; }
`

const CancelBtn = styled.button`
  padding: 9px 24px;
  border: 1.5px solid var(--color-border);
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: transparent;
  cursor: pointer;
  &:hover { background: var(--color-border-light); }
`

/* ─── Component ────────────────────────────────────── */
export default function AdminPage() {
  const { role: viewerRole } = useRole()
  const isAdmin = viewerRole === 'admin'

  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'permissions'>('users')
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formRole, setFormRole] = useState<string>('employee')
  const [formTempPass, setFormTempPass] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null)

  /* ── Live permissions state ── */
  const [permMap, setPermMap] = useState<Map<string, boolean>>(new Map())
  const [permLoadState, setPermLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [savingPermKey, setSavingPermKey] = useState<string | null>(null)
  const [permToast, setPermToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const permKey = (roleId: string, permId: string) => `${roleId}::${permId}`

  const loadPermissions = useCallback(async () => {
    setPermLoadState('loading')
    try {
      const res = await apiRaw('/api/role-permissions')
      if (res.ok) {
        const json = await res.json() as { permissions: PermRow[] }
        const map = new Map<string, boolean>()
        for (const row of json.permissions) map.set(permKey(row.role_id, row.permission_id), row.granted)
        // Fill any missing keys with defaults
        for (const role of ROLES) for (const perm of ALL_PERMISSIONS) {
          const k = permKey(role.id, perm.id)
          if (!map.has(k)) map.set(k, (DEFAULT_GRANTS[role.id]?.[perm.id]) ?? false)
        }
        setPermMap(map)
        setPermLoadState('ready')
      } else { throw new Error(`HTTP ${res.status}`) }
    } catch {
      const map = new Map<string, boolean>()
      for (const role of ROLES) for (const perm of ALL_PERMISSIONS)
        map.set(permKey(role.id, perm.id), (DEFAULT_GRANTS[role.id]?.[perm.id]) ?? false)
      setPermMap(map)
      setPermLoadState('ready')
    }
  }, [])

  useEffect(() => { loadPermissions() }, [loadPermissions])

  useEffect(() => {
    if (!permToast) return
    const t = setTimeout(() => setPermToast(null), 2800)
    return () => clearTimeout(t)
  }, [permToast])

  const togglePerm = useCallback(async (roleId: string, permId: string) => {
    if (!isAdmin) return
    const k = permKey(roleId, permId)
    const prev = permMap.get(k) ?? false
    setSavingPermKey(k)
    setPermMap(m => { const n = new Map(m); n.set(k, !prev); return n })
    try {
      const res = await apiRaw('/api/role-permissions/toggle', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId, permissionId: permId }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as { permission: PermRow }
      setPermMap(m => { const n = new Map(m); n.set(k, json.permission.granted); return n })
      const rl = ROLES.find(r => r.id === roleId)?.label ?? roleId
      const pl = ALL_PERMISSIONS.find(p => p.id === permId)?.label ?? permId
      setPermToast({ msg: `${rl} · ${pl} → ${json.permission.granted ? 'Granted ✓' : 'Revoked ✗'}`, type: 'success' })
    } catch (err: any) {
      setPermMap(m => { const n = new Map(m); n.set(k, prev); return n })
      setPermToast({ msg: `Save failed: ${err.message}`, type: 'error' })
    } finally { setSavingPermKey(null) }
  }, [isAdmin, permMap])

  const loadUsers = useCallback(async () => {
    setUsersLoading(true)
    setUsersError(null)
    try {
      const { users: fetched } = await adminUsers.list()
      setUsers(fetched.sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)))
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : 'Failed to load users')
    } finally {
      setUsersLoading(false)
    }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  const filteredUsers = useMemo(() => {
    let list = users
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    }
    if (roleFilter !== 'all') list = list.filter(u => u.role === roleFilter)
    return list
  }, [users, searchQuery, roleFilter])

  const roleColor = (role: string) => ROLES.find(r => r.id === role)?.color || '#64748b'
  const roleLabel = (role: string) => ROLES.find(r => r.id === role)?.label || role

  const openEditUser = (u: User) => {
    setEditUser(u)
    setFormName(u.name)
    setFormEmail(u.email)
    setFormRole(u.role)
    setSaveError(null)
  }

  const openAddUser = () => {
    setShowAddUser(true)
    setFormName('')
    setFormEmail('')
    setFormRole('employee')
    setFormTempPass('')
    setSaveError(null)
  }

  const saveUser = async () => {
    setSaveError(null)
    setSaveSuccess(null)
    setSaving(true)
    try {
      if (editUser) {
        // Update role via real API
        await adminUsers.updateRole(editUser.id, formRole)
        setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, role: formRole } : u))
        setEditUser(null)
        setSaveSuccess('Role updated successfully.')
      } else {
        // Create user via backend
        const { api: apiRaw } = await import('@/lib/api')
        const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''
        const { createClient } = await import('@/utils/supabase/client')
        const { data: session } = await createClient().auth.getSession()
        const token = session.session?.access_token
        const res = await fetch(`${base}/api/admin/create-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ email: formEmail, name: formName, role: formRole, tempPassword: formTempPass }),
        })
        const body = await res.json()
        if (!res.ok) { setSaveError(body.error ?? 'Failed to create user'); return }
        setSaveSuccess(body.message ?? 'User created.')
        setShowAddUser(false)
        await loadUsers()  // refresh the live list
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const permGroups = [...new Set(ALL_PERMISSIONS.map(p => p.group))]

  return (
    <div>
      {permToast && (
        <ToastBar $type={permToast.type}>
          {permToast.type === 'success' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
          {permToast.msg}
        </ToastBar>
      )}
      <PageHeader>
        <PageTitleArea>
          <h1><Shield size={20} /> Admin Panel</h1>
          <p>User management, role configuration, and access control</p>
        </PageTitleArea>
      </PageHeader>

      <StatsGrid>
        <StatBox><h4>Total Users</h4><span>{usersLoading ? '…' : users.length}</span></StatBox>
        <StatBox><h4>Signed In (ever)</h4><span>{usersLoading ? '…' : users.filter(u => u.lastSignIn).length}</span></StatBox>
        <StatBox><h4>Roles Defined</h4><span>{ROLES.length}</span></StatBox>
        <StatBox><h4>Permissions</h4><span>{ALL_PERMISSIONS.length}</span></StatBox>
        <StatBox><h4>Active Grants</h4><span>{[...permMap.values()].filter(Boolean).length}</span></StatBox>
      </StatsGrid>

      <TabBar>
        <Tab $active={activeTab === 'users'} onClick={() => setActiveTab('users')}><Users size={14} /> Users</Tab>
        <Tab $active={activeTab === 'roles'} onClick={() => setActiveTab('roles')}><Shield size={14} /> Roles</Tab>
        <Tab $active={activeTab === 'permissions'} onClick={() => setActiveTab('permissions')}><Lock size={14} /> Permissions Matrix</Tab>
      </TabBar>

      {saveSuccess && (
        <div style={{ padding: '12px 16px', background: 'var(--color-success-bg)', border: '1px solid var(--color-success-border)', borderRadius: 8, color: 'var(--color-success)', fontSize: 13, marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{saveSuccess}</span>
          <button onClick={() => setSaveSuccess(null)} style={{ color: 'var(--color-success)', fontWeight: 600, fontSize: 16, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* ── Users Tab ── */}
      {activeTab === 'users' && (
        <>
          <ToolbarRow>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <SearchBox>
                <Search size={14} />
                <input placeholder="Search users..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              </SearchBox>
              <FilterSelect value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                <option value="all">All Roles</option>
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </FilterSelect>
              <IconBtn onClick={loadUsers} title="Refresh" style={{ padding: '6px 8px', border: '1px solid var(--color-border)', borderRadius: 6 }}>
                {usersLoading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
              </IconBtn>
            </div>
            <AddBtn onClick={openAddUser}><UserPlus size={14} /> Add User</AddBtn>
          </ToolbarRow>
          {usersError && (
            <div style={{ padding: '10px 14px', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 8, color: 'var(--color-danger)', fontSize: 13, marginBottom: 12 }}>
              {usersError}
            </div>
          )}
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th style={{ textAlign: 'center' }}>Confirmed</th>
                <th>Last Sign In</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {usersLoading && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-muted)' }}>Loading users…</td></tr>
              )}
              {!usersLoading && filteredUsers.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-muted)' }}>No users found</td></tr>
              )}
              {filteredUsers.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name || '—'}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{u.email}</td>
                  <td><RolePill $color={roleColor(u.role)}>{roleLabel(u.role)}</RolePill></td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{ fontSize: 12, color: u.confirmed ? 'var(--color-success)' : 'var(--color-text-muted)' }}>
                      {u.confirmed ? '✓ Yes' : 'Pending'}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, color: u.lastSignIn ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                    {fmtDate(u.lastSignIn)}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{fmtDate(u.createdAt)}</td>
                  <td>
                    <ActionBtns>
                      <IconBtn onClick={() => openEditUser(u)} title="Edit role"><Edit2 size={14} /></IconBtn>
                    </ActionBtns>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}

      {/* ── Roles Tab ── */}
      {activeTab === 'roles' && (
        <RolesGrid>
          {ROLES.map(r => {
            const count = users.filter(u => u.role === r.id).length
            const activePerms = ALL_PERMISSIONS.filter(p => permMap.get(permKey(r.id, p.id)))
            return (
              <RoleCard key={r.id}>
                <RoleCardHeader>
                  <RoleIcon $color={r.color}>{r.icon}</RoleIcon>
                  <div>
                    <RoleCardTitle>{r.label}</RoleCardTitle>
                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{activePerms.length} permissions · {count} user{count !== 1 ? 's' : ''}</div>
                  </div>
                </RoleCardHeader>
                <RoleCardDesc>{r.description}</RoleCardDesc>
                <PermissionChips>
                  {activePerms.map(p => <PermChip key={p.id}>{p.label}</PermChip>)}
                  {activePerms.length === 0 && <span style={{ fontSize: 11, color: '#bbb' }}>No permissions granted</span>}
                </PermissionChips>
              </RoleCard>
            )
          })}
        </RolesGrid>
      )}

      {/* ── Permissions Matrix Tab ── */}
      {activeTab === 'permissions' && (
        <>
          <MatrixInfo>
            {permLoadState === 'loading' && <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Loading permissions…</>}
            {permLoadState === 'ready' && isAdmin && <><Save size={13} /> Click any cell to grant or revoke — changes save instantly</>}
            {permLoadState === 'ready' && !isAdmin && <><Eye size={13} /> Read-only · Admin role required to edit</>}
          </MatrixInfo>
          <MatrixWrap>
            <MatrixTable>
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Permission</th>
                  {ROLES.map(r => <th key={r.id} style={{ minWidth: 110, color: r.color }}>{r.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {permGroups.map(group => (
                  <React.Fragment key={group}>
                    <tr><GroupHeader colSpan={ROLES.length + 1}>{group}</GroupHeader></tr>
                    {ALL_PERMISSIONS.filter(p => p.group === group).map(perm => (
                      <tr key={perm.id}>
                        <td>{perm.label}</td>
                        {ROLES.map(role => {
                          const k = permKey(role.id, perm.id)
                          const granted = permMap.get(k) ?? false
                          const isSaving = savingPermKey === k
                          return (
                            <td key={role.id}>
                              <CellBtn
                                $granted={granted} $saving={isSaving} $isAdmin={isAdmin}
                                onClick={() => togglePerm(role.id, perm.id)}
                                title={isAdmin ? (granted ? `Revoke from ${role.label}` : `Grant to ${role.label}`) : undefined}
                              >
                                {isSaving
                                  ? <Loader2 size={13} style={{ animation: `spin 0.7s linear infinite` }} />
                                  : granted ? <Check size={14} /> : <X size={12} />
                                }
                                {isAdmin && (
                                  <CellTooltip>
                                    {granted ? `Revoke from ${role.label}` : `Grant to ${role.label}`}
                                  </CellTooltip>
                                )}
                              </CellBtn>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </MatrixTable>
          </MatrixWrap>
        </>
      )}

      {/* ── Add / Edit User Modal ── */}
      <Modal
        open={showAddUser || !!editUser}
        onClose={() => { setShowAddUser(false); setEditUser(null); setSaveError(null) }}
        title={editUser ? `Edit User — ${editUser.name}` : 'Add New User'}
        subtitle={editUser ? 'Update user details and role assignment' : 'Create a new user account with role assignment'}
        size="md"
      >
        {saveError && (
          <div style={{ padding: '10px 12px', background: 'var(--color-danger-bg)', border: '1px solid var(--color-danger-border)', borderRadius: 6, color: 'var(--color-danger)', fontSize: 13, marginBottom: 16 }}>
            {saveError}
          </div>
        )}
        {editUser ? (
          /* Edit mode: only role is changeable via the API */
          <FormGrid>
            <FormField>
              <FormLabel>User</FormLabel>
              <FormInput value={`${editUser.name} (${editUser.email})`} readOnly style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)' }} />
            </FormField>
            <FormField>
              <FormLabel>Role</FormLabel>
              <FormSelect2 value={formRole} onChange={e => setFormRole(e.target.value)}>
                {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </FormSelect2>
            </FormField>
          </FormGrid>
        ) : (
          /* Add mode: full form */
          <>
            <FormGrid>
              <FormField>
                <FormLabel>Full Name</FormLabel>
                <FormInput value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. John Smith" />
              </FormField>
              <FormField>
                <FormLabel>Email</FormLabel>
                <FormInput value={formEmail} onChange={e => setFormEmail(e.target.value)} placeholder="john.smith@company.com" type="email" />
              </FormField>
            </FormGrid>
            <FormGrid style={{ marginTop: 16 }}>
              <FormField>
                <FormLabel>Role</FormLabel>
                <FormSelect2 value={formRole} onChange={e => setFormRole(e.target.value)}>
                  {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </FormSelect2>
              </FormField>
              <FormField>
                <FormLabel>Temporary Password</FormLabel>
                <FormInput
                  value={formTempPass}
                  onChange={e => setFormTempPass(e.target.value)}
                  placeholder="Min. 8 characters"
                  type="text"
                />
              </FormField>
            </FormGrid>
          </>
        )}
        <ModalActions>
          <CancelBtn onClick={() => { setShowAddUser(false); setEditUser(null); setSaveError(null) }}>Cancel</CancelBtn>
          <SaveBtn onClick={saveUser} disabled={saving}>
            {saving ? 'Saving…' : editUser ? 'Update Role' : 'Create User'}
          </SaveBtn>
        </ModalActions>
      </Modal>
    </div>
  )
}
