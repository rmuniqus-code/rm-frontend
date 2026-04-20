'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import styled from 'styled-components'
import DataTable from '@/components/shared/data-table'
import type { DataTableColumn } from '@/components/shared/data-table'
import FilterBar from '@/components/shared/filter-bar'
import Modal, { Section, SectionTitle, DetailGrid, DetailItem } from '@/components/shared/modal'
import { mockAuditLog, mockResources, type AuditEntry } from '@/data/mock-data'
import { ClipboardList, ArrowRight, Filter, X, RefreshCw } from 'lucide-react'
import { PageLoader } from '@/components/shared/page-loader'

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;

  h1 {
    font-size: 22px;
    font-weight: 700;
  }
`

const TitleIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--border-radius);
  background: var(--color-primary-light);
  color: var(--color-primary);
`

const ActionBadge = styled.span<{ $action: string }>`
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  background: ${p =>
    p.$action === 'Created' ? 'var(--color-success-light)' :
    p.$action === 'Updated' ? 'var(--color-info-light)' :
    p.$action === 'Alert' ? 'var(--color-warning-light)' :
    'var(--color-border-light)'};
  color: ${p =>
    p.$action === 'Created' ? '#15803d' :
    p.$action === 'Updated' ? '#1d4ed8' :
    p.$action === 'Alert' ? '#b45309' :
    'var(--color-text-secondary)'};
`

const EntityTag = styled.span`
  display: inline-flex;
  padding: 2px 8px;
  border-radius: var(--border-radius-sm);
  font-size: 11px;
  font-weight: 500;
  background: var(--color-border-light);
  color: var(--color-text-secondary);
`

const ChangeCell = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
`

const OldValue = styled.span`
  color: var(--color-text-muted);
  text-decoration: line-through;
`

const NewValue = styled.span`
  color: var(--color-text);
  font-weight: 500;
`

const ChangeDetail = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 0;
`

const ChangeBox = styled.div`
  flex: 1;
  padding: 12px 16px;
  border-radius: var(--border-radius);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
`

const ChangeLabel = styled.div`
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
`

const ChangeValue = styled.div<{ $type: string }>`
  font-size: 14px;
  font-weight: 500;
  color: ${p => p.$type === 'old' ? 'var(--color-text-muted)' : 'var(--color-text)'};
  text-decoration: ${p => p.$type === 'old' ? 'line-through' : 'none'};
`

const FilterRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  flex-wrap: wrap;
`

const FilterLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
`

const FilterSelect = styled.select`
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg-card);
  color: var(--color-text);
  font-size: 12px;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`

const MultiSelectWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg-card);
  min-width: 200px;
  min-height: 32px;
  cursor: pointer;
  position: relative;
`

const SelectedPill = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  background: var(--color-primary-light);
  color: var(--color-primary);

  button {
    display: flex;
    align-items: center;
    padding: 0;
    color: var(--color-primary);
    &:hover { color: var(--color-danger); }
  }
`

const MultiDropdown = styled.div<{ $open: boolean }>`
  position: absolute;
  top: 100%;
  left: 0;
  width: 220px;
  max-height: 200px;
  overflow-y: auto;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  box-shadow: var(--shadow-md);
  z-index: 20;
  display: ${p => p.$open ? 'block' : 'none'};
  margin-top: 4px;
`

const MultiOption = styled.div<{ $selected: boolean }>`
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  background: ${p => p.$selected ? 'var(--color-primary-light)' : 'transparent'};
  color: var(--color-text);
  &:hover { background: var(--color-border-light); }
`

const PlaceholderText = styled.span`
  font-size: 12px;
  color: var(--color-text-muted);
`

