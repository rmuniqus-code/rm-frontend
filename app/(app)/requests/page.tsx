'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import styled from 'styled-components'
import DataTable from '@/components/shared/data-table'
import type { DataTableColumn } from '@/components/shared/data-table'
import StatusBadge from '@/components/shared/status-badge'
import FilterBar, { SelectFilter } from '@/components/shared/filter-bar'
import Modal, { Section, SectionTitle, DetailGrid, DetailItem } from '@/components/shared/modal'
import type { ResourceRequest } from '@/data/request-data'
import { useRequests } from '@/components/shared/requests-context'
import { useRole } from '@/components/shared/role-context'
import RoleGuard from '@/components/shared/role-guard'
import { Plus, MoreVertical, Users, Upload, Download, CheckSquare, FileText, Pencil, Trash2, Clock, Eye, List, ThumbsUp, X } from 'lucide-react'
import { useToast } from '@/components/shared/toast'
import RaiseRequestForm from '@/components/requests/raise-request-form'
import type { RequestFormData } from '@/components/requests/raise-request-form'
import ReviewProfilesModal from '@/components/requests/review-profiles-modal'
import ShortlistResourcesModal from '@/components/requests/shortlist-resources-modal'
import { apiRaw } from '@/lib/api'
import { parseDisplayDateToISO, countWorkingDaysISO, parseHoursString, computeTotalHours, formatTotalHours } from '@/lib/hours-calc'
import { PageLoader } from '@/components/shared/page-loader'

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
  flex-wrap: wrap;
  gap: 12px;
`
const PageTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  h1 { font-size: 22px; font-weight: 700; color: var(--color-text); }
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
const ActionRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`
const PrimaryBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--color-primary);
  color: #fff;
  border-radius: var(--border-radius);
  font-size: 13px;
  font-weight: 500;
  transition: background var(--transition-fast);
  &:hover { background: var(--color-primary-hover); }
`
const OutlineBtn = styled(PrimaryBtn)`
  background: var(--color-bg-card);
  color: var(--color-text-secondary);
  border: 1px solid var(--color-border);
  &:hover { background: var(--color-border-light); color: var(--color-text); }
`
const GradientBtn = styled(PrimaryBtn)`
  background: linear-gradient(135deg, var(--color-primary), #6366f1);
  box-shadow: 0 2px 8px rgba(99,102,241,0.25);
  &:hover { box-shadow: 0 4px 14px rgba(99,102,241,0.35); opacity: 0.95; }
`
const TabBar = styled.div`
  display: flex;
  border-bottom: 2px solid var(--color-border);
  margin-bottom: 20px;
`
const Tab = styled.button<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 20px;
  font-size: 13px;
  font-weight: ${(p: { $active: boolean }) => p.$active ? 600 : 400};
  color: ${(p: { $active: boolean }) => p.$active ? 'var(--color-primary)' : 'var(--color-text-secondary)'};
  border-bottom: 2px solid ${(p: { $active: boolean }) => p.$active ? 'var(--color-primary)' : 'transparent'};
  margin-bottom: -2px;
  white-space: nowrap;
  transition: all 0.15s;
  &:hover { color: var(--color-primary); }
`
const TabBadge = styled.span<{ $color?: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  font-size: 10px;
  font-weight: 700;
  background: ${(p: { $color?: string }) => p.$color ?? 'var(--color-border-light)'};
  color: ${(p: { $color?: string }) => p.$color ? '#fff' : 'var(--color-text-secondary)'};
`
const ViewControls = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
`
const ViewLabel = styled.span`
  font-size: 13px;
  color: var(--color-text-secondary);
`
const ResourceCell = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`
const Avatar = styled.div<{ $color: string }>`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: ${(p: { $color: string }) => p.$color};
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
`
const DurationCell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`
const DurationTotal = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text);
`
const DurationRange = styled.span`
  font-size: 11px;
  color: var(--color-text-muted);
`
const ProjectCell = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`
const ProjectDot = styled.span<{ $color: string }>`
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: ${(p: { $color: string }) => p.$color};
  flex-shrink: 0;
`
const RequestTypeCell = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);
  svg { width: 14px; height: 14px; }
