'use client'

import React, { useState, useMemo } from 'react'
import styled from 'styled-components'
import Modal, { Section, SectionTitle, DetailGrid, DetailItem } from '@/components/shared/modal'
import { Shield, UserPlus, Edit2, Trash2, Search, ChevronDown, Check, X, Lock, Users, Settings, Eye } from 'lucide-react'

/* ─── Mock Data ────────────────────────────────────── */
interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'rm' | 'slh' | 'employee' | 'viewer'
  location: string
  department: string
  status: 'active' | 'inactive'
  lastLogin: string
}

const MOCK_USERS: User[] = [
  { id: '1', name: 'Raj Patel', email: 'raj.patel@company.com', role: 'admin', location: 'Mumbai', department: 'IT', status: 'active', lastLogin: '2026-04-07' },
  { id: '2', name: 'Sarah Chen', email: 'sarah.chen@company.com', role: 'rm', location: 'New York', department: 'ARC', status: 'active', lastLogin: '2026-04-06' },
  { id: '3', name: 'Michael Torres', email: 'michael.t@company.com', role: 'slh', location: 'New York', department: 'Consulting', status: 'active', lastLogin: '2026-04-05' },
  { id: '4', name: 'Priya Kapoor', email: 'priya.k@company.com', role: 'employee', location: 'Mumbai', department: 'GRC', status: 'active', lastLogin: '2026-04-07' },
  { id: '5', name: 'James Wilson', email: 'james.w@company.com', role: 'employee', location: 'London', department: 'Tax', status: 'inactive', lastLogin: '2026-03-15' },
  { id: '6', name: 'Ananya Sharma', email: 'ananya.s@company.com', role: 'rm', location: 'Singapore', department: 'ARC', status: 'active', lastLogin: '2026-04-06' },
  { id: '7', name: 'David Lee', email: 'david.lee@company.com', role: 'viewer', location: 'Mumbai', department: 'Finance', status: 'active', lastLogin: '2026-04-04' },
  { id: '8', name: 'Lisa Wang', email: 'lisa.wang@company.com', role: 'employee', location: 'Bangalore', department: 'Tech Consulting', status: 'active', lastLogin: '2026-04-07' },
]

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
  padding-top: 14px !important;