const columns: DataTableColumn<AuditEntry>[] = [
  {
    key: 'timestamp',
    header: 'Timestamp',
    render: (row) => (
      <span style={{ fontSize: 12, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
        {row.timestamp}
      </span>
    ),
  },
  {
    key: 'user',
    header: 'User',
    render: (row) => <span style={{ fontWeight: 500 }}>{row.user}</span>,
  },
  {
    key: 'action',
    header: 'Action',
    render: (row) => <ActionBadge $action={row.action}>{row.action}</ActionBadge>,
  },
  {
    key: 'entity',
    header: 'Entity',
    render: (row) => <EntityTag>{row.entity}</EntityTag>,
  },
  {
    key: 'entityName',
    header: 'Name',
    render: (row) => <span style={{ fontWeight: 500, fontSize: 13 }}>{row.entityName}</span>,
  },
  {
    key: 'field',
    header: 'Field',
    render: (row) => <span style={{ color: 'var(--color-text-secondary)' }}>{row.field}</span>,
  },
  {
    key: 'change',
    header: 'Change',
    render: (row) => (
      <ChangeCell>
        <OldValue>{row.oldValue}</OldValue>
        <ArrowRight size={12} style={{ color: 'var(--color-text-muted)' }} />
        <NewValue>{row.newValue}</NewValue>
      </ChangeCell>
    ),
  },
]

export default function VersionHistoryPage() {
  const [search, setSearch] = useState('')
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null)
  const [entityFilter, setEntityFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [userDropdownOpen, setUserDropdownOpen] = useState(false)
  const [liveEntries, setLiveEntries] = useState<AuditEntry[]>([])
  const [availableUsers, setAvailableUsers] = useState<string[]>([])
  const [hasLiveData, setHasLiveData] = useState(false)
  const [auditLoading, setAuditLoading] = useState(true)

  // Fetch audit log from API — guarded to prevent concurrent requests
  const fetchingRef = React.useRef(false)
  const fetchAuditLog = useCallback(async () => {
    if (fetchingRef.current) return          // prevent overlapping requests
    fetchingRef.current = true
    setAuditLoading(true)
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (selectedUsers.length > 0) params.set('users', selectedUsers.join(','))
      if (entityFilter !== 'all') params.set('entity', entityFilter)
      if (actionFilter !== 'all') params.set('action', actionFilter)

      const res = await fetch(`/api/audit-log?${params}`)
      if (res.ok) {
        const body = await res.json()
        if (body.entries && body.entries.length > 0) {
          setLiveEntries(body.entries.map((e: any) => ({
            id: e.id,
            timestamp: new Date(e.created_at).toLocaleString(),
            user: e.user_name,
            action: e.action,
            entity: e.entity,
            entityName: e.entity_name ?? '',
            field: e.field ?? '',
            oldValue: e.old_value ?? '',
            newValue: e.new_value ?? '',
          })))
          setHasLiveData(true)
        }
        if (body.users) setAvailableUsers(body.users)
      }
    } catch { /* fall back to mock */ }
    finally { fetchingRef.current = false; setAuditLoading(false) }
  }, [selectedUsers, entityFilter, actionFilter])

  // Initial fetch on mount only (not on every fetchAuditLog ref change)
  const hasFetchedRef = React.useRef(false)
  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true
      fetchAuditLog()
    }
  }, [fetchAuditLog])

  // Re-fetch when filters change (skip the initial mount which is handled above)
  const prevFiltersRef = React.useRef({ selectedUsers, entityFilter, actionFilter })
  useEffect(() => {
    const prev = prevFiltersRef.current
    const filtersChanged =
      prev.entityFilter !== entityFilter ||
      prev.actionFilter !== actionFilter ||
      prev.selectedUsers.length !== selectedUsers.length ||
      prev.selectedUsers.some((u, i) => u !== selectedUsers[i])
    prevFiltersRef.current = { selectedUsers, entityFilter, actionFilter }

    if (filtersChanged) {
      fetchAuditLog()
    }
  }, [selectedUsers, entityFilter, actionFilter, fetchAuditLog])

  const dataSource = hasLiveData ? liveEntries : []

  const entities = useMemo(() => Array.from(new Set(dataSource.map(e => e.entity))), [dataSource])
  const actions = useMemo(() => Array.from(new Set(dataSource.map(e => e.action))), [dataSource])

  // For user multi-select: combine live available users with mock users
  const userOptions = availableUsers.length > 0
    ? availableUsers
    : Array.from(new Set(mockAuditLog.map(e => e.user)))

  const toggleUser = (user: string) => {
    setSelectedUsers(prev =>
      prev.includes(user) ? prev.filter(u => u !== user) : [...prev, user]
    )
  }

  const filtered = useMemo(() => dataSource.filter(entry => {
    if (search &&
      !entry.user.toLowerCase().includes(search.toLowerCase()) &&
      !entry.entityName.toLowerCase().includes(search.toLowerCase()) &&
      !entry.action.toLowerCase().includes(search.toLowerCase())) return false
    if (entityFilter !== 'all' && entry.entity !== entityFilter) return false
    if (actionFilter !== 'all' && entry.action !== actionFilter) return false
    // Multi-select user filter (client-side for mock, server-side for live)
    if (!hasLiveData && selectedUsers.length > 0 && !selectedUsers.includes(entry.user)) return false
    return true
  }), [dataSource, search, entityFilter, actionFilter, selectedUsers, hasLiveData])

  if (auditLoading) return <PageLoader message="Loading audit trail…" />

  return (
    <div>
      <PageHeader>
        <TitleIcon><ClipboardList size={18} /></TitleIcon>
        <h1>Audit Trail</h1>
        <button
          onClick={fetchAuditLog}
          title="Refresh audit log"
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', border: '1px solid var(--color-border)',
            borderRadius: 'var(--border-radius)', background: 'var(--color-bg-card)',
            fontSize: 13, color: 'var(--color-text-secondary)', cursor: 'pointer',
          }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </PageHeader>

      <FilterBar searchPlaceholder="Search audit log..." onSearch={setSearch} />

      <FilterRow>
        <FilterLabel><Filter size={12} /> Entity:</FilterLabel>
        <FilterSelect value={entityFilter} onChange={e => setEntityFilter(e.target.value)}>
          <option value="all">All Entities</option>
          {entities.map(e => <option key={e} value={e}>{e}</option>)}
        </FilterSelect>
        <FilterLabel>Action:</FilterLabel>
        <FilterSelect value={actionFilter} onChange={e => setActionFilter(e.target.value)}>
          <option value="all">All Actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </FilterSelect>
        <FilterLabel>User:</FilterLabel>
        <MultiSelectWrap onClick={() => setUserDropdownOpen(o => !o)}>
          {selectedUsers.length === 0 && <PlaceholderText>All Users</PlaceholderText>}
          {selectedUsers.map(u => (
            <SelectedPill key={u}>
              {u}
              <button onClick={(e) => { e.stopPropagation(); toggleUser(u) }}><X size={10} /></button>
            </SelectedPill>
          ))}
          <MultiDropdown $open={userDropdownOpen}>
            {userOptions.map(u => (
              <MultiOption
                key={u}
                $selected={selectedUsers.includes(u)}
                onClick={(e) => { e.stopPropagation(); toggleUser(u) }}
              >
                {selectedUsers.includes(u) ? '✓ ' : ''}{u}
              </MultiOption>
            ))}
          </MultiDropdown>
        </MultiSelectWrap>
      </FilterRow>

      <DataTable<AuditEntry>
        columns={columns}
        data={filtered}
        emptyMessage="No audit entries found"
        onRowClick={(row) => setSelectedEntry(row)}
      />

      <Modal
        open={!!selectedEntry}
        onClose={() => setSelectedEntry(null)}
        title="Change Detail"
        subtitle={selectedEntry ? `${selectedEntry.entity}: ${selectedEntry.entityName}` : ''}
        size="md"
      >
        {selectedEntry && (
          <>
            <Section>
              <SectionTitle>Change Information</SectionTitle>
              <DetailGrid>
                <DetailItem><label>Timestamp</label><span>{selectedEntry.timestamp}</span></DetailItem>
                <DetailItem><label>User</label><span>{selectedEntry.user}</span></DetailItem>
                <DetailItem><label>Action</label><span><ActionBadge $action={selectedEntry.action}>{selectedEntry.action}</ActionBadge></span></DetailItem>
                <DetailItem><label>Entity</label><span><EntityTag>{selectedEntry.entity}</EntityTag></span></DetailItem>
                <DetailItem><label>Entity Name</label><span>{selectedEntry.entityName}</span></DetailItem>
                <DetailItem><label>Field Changed</label><span>{selectedEntry.field}</span></DetailItem>
              </DetailGrid>
            </Section>
            <Section>
              <SectionTitle>Value Change</SectionTitle>
              <ChangeDetail>
                <ChangeBox>
                  <ChangeLabel>Previous Value</ChangeLabel>
                  <ChangeValue $type="old">{selectedEntry.oldValue}</ChangeValue>
                </ChangeBox>
                <ArrowRight size={20} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                <ChangeBox>
                  <ChangeLabel>New Value</ChangeLabel>
                  <ChangeValue $type="new">{selectedEntry.newValue}</ChangeValue>
                </ChangeBox>
              </ChangeDetail>
            </Section>
          </>
        )}
      </Modal>
    </div>
  )
}