`
const MoreButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--border-radius-sm);
  color: var(--color-text-muted);
  &:hover { background: var(--color-border-light); color: var(--color-text); }
`
const BookingBadge = styled.span<{ $type: string }>`
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: ${(p: { $type: string }) => p.$type === 'Confirmed' ? 'var(--color-success-light)' : '#fef3c7'};
  color: ${(p: { $type: string }) => p.$type === 'Confirmed' ? '#15803d' : '#92400e'};
`
const ActionButtons = styled.div`
  display: flex;
  gap: 4px;
`
const ApproveBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--border-radius-sm);
  background: var(--color-success-light);
  color: var(--color-success);
  transition: all var(--transition-fast);
  &:hover { background: var(--color-success); color: #fff; }
`

const ModalActionRow = styled.div`
  display: flex;
  gap: 8px;
`
const ModalApproveBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: var(--border-radius);
  background: var(--color-success);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  &:hover { background: #16a34a; }
`

const ModalSmartAllocBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: var(--border-radius);
  background: linear-gradient(135deg, var(--color-primary), #6366f1);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: opacity var(--transition-fast);
  &:hover { opacity: 0.9; }
`
const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-muted);
  font-size: 14px;
`

const GroupHeader = styled.div`
  padding: 8px 14px;
  background: var(--color-border-light);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius) var(--border-radius) 0 0;
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-top: 12px;
`

const SummaryCardsRow = styled.div`
  display: flex;
  gap: 16px;
  margin-bottom: 20px;
  flex-wrap: wrap;
`
const SummaryCard = styled.div`
  padding: 14px 24px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  min-width: 160px;
`
const SummaryLabel = styled.div`
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
`
const SummaryValue = styled.div<{ $color?: string }>`
  font-size: 24px;
  font-weight: 800;
  color: ${p => p.$color || 'var(--color-text)'};
  line-height: 1.3;
`

const MoreMenuFixed = styled.div<{ $top: number; $left: number }>`
  position: fixed;
  top: ${p => p.$top}px;
  left: ${p => p.$left}px;
  width: 140px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  box-shadow: var(--shadow-lg);
  z-index: 9999;
  overflow: hidden;
`

const MoreMenuItem = styled.button<{ $danger?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  font-size: 13px;
  color: ${p => p.$danger ? 'var(--color-danger)' : 'var(--color-text)'};
  text-align: left;
  &:hover {
    background: ${p => p.$danger ? 'var(--color-danger-light)' : 'var(--color-border-light)'};
  }
`

function getInitials(name: string) {
  return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
}
function getAvatarColor(name: string) {
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4', '#ef4444']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

const baseColumns: DataTableColumn<ResourceRequest>[] = [
  { key: 'id', header: 'ID', width: '80px', render: (row) => <span style={{ fontWeight: 500, color: 'var(--color-text-secondary)' }}>{row.id}</span> },
  { key: 'resourceRequested', header: 'Resource requested', render: (row) => (<ResourceCell><Avatar $color={getAvatarColor(row.resourceRequested)}>{getInitials(row.resourceRequested)}</Avatar><span>{row.resourceRequested}</span></ResourceCell>) },
  { key: 'duration', header: 'Total Hours', render: (row) => {
    const startISO = row.startDateISO ?? parseDisplayDateToISO(row.durationStart)
    const endISO = row.endDateISO ?? parseDisplayDateToISO(row.durationEnd)
    const days = countWorkingDaysISO(startISO, endISO)
    const hpd = parseHoursString(row.hoursPerDay)
    const total = computeTotalHours(hpd, days)
    return (
      <DurationCell>
        <DurationTotal><Clock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />{formatTotalHours(total)}</DurationTotal>
        <DurationRange>{row.durationStart} – {row.durationEnd}</DurationRange>
      </DurationCell>
    )
  }},
  { key: 'approvalStatus', header: 'Status', render: (row) => <StatusBadge status={row.approvalStatus} /> },
  { key: 'requestType', header: 'Request type', render: (row) => (<RequestTypeCell><Users />{row.requestType}</RequestTypeCell>) },
  { key: 'bookingType', header: 'Booking', render: (row) => <BookingBadge $type={row.bookingType}>{row.bookingType}</BookingBadge> },
  { key: 'projectName', header: 'Project', render: (row) => (<ProjectCell><ProjectDot $color={row.projectColor} /><span>{row.projectName}</span></ProjectCell>) },
  { key: 'hours', header: 'Hrs/Day', align: 'right', render: (row) => <span style={{ fontWeight: 500 }}>{row.hoursPerDay}</span> },
  { key: 'primarySkill', header: 'Skill', render: (row) => <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{row.primarySkill || '—'}</span> },
  { key: 'subServiceLine', header: 'Sub-Service Line', render: (row) => <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{row.subServiceLine || '—'}</span> },
]

export default function RequestsPage() {
  const { addToast } = useToast()
  const { requests, updateStatus, deleteRequest, refresh: refreshRequests, loading: requestsLoading, getShortlistedResources, emApprove, shortlistResources } = useRequests()
  const { canApprove, canShortlist } = useRole()

  const [activeTab, setActiveTab] = useState<'my' | 'approvals'>('my')
  const [groupBy, setGroupBy] = useState<'none' | 'status' | 'project' | 'type'>('none')
  const [search, setSearch] = useState('')
  const [selectedRequest, setSelectedRequest] = useState<ResourceRequest | null>(null)
  const [raiseFormOpen, setRaiseFormOpen] = useState(false)
  const [editingRequest, setEditingRequest] = useState<ResourceRequest | null>(null)
  const [reviewProfilesRequest, setReviewProfilesRequest] = useState<ResourceRequest | null>(null)
  const [shortlistingRequest, setShortlistingRequest] = useState<ResourceRequest | null>(null)
  const [approvingRequest, setApprovingRequest] = useState<ResourceRequest | null>(null)
  const [approving, setApproving] = useState(false)
  const [openMenuId, setOpenMenuId] = useState<number | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  const openMenu = useCallback((id: number, btnEl: HTMLElement) => {
    const rect = btnEl.getBoundingClientRect()
    // Position the menu above the button, right-aligned
    setMenuPos({ top: rect.top - 80, left: rect.right - 140 })
    setOpenMenuId(prev => prev === id ? null : id)
  }, [])

  // Close any open row-menu when clicking elsewhere on the page
  useEffect(() => {
    if (openMenuId === null) return
    const close = () => setOpenMenuId(null)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [openMenuId])

  const pendingCount     = requests.filter(r => r.approvalStatus === 'todo').length
  const shortlistedCount = requests.filter(r => r.approvalStatus === 'shortlisted').length

  const displayedRequests = requests.filter(r =>
    !search ||
    r.resourceRequested.toLowerCase().includes(search.toLowerCase()) ||
    r.projectName.toLowerCase().includes(search.toLowerCase()) ||
    String(r.id).includes(search)
  )

  const handleShortlistSubmit = async (payload: { resources: Array<{ employee_id?: string; employee_name: string; grade?: string; service_line?: string; sub_service_line?: string; location?: string; utilization_pct?: number; fit_score?: number }> }) => {
    const req = shortlistingRequest
    if (!req?.uuid) return
    try {
      await shortlistResources(req.uuid, payload.resources)
      addToast(`${payload.resources.length} profile${payload.resources.length > 1 ? 's' : ''} sent to EM/EP for review — Request #${req.id}`, 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Shortlisting failed', 'error')
    }
    setShortlistingRequest(null)
    setSelectedRequest(null)
  }

  const handleFinalApprove = async () => {
    const req = approvingRequest
    if (!req) return
    setApproving(true)
    try {
      await updateStatus(req.id, 'approved')
      addToast(`Request #${req.id} approved — ${req.resourceRequested} allocated to ${req.projectName}`, 'success')
      setApprovingRequest(null)
      setSelectedRequest(null)
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Final approval failed', 'error')
    } finally {
      setApproving(false)
    }
  }

  const handleReject = async (req: ResourceRequest) => {
    try {
      await updateStatus(req.id, 'blocked')
      addToast(`Request #${req.id} rejected`, 'success')
      setApprovingRequest(null)
      setSelectedRequest(null)
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Rejection failed', 'error')
    }
  }

  // Summary stats for allocation screen
  const summaryStats = useMemo(() => {
    const totalHours = displayedRequests.reduce((sum, r) => {
      const startISO = r.startDateISO ?? parseDisplayDateToISO(r.durationStart)
      const endISO = r.endDateISO ?? parseDisplayDateToISO(r.durationEnd)
      const days = countWorkingDaysISO(startISO, endISO)
      const hpd = parseHoursString(r.hoursPerDay)
      return sum + computeTotalHours(hpd, days)
    }, 0)
    const unallocatedHours = displayedRequests
      .filter(r => r.approvalStatus === 'todo')
      .reduce((sum, r) => {
        const startISO = r.startDateISO ?? parseDisplayDateToISO(r.durationStart)
        const endISO = r.endDateISO ?? parseDisplayDateToISO(r.durationEnd)
        const days = countWorkingDaysISO(startISO, endISO)
        const hpd = parseHoursString(r.hoursPerDay)
        return sum + computeTotalHours(hpd, days)
      }, 0)
    return { totalHours, unallocatedHours }
  }, [displayedRequests])

  const approvalColumns: DataTableColumn<ResourceRequest>[] = [
    ...baseColumns,
    {
      key: 'actions', header: '', width: '160px',
      render: (row: ResourceRequest) => (
        <ActionButtons>
          {row.approvalStatus === 'todo' && canShortlist && (
            <ApproveBtn
              title="Shortlist Resources for EM/EP Review"
              style={{ width: 'auto', padding: '0 10px', gap: 5, fontSize: 12, fontWeight: 600, background: '#fef9c3', color: '#a16207' }}
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); setShortlistingRequest(row) }}
            >
              <List size={13} /> Shortlist
            </ApproveBtn>
          )}
          {row.approvalStatus === 'shortlisted' && (
            <span style={{ fontSize: 11, color: '#a16207', fontStyle: 'italic' }}>Awaiting EM/EP</span>
          )}
          {row.approvalStatus === 'em_approved' && (
            <>
              <ApproveBtn
                title="Final Approve & Allocate"
                style={{ width: 'auto', padding: '0 10px', gap: 5, fontSize: 12, fontWeight: 600 }}
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); setApprovingRequest(row) }}
              >
                <ThumbsUp size={13} /> Approve
              </ApproveBtn>
              <ApproveBtn
                title="Reject"
                style={{ width: 28, background: 'var(--color-danger-light)', color: 'var(--color-danger)' }}
                onClick={(e: React.MouseEvent) => { e.stopPropagation(); handleReject(row) }}
              >
                <X size={13} />
              </ApproveBtn>
            </>
          )}
        </ActionButtons>
      ),
    },
  ]

  const myColumns: DataTableColumn<ResourceRequest>[] = [
    ...baseColumns,
    { key: 'actions', header: '', width: '80px', render: (row: ResourceRequest) => (
      <div style={{ display: 'flex', gap: 4 }}>
        {row.approvalStatus === 'shortlisted' && (
          <ApproveBtn
            title="Review Profiles"
            style={{ width: 'auto', padding: '0 10px', gap: 4, fontSize: 12, fontWeight: 600, background: '#dbeafe', color: '#1d4ed8' }}
            onClick={(e: React.MouseEvent) => { e.stopPropagation(); setReviewProfilesRequest(row) }}
          >
            <Eye size={13} /> Review
          </ApproveBtn>
        )}
        <MoreButton onClick={(e: React.MouseEvent) => {
          e.stopPropagation()
          openMenu(row.id, e.currentTarget as HTMLElement)
        }}>
          <MoreVertical size={16} />
        </MoreButton>
      </div>
    ) },
  ]

  if (requestsLoading) return <PageLoader message="Loading requests…" />

  return (
    <div>
      <PageHeader>
        <PageTitle>
          <TitleIcon>{activeTab === 'my' ? <FileText size={18} /> : <CheckSquare size={18} />}</TitleIcon>
          <h1>{activeTab === 'my' ? 'Resource Requests' : 'Resource Allocations'}</h1>
        </PageTitle>
        <ActionRow>
          {activeTab === 'my' && (
            <>
              <PrimaryBtn onClick={() => { setEditingRequest(null); setRaiseFormOpen(true) }}><Plus size={16} /> New Request</PrimaryBtn>
              <OutlineBtn onClick={() => addToast('Bulk upload — select a CSV file', 'info')}><Upload size={16} /> Bulk Upload</OutlineBtn>
              <OutlineBtn onClick={() => {
                const headers = ['ID','Resource Requested','Project','Role','Grade','Primary Skill','Start','End','Hours/Day','Total Hours','Booking Type','Request Type','Status','Requested By','Requested Date']
                const rows = displayedRequests.map(r => [
                  r.id, r.resourceRequested, r.projectName, r.role ?? '', r.grade ?? '', r.primarySkill ?? '',
                  r.durationStart, r.durationEnd, r.hoursPerDay, r.hours,
                  r.bookingType, r.requestType, r.approvalStatus, r.requestedBy, r.requestedDate
                ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
                const csv = [headers.join(','), ...rows].join('\n')
                const a = document.createElement('a')
                a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
                a.download = `requests-${new Date().toISOString().slice(0,10)}.csv`
                a.click()
                URL.revokeObjectURL(a.href)
                addToast('Requests exported as CSV', 'success')
              }}><Download size={16} /> Export</OutlineBtn>
            </>
          )}
        </ActionRow>
      </PageHeader>

      <TabBar>
        <Tab $active={activeTab === 'my'} onClick={() => { setActiveTab('my'); setSearch('') }}>
          <FileText size={14} /> My Requests <TabBadge>{requests.length}</TabBadge>
          {shortlistedCount > 0 && <TabBadge $color="var(--color-primary)">{shortlistedCount} to review</TabBadge>}
        </Tab>
        {canApprove && (
          <Tab $active={activeTab === 'approvals'} onClick={() => { setActiveTab('approvals'); setSearch('') }}>
            <CheckSquare size={14} /> Approvals
            {pendingCount > 0 && <TabBadge $color="var(--color-danger)">{pendingCount}</TabBadge>}
          </Tab>
        )}
      </TabBar>

      <ViewControls>
        <ViewLabel>Group by:</ViewLabel>
        <SelectFilter value={groupBy} onChange={e => setGroupBy(e.target.value as typeof groupBy)}>
          <option value="none">None</option>
          <option value="status">Status</option>
          <option value="project">Project</option>
          <option value="type">Request Type</option>
        </SelectFilter>
      </ViewControls>

      <FilterBar searchPlaceholder="Search requests..." onSearch={setSearch} />

      {activeTab === 'approvals' && (
        <SummaryCardsRow>
          <SummaryCard>
            <SummaryLabel>Total Hours (All Requests)</SummaryLabel>
            <SummaryValue>{formatTotalHours(summaryStats.totalHours)}</SummaryValue>
          </SummaryCard>
          <SummaryCard>
            <SummaryLabel>Unallocated Hours</SummaryLabel>
            <SummaryValue $color="var(--color-danger)">{formatTotalHours(summaryStats.unallocatedHours)}</SummaryValue>
          </SummaryCard>
        </SummaryCardsRow>
      )}

      {activeTab === 'my' && shortlistedCount > 0 && (
        <div style={{
          padding: '12px 16px', marginBottom: 16,
          background: 'var(--color-primary-light)', border: '1px solid var(--color-brand-tint-border)',
          borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>👤</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)' }}>
                {shortlistedCount} request{shortlistedCount !== 1 ? 's' : ''} waiting for your review
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
                The RM has shortlisted candidates — click <strong>Review</strong> on any highlighted row to select your preferred resource.
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'my' && (() => {
        if (groupBy === 'none') return (
          <DataTable<ResourceRequest> columns={myColumns} data={displayedRequests} onRowClick={(row) => setSelectedRequest(row)} emptyMessage="No resource requests found" />
        )
        const groupKey = (r: ResourceRequest) =>
          groupBy === 'status' ? r.approvalStatus :
          groupBy === 'project' ? r.projectName :
          r.requestType
        const groupLabel: Record<string, string> = { todo: 'Pending', approved: 'Approved', blocked: 'Blocked' }
        const groups = [...new Map(displayedRequests.map(r => [groupKey(r), true])).keys()]
        return groups.map(g => (
          <div key={g}>
            <GroupHeader>{groupBy === 'status' ? (groupLabel[g] ?? g) : g} ({displayedRequests.filter(r => groupKey(r) === g).length})</GroupHeader>
            <DataTable<ResourceRequest> columns={myColumns} data={displayedRequests.filter(r => groupKey(r) === g)} onRowClick={(row) => setSelectedRequest(row)} emptyMessage="No resource requests found" />
          </div>
        ))
      })()}

      {activeTab === 'approvals' && canApprove && (() => {
        if (groupBy === 'none') return (
          <DataTable<ResourceRequest> columns={approvalColumns} data={displayedRequests} onRowClick={(row) => setSelectedRequest(row)} emptyMessage="No pending approvals" />
        )
        const groupKey = (r: ResourceRequest) =>
          groupBy === 'status' ? r.approvalStatus :
          groupBy === 'project' ? r.projectName :
          r.requestType
        const groupLabel: Record<string, string> = { todo: 'Pending', approved: 'Approved', blocked: 'Blocked' }
        const groups = [...new Map(displayedRequests.map(r => [groupKey(r), true])).keys()]
        return groups.map(g => (
          <div key={g}>
            <GroupHeader>{groupBy === 'status' ? (groupLabel[g] ?? g) : g} ({displayedRequests.filter(r => groupKey(r) === g).length})</GroupHeader>
            <DataTable<ResourceRequest> columns={approvalColumns} data={displayedRequests.filter(r => groupKey(r) === g)} onRowClick={(row) => setSelectedRequest(row)} emptyMessage="No pending approvals" />
          </div>
        ))
      })()}

      {activeTab === 'approvals' && !canApprove && (
        <EmptyState>You do not have permission to view approvals.</EmptyState>
      )}

      <Modal
        open={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        title={activeTab === 'approvals' ? `Allocation Request #${selectedRequest?.id}` : `Request #${selectedRequest?.id}`}
        subtitle={selectedRequest?.projectName}
        size="md"
        footer={
          activeTab === 'my' && selectedRequest?.approvalStatus === 'shortlisted' ? (
            <ModalActionRow>
              <ModalApproveBtn
                onClick={() => { setReviewProfilesRequest(selectedRequest!); setSelectedRequest(null) }}
                style={{ background: '#1d4ed8' }}
              >
                <Eye size={14} /> Review Shortlisted Profiles
              </ModalApproveBtn>
            </ModalActionRow>
          ) : activeTab === 'approvals' && canShortlist && selectedRequest?.approvalStatus === 'todo' ? (
            <ModalActionRow>
              <ModalApproveBtn
                onClick={() => { setShortlistingRequest(selectedRequest!); setSelectedRequest(null) }}
                style={{ background: '#a16207' }}
              >
                <List size={14} /> Shortlist Resources
              </ModalApproveBtn>
            </ModalActionRow>
          ) : activeTab === 'approvals' && canApprove && selectedRequest?.approvalStatus === 'em_approved' ? (
            <ModalActionRow>
              <ModalApproveBtn onClick={() => { setApprovingRequest(selectedRequest!); setSelectedRequest(null) }}>
                <ThumbsUp size={14} /> Final Approve
              </ModalApproveBtn>
              <ModalSmartAllocBtn
                onClick={() => handleReject(selectedRequest!)}
                style={{ background: 'var(--color-danger)' }}
              >
                <X size={14} /> Reject
              </ModalSmartAllocBtn>
            </ModalActionRow>
          ) : undefined
        }
      >
        {selectedRequest && (
          <>
            <Section>
              <SectionTitle>Request Details</SectionTitle>
              <DetailGrid $cols={3}>
                <DetailItem><label>Resource</label><span>{selectedRequest.resourceRequested}</span></DetailItem>
                <DetailItem><label>Request Type</label><span>{selectedRequest.requestType}</span></DetailItem>
                <DetailItem><label>Booking</label><span><BookingBadge $type={selectedRequest.bookingType}>{selectedRequest.bookingType}</BookingBadge></span></DetailItem>
                <DetailItem><label>Project</label><span>{selectedRequest.projectName}</span></DetailItem>
                <DetailItem><label>Status</label><span><StatusBadge status={selectedRequest.approvalStatus} /></span></DetailItem>
                <DetailItem><label>Role</label><span>{selectedRequest.role || '&#x2014;'}</span></DetailItem>
                <DetailItem><label>Grade</label><span>{selectedRequest.grade || '&#x2014;'}</span></DetailItem>
                <DetailItem><label>Primary Skill</label><span>{selectedRequest.primarySkill || '&#x2014;'}</span></DetailItem>
                <DetailItem><label>Sector</label><span>{selectedRequest.sector || '&#x2014;'}</span></DetailItem>
              </DetailGrid>
            </Section>
            <Section>
              <SectionTitle>Schedule & Effort</SectionTitle>
              <DetailGrid>
                <DetailItem><label>Duration</label><span>{selectedRequest.durationStart} – {selectedRequest.durationEnd}</span></DetailItem>
                <DetailItem><label>Hours/Day</label><span>{selectedRequest.hoursPerDay}</span></DetailItem>
                <DetailItem><label>Working Days</label><span>{countWorkingDaysISO(
                  selectedRequest.startDateISO ?? parseDisplayDateToISO(selectedRequest.durationStart),
                  selectedRequest.endDateISO ?? parseDisplayDateToISO(selectedRequest.durationEnd)
                )}</span></DetailItem>
                <DetailItem><label>Total Hours</label><span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{formatTotalHours(
                  computeTotalHours(
                    parseHoursString(selectedRequest.hoursPerDay),
                    countWorkingDaysISO(
                      selectedRequest.startDateISO ?? parseDisplayDateToISO(selectedRequest.durationStart),
                      selectedRequest.endDateISO ?? parseDisplayDateToISO(selectedRequest.durationEnd)
                    )
                  )
                )}</span></DetailItem>
                <DetailItem><label>Requested By</label><span>{selectedRequest.requestedBy}</span></DetailItem>
              </DetailGrid>
            </Section>
            <Section>
              <SectionTitle>Timeline</SectionTitle>
              <DetailGrid $cols={1}>
                <DetailItem><label>Requested On</label><span>{selectedRequest.requestedDate}</span></DetailItem>
              </DetailGrid>
            </Section>
          </>
        )}
      </Modal>

      <ShortlistResourcesModal
        open={!!shortlistingRequest}
        onClose={() => setShortlistingRequest(null)}
        request={shortlistingRequest}
        onSubmit={handleShortlistSubmit}
      />

      {/* Final approval confirmation modal */}
      <Modal
        open={!!approvingRequest}
        onClose={() => setApprovingRequest(null)}
        title="Confirm Final Allocation"
        subtitle={approvingRequest ? `Request #${approvingRequest.id} — ${approvingRequest.projectName}` : ''}
        size="sm"
        footer={
          <ModalActionRow>
            <ModalApproveBtn onClick={handleFinalApprove} disabled={approving}>
              <ThumbsUp size={14} /> {approving ? 'Allocating…' : 'Confirm Allocation'}
            </ModalApproveBtn>
            <ModalSmartAllocBtn
              onClick={() => approvingRequest && handleReject(approvingRequest)}
              style={{ background: 'var(--color-danger)' }}
              disabled={approving}
            >
              <X size={14} /> Reject
            </ModalSmartAllocBtn>
          </ModalActionRow>
        }
      >
        {approvingRequest && (
          <>
            <Section>
              <SectionTitle>EM/EP Selected Resource</SectionTitle>
              <div style={{ padding: '12px 14px', background: '#dbeafe', border: '1px solid #bfdbfe', borderRadius: 10, marginBottom: approvingRequest.emApprovalNotes ? 10 : 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Resource to Allocate</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>{approvingRequest.resourceRequested}</div>
              </div>
              {approvingRequest.emApprovalNotes && (
                <div style={{ padding: '10px 14px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, color: '#78350f' }}>
                  <strong style={{ display: 'block', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>EM/EP Note</strong>
                  {approvingRequest.emApprovalNotes}
                </div>
              )}
            </Section>
            <Section>
              <SectionTitle>Details</SectionTitle>
              <DetailGrid $cols={2}>
                <DetailItem><label>Project</label><span>{approvingRequest.projectName}</span></DetailItem>
                <DetailItem><label>Role</label><span>{approvingRequest.role || '—'}</span></DetailItem>
                <DetailItem><label>Start</label><span>{approvingRequest.durationStart}</span></DetailItem>
                <DetailItem><label>End</label><span>{approvingRequest.durationEnd}</span></DetailItem>
              </DetailGrid>
            </Section>
          </>
        )}
      </Modal>

      <ReviewProfilesModal
        open={!!reviewProfilesRequest}
        onClose={() => setReviewProfilesRequest(null)}
        request={reviewProfilesRequest}
        loadResources={getShortlistedResources}
        onApprove={async (shortlistedResourceId, resourceName, notes) => {
          if (!reviewProfilesRequest?.uuid) return
          try {
            await emApprove(reviewProfilesRequest.uuid, shortlistedResourceId, notes)
            addToast(`You've approved ${resourceName} for request #${reviewProfilesRequest.id} — awaiting RM final approval`, 'success')
          } catch (err) {
            addToast(err instanceof Error ? err.message : 'Approval failed', 'error')
            throw err
          }
        }}
      />

      <RaiseRequestForm
        open={raiseFormOpen}
        onClose={() => { setRaiseFormOpen(false); setEditingRequest(null) }}
        mode={editingRequest ? 'edit' : 'create'}
        initialData={editingRequest ? {
          project_name: editingRequest.projectName,
          role_needed: editingRequest.role ?? '',
          grade_needed: editingRequest.grade ?? '',
          start_date: editingRequest.startDateISO ?? parseDisplayDateToISO(editingRequest.durationStart),
          end_date: editingRequest.endDateISO ?? parseDisplayDateToISO(editingRequest.durationEnd),
          primary_skill: editingRequest.primarySkill ?? '',
          request_type: editingRequest.requestType,
          booking_type: editingRequest.bookingType,
          notes: editingRequest.notes ?? '',
          opportunity_id: editingRequest.opportunityId ?? '',
          em_ep_name: editingRequest.emEpName ?? '',
          skill_set: editingRequest.skillSet ?? '',
          travel_requirements: editingRequest.travelRequirements ?? '',
          project_status: editingRequest.projectStatus ?? 'Active',
          loading_pct: editingRequest.loadingPct ?? 100,
          hours_per_day: parseHoursString(editingRequest.hoursPerDay),
          resource_requested: editingRequest.resourceRequested ?? '',
          service_line: editingRequest.serviceLine ?? '',
          sub_service_line: editingRequest.subServiceLine ?? '',
        } : undefined}
        onSubmit={async (formData: RequestFormData) => {
          try {
            const days = countWorkingDaysISO(formData.start_date, formData.end_date)
            const totalHrs = computeTotalHours(formData.hours_per_day, days)
            const payload = {
              project_name:     formData.project_name,
              role_needed:      formData.role_needed,
              grade_needed:     formData.grade_needed,
              start_date:       formData.start_date,
              end_date:         formData.end_date,
              hours_per_day:    formData.hours_per_day,
              total_hours:      totalHrs,
              primary_skill:    formData.primary_skill,
              notes:            formData.notes,
              request_type:     formData.request_type,
              booking_type:     formData.booking_type.toLowerCase(),
              opportunity_id:   formData.opportunity_id,
              em_ep_name:       formData.em_ep_name,
              skill_set:        formData.skill_set,
              travel_requirements: formData.travel_requirements,
              project_status:   formData.project_status,
              loading_pct:      formData.loading_pct,
              resource_requested: formData.resource_requested || undefined,
              service_line:       formData.service_line || undefined,
              sub_service_line:   formData.sub_service_line || undefined,
            }

            let res: Response
            if (editingRequest) {
              // Edit mode: find the request UUID and PATCH it
              const searchRes = await apiRaw('/api/resource-requests?limit=200')
              const searchBody = await searchRes.json()
              const match = searchBody.data?.find((r: any) => r.request_number === editingRequest.id)
              if (match) {
                res = await apiRaw(`/api/resource-requests/${match.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                })
              } else {
                // Fallback: create as new
                res = await apiRaw('/api/resource-requests', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                })
              }
            } else {
              // Create mode
              res = await apiRaw('/api/resource-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              })
            }

            if (res.ok) {
              addToast(editingRequest ? 'Request updated successfully' : 'Request submitted successfully', 'success')
              setRaiseFormOpen(false)
              setEditingRequest(null)
              refreshRequests() // Refresh the list from API
            } else {
              const body = await res.json().catch(() => ({}))
              addToast(body.error ?? 'Failed to submit request', 'error')
            }
          } catch {
            addToast('Network error — please try again', 'error')
          }
        }}
      />

      {/* Fixed-position action menu — rendered once, outside table overflow */}
      {openMenuId !== null && (() => {
        const targetRow = requests.find(r => r.id === openMenuId)
        if (!targetRow) return null
        return (
          <MoreMenuFixed $top={menuPos.top} $left={menuPos.left} onClick={(e: React.MouseEvent) => e.stopPropagation()}>
            <MoreMenuItem onClick={() => {
              setOpenMenuId(null)
              setEditingRequest(targetRow)
              setRaiseFormOpen(true)
            }}>
              <Pencil size={13} /> Edit
            </MoreMenuItem>
            <MoreMenuItem $danger onClick={async () => {
              setOpenMenuId(null)
              await deleteRequest(targetRow.id)
              addToast(`Request #${targetRow.id} deleted`, 'success')
            }}>
              <Trash2 size={13} /> Delete
            </MoreMenuItem>
          </MoreMenuFixed>
        )
      })()}
    </div>
  )
}