`

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
  const [activeTab, setActiveTab] = useState<'users' | 'roles' | 'permissions'>('users')
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [users, setUsers] = useState<User[]>(MOCK_USERS)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [showAddUser, setShowAddUser] = useState(false)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formRole, setFormRole] = useState<User['role']>('employee')
  const [formLocation, setFormLocation] = useState('')
  const [formDepartment, setFormDepartment] = useState('')

  const filteredUsers = useMemo(() => {
    let list = users
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      list = list.filter(u => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    }
    if (roleFilter !== 'all') list = list.filter(u => u.role === roleFilter)
    if (statusFilter !== 'all') list = list.filter(u => u.status === statusFilter)
    return list
  }, [users, searchQuery, roleFilter, statusFilter])

  const roleColor = (role: string) => ROLES.find(r => r.id === role)?.color || '#64748b'
  const roleLabel = (role: string) => ROLES.find(r => r.id === role)?.label || role

  const openEditUser = (u: User) => {
    setEditUser(u)
    setFormName(u.name)
    setFormEmail(u.email)
    setFormRole(u.role)
    setFormLocation(u.location)
    setFormDepartment(u.department)
  }

  const openAddUser = () => {
    setShowAddUser(true)
    setFormName('')
    setFormEmail('')
    setFormRole('employee')
    setFormLocation('')
    setFormDepartment('')
  }

  const saveUser = () => {
    if (editUser) {
      setUsers(prev => prev.map(u => u.id === editUser.id ? { ...u, name: formName, email: formEmail, role: formRole, location: formLocation, department: formDepartment } : u))
      setEditUser(null)
    } else {
      setUsers(prev => [...prev, { id: String(Date.now()), name: formName, email: formEmail, role: formRole, location: formLocation, department: formDepartment, status: 'active', lastLogin: '—' }])
      setShowAddUser(false)
    }
  }

  const toggleUserStatus = (id: string) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' } : u))
  }

  const permGroups = [...new Set(ALL_PERMISSIONS.map(p => p.group))]

  return (
    <div>
      <PageHeader>
        <PageTitleArea>
          <h1><Shield size={20} /> Admin Panel</h1>
          <p>User management, role configuration, and access control</p>
        </PageTitleArea>
      </PageHeader>

      <StatsGrid>
        <StatBox><h4>Total Users</h4><span>{users.length}</span></StatBox>
        <StatBox><h4>Active Users</h4><span>{users.filter(u => u.status === 'active').length}</span></StatBox>
        <StatBox><h4>Roles Defined</h4><span>{ROLES.length}</span></StatBox>
        <StatBox><h4>Permissions</h4><span>{ALL_PERMISSIONS.length}</span></StatBox>
      </StatsGrid>

      <TabBar>
        <Tab $active={activeTab === 'users'} onClick={() => setActiveTab('users')}><Users size={14} /> Users</Tab>
        <Tab $active={activeTab === 'roles'} onClick={() => setActiveTab('roles')}><Shield size={14} /> Roles</Tab>
        <Tab $active={activeTab === 'permissions'} onClick={() => setActiveTab('permissions')}><Lock size={14} /> Permissions Matrix</Tab>
      </TabBar>

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
              <FilterSelect value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </FilterSelect>
            </div>
            <AddBtn onClick={openAddUser}><UserPlus size={14} /> Add User</AddBtn>
          </ToolbarRow>
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Location</th>
                <th>Department</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name}</td>
                  <td style={{ color: 'var(--color-text-secondary)' }}>{u.email}</td>
                  <td><RolePill $color={roleColor(u.role)}>{roleLabel(u.role)}</RolePill></td>
                  <td>{u.location}</td>
                  <td>{u.department}</td>
                  <td><StatusBadge $active={u.status === 'active'}>{u.status === 'active' ? 'Active' : 'Inactive'}</StatusBadge></td>
                  <td style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{u.lastLogin}</td>
                  <td>
                    <ActionBtns>
                      <IconBtn onClick={() => openEditUser(u)} title="Edit"><Edit2 size={14} /></IconBtn>
                      <IconBtn onClick={() => toggleUserStatus(u.id)} title="Toggle status"><Settings size={14} /></IconBtn>
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
            return (
              <RoleCard key={r.id}>
                <RoleCardHeader>
                  <RoleIcon $color={r.color}>{r.icon}</RoleIcon>
                  <RoleCardTitle>{r.label}</RoleCardTitle>
                </RoleCardHeader>
                <RoleCardDesc>{r.description}</RoleCardDesc>
                <PermissionChips>
                  {r.permissions.map(p => {
                    const perm = ALL_PERMISSIONS.find(ap => ap.id === p)
                    return <PermChip key={p}>{perm?.label || p}</PermChip>
                  })}
                </PermissionChips>
                <UserCount>{count} user{count !== 1 ? 's' : ''} assigned</UserCount>
              </RoleCard>
            )
          })}
        </RolesGrid>
      )}

      {/* ── Permissions Matrix Tab ── */}
      {activeTab === 'permissions' && (
        <MatrixTable>
          <thead>
            <tr>
              <th style={{ minWidth: 180 }}>Permission</th>
              {ROLES.map(r => <th key={r.id}>{r.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {permGroups.map(group => (
              <React.Fragment key={`g-${group}`}>
                <tr>
                  <GroupHeader colSpan={ROLES.length + 1}>{group}</GroupHeader>
                </tr>
                {ALL_PERMISSIONS.filter(p => p.group === group).map(perm => (
                  <tr key={perm.id}>
                    <td>{perm.label}</td>
                    {ROLES.map(r => (
                      <td key={r.id}>
                        <CheckIcon $active={r.permissions.includes(perm.id)}>
                          {r.permissions.includes(perm.id) ? <Check size={13} /> : <X size={11} />}
                        </CheckIcon>
                      </td>
                    ))}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </MatrixTable>
      )}

      {/* ── Add / Edit User Modal ── */}
      <Modal
        open={showAddUser || !!editUser}
        onClose={() => { setShowAddUser(false); setEditUser(null) }}
        title={editUser ? `Edit User — ${editUser.name}` : 'Add New User'}
        subtitle={editUser ? 'Update user details and role assignment' : 'Create a new user account with role assignment'}
        size="md"
      >
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
            <FormSelect2 value={formRole} onChange={e => setFormRole(e.target.value as User['role'])}>
              {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
            </FormSelect2>
          </FormField>
          <FormField>
            <FormLabel>Location</FormLabel>
            <FormInput value={formLocation} onChange={e => setFormLocation(e.target.value)} placeholder="e.g. Mumbai" />
          </FormField>
        </FormGrid>
        <FormField style={{ marginTop: 16 }}>
          <FormLabel>Department</FormLabel>
          <FormInput value={formDepartment} onChange={e => setFormDepartment(e.target.value)} placeholder="e.g. ARC" />
        </FormField>
        <ModalActions>
          <CancelBtn onClick={() => { setShowAddUser(false); setEditUser(null) }}>Cancel</CancelBtn>
          <SaveBtn onClick={saveUser}>{editUser ? 'Save Changes' : 'Create User'}</SaveBtn>
        </ModalActions>
      </Modal>
    </div>
  )
}
