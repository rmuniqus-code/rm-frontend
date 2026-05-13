'use client'

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import styled from 'styled-components'
import { Shield, Lock, Users, Eye, Check, X } from 'lucide-react'

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

/* ─── Component ────────────────────────────────────── */
export default function RolesPermissionsPage() {
  const [activeTab, setActiveTab] = useState<'roles' | 'permissions'>('roles')
  const permGroups = [...new Set(ALL_PERMISSIONS.map(p => p.group))]

  return (
    <div>
      <PageHeader>
        <PageTitleArea>
          <h1><Lock size={20} /> Roles &amp; Permissions</h1>
          <p>Role definitions and access control matrix</p>
        </PageTitleArea>
      </PageHeader>

      <StatsGrid>
        <StatBox><h4>Roles Defined</h4><span>{ROLES.length}</span></StatBox>
        <StatBox><h4>Permissions</h4><span>{ALL_PERMISSIONS.length}</span></StatBox>
        <StatBox><h4>Permission Groups</h4><span>{permGroups.length}</span></StatBox>
      </StatsGrid>

      <TabBar>
        <Tab $active={activeTab === 'roles'} onClick={() => setActiveTab('roles')}><Shield size={14} /> Roles</Tab>
        <Tab $active={activeTab === 'permissions'} onClick={() => setActiveTab('permissions')}><Lock size={14} /> Permissions Matrix</Tab>
      </TabBar>

      {/* ── Roles Tab ── */}
      {activeTab === 'roles' && (
        <RolesGrid>
          {ROLES.map(r => (
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
            </RoleCard>
          ))}
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
    </div>
  )
}
