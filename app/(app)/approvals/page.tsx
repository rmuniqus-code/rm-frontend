'use client'

import { useState, useMemo } from 'react'
import styled from 'styled-components'
import DataTable from '@/components/shared/data-table'
import type { DataTableColumn } from '@/components/shared/data-table'
import StatusBadge from '@/components/shared/status-badge'
import FilterBar from '@/components/shared/filter-bar'
import Modal, { Section, SectionTitle, DetailGrid, DetailItem } from '@/components/shared/modal'
import type { ResourceRequest } from '@/data/request-data'
import { useRequests } from '@/components/shared/requests-context'
import { CheckSquare, Download, List, Clock, ThumbsUp, X } from 'lucide-react'
import { useToast } from '@/components/shared/toast'
import { useRole } from '@/components/shared/role-context'
import ShortlistResourcesModal from '@/components/requests/shortlist-resources-modal'
import { parseDisplayDateToISO, countWorkingDaysISO, parseHoursString, computeTotalHours, formatTotalHours } from '@/lib/hours-calc'
import { PageLoader } from '@/components/shared/page-loader'

/* ── Styled Components ── */
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
const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`
const IconBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--border-radius);
  border: 1px solid var(--color-border);
  color: var(--color-text-secondary);
  background: var(--color-bg-card);
  transition: all var(--transition-fast);
  &:hover { border-color: var(--color-primary); color: var(--color-primary); }
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
  font-weight: ${p => p.$active ? 600 : 400};
  color: ${p => p.$active ? 'var(--color-primary)' : 'var(--color-text-secondary)'};
  border-bottom: 2px solid ${p => p.$active ? 'var(--color-primary)' : 'transparent'};
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
  background: ${p => p.$color ?? 'var(--color-border-light)'};
  color: ${p => p.$color ? '#fff' : 'var(--color-text-secondary)'};
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
  background: ${p => p.$color};
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
  background: ${p => p.$color};
  flex-shrink: 0;
`
const ActionButtons = styled.div`
  display: flex;
  gap: 4px;
`
const ActionBtn = styled.button<{ $variant?: 'primary' | 'success' | 'warning' | 'danger' }>`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  height: 28px;
  padding: 0 10px;
  border-radius: var(--border-radius-sm);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  background: ${p =>
    p.$variant === 'success'  ? 'var(--color-success-light)' :
    p.$variant === 'warning'  ? '#fef9c3' :
    p.$variant === 'danger'   ? 'var(--color-danger-light)' :
    'var(--color-primary-light)'};
  color: ${p =>
    p.$variant === 'success'  ? 'var(--color-success)' :
    p.$variant === 'warning'  ? '#a16207' :
    p.$variant === 'danger'   ? 'var(--color-danger)' :
    'var(--color-primary)'};
  transition: all var(--transition-fast);
  &:hover {
    background: ${p =>
      p.$variant === 'success'  ? 'var(--color-success)' :
      p.$variant === 'warning'  ? '#f59e0b' :
      p.$variant === 'danger'   ? 'var(--color-danger)' :
      'var(--color-primary)'};
    color: #fff;
  }
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
const ModalFooterRow = styled.div`
  display: flex;
  gap: 8px;
`
const ModalBtn = styled.button<{ $variant?: 'success' | 'danger' | 'default' }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 20px;
  border-radius: var(--border-radius);
  font-size: 13px;
  font-weight: 500;
  color: #fff;
  background: ${p =>
    p.$variant === 'success' ? 'var(--color-success)' :
    p.$variant === 'danger'  ? 'var(--color-danger)' :
    'var(--color-primary)'};
  transition: background var(--transition-fast);
  &:hover {
    opacity: 0.9;
  }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`
const ConfirmBox = styled.div`
  padding: 16px;
  background: #dbeafe;
  border: 1px solid #bfdbfe;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`
const ConfirmLabel = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: #1e40af;
  text-transform: uppercase;
  letter-spacing: 0.05em;
`
const ConfirmValue = styled.div`
  font-size: 16px;
  font-weight: 700;
  color: var(--color-text);
`
const WaitingBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 999px;
  background: #fef9c3;
  border: 1px solid #fde68a;
  font-size: 12px;
  font-weight: 500;
  color: #a16207;
`

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}
function getAvatarColor(name: string) {
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4', '#ef4444']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

const baseColumns: DataTableColumn<ResourceRequest>[] = [
  { key: 'id', header: 'ID', width: '80px', render: (row) => <span style={{ fontWeight: 500, color: 'var(--color-text-secondary)' }}>{row.id}</span> },
  { key: 'resourceRequested', header: 'Role / Resource', render: (row) => (
    <ResourceCell>
      <Avatar $color={getAvatarColor(row.resourceRequested)}>{getInitials(row.resourceRequested)}</Avatar>
      <span>{row.resourceRequested}</span>
    </ResourceCell>
  )},
  { key: 'duration', header: 'Total Hours', render: (row) => {
    const startISO = row.startDateISO ?? parseDisplayDateToISO(row.durationStart)
    const endISO   = row.endDateISO   ?? parseDisplayDateToISO(row.durationEnd)
    const total = computeTotalHours(parseHoursString(row.hoursPerDay), countWorkingDaysISO(startISO, endISO))
    return (
      <DurationCell>
        <DurationTotal><Clock size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />{formatTotalHours(total)}</DurationTotal>
        <DurationRange>{row.durationStart} – {row.durationEnd}</DurationRange>
      </DurationCell>
    )
  }},
  { key: 'approvalStatus', header: 'Status', render: (row) => <StatusBadge status={row.approvalStatus} /> },
  { key: 'projectName', header: 'Project', render: (row) => (
    <ProjectCell><ProjectDot $color={row.projectColor} /><span>{row.projectName}</span></ProjectCell>
  )},
  { key: 'role', header: 'Role / Skill', render: (row) => (
    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{row.role || row.primarySkill || '—'}</span>
  )},
  { key: 'requestedBy', header: 'Requested by', render: (row) => (
    <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>{row.requestedBy}</span>
  )},
]

type ApprovalsTab = 'to-shortlist' | 'to-approve' | 'all'

export default function ApprovalsPage() {
  const { addToast } = useToast()
  const { requests, updateStatus, shortlistResources, loading: requestsLoading } = useRequests()
  const { canApprove, canShortlist } = useRole()

  const [activeTab, setActiveTab] = useState<ApprovalsTab>('to-shortlist')
  const [search, setSearch] = useState('')
  const [selectedRequest, setSelectedRequest] = useState<ResourceRequest | null>(null)
  const [shortlistingRequest, setShortlistingRequest] = useState<ResourceRequest | null>(null)
  const [approvingRequest, setApprovingRequest] = useState<ResourceRequest | null>(null)
  const [approving, setApproving] = useState(false)

  const toShortlist = requests.filter(r => r.approvalStatus === 'todo')
  const toApprove   = requests.filter(r => r.approvalStatus === 'em_approved')
  const allRequests = requests

  const tabData = (tab: ApprovalsTab) => {
    const base = tab === 'to-shortlist' ? toShortlist : tab === 'to-approve' ? toApprove : allRequests
    if (!search) return base
    const q = search.toLowerCase()
    return base.filter(r =>
      r.resourceRequested.toLowerCase().includes(q) ||
      r.projectName.toLowerCase().includes(q) ||
      String(r.id).includes(q)
    )
  }

  const summaryStats = useMemo(() => {
    const pendingHours = toShortlist.reduce((sum, r) => {
      const startISO = r.startDateISO ?? parseDisplayDateToISO(r.durationStart)
      const endISO   = r.endDateISO   ?? parseDisplayDateToISO(r.durationEnd)
      return sum + computeTotalHours(parseHoursString(r.hoursPerDay), countWorkingDaysISO(startISO, endISO))
    }, 0)
    return { pendingHours }
  }, [toShortlist])

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
      addToast(`Request #${req.id} approved — ${req.resourceRequested} will be allocated to ${req.projectName}`, 'success')
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

  /* ── Column sets ── */
  const toShortlistColumns: DataTableColumn<ResourceRequest>[] = [
    ...baseColumns,
    { key: 'actions', header: '', width: '140px', render: (row: ResourceRequest) => (
      <ActionButtons>
        {canShortlist ? (
          <ActionBtn $variant="warning" title="Shortlist Resources for EM/EP Review" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setShortlistingRequest(row) }}>
            <List size={13} /> Shortlist
          </ActionBtn>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic' }}>No permission</span>
        )}
      </ActionButtons>
    )},
  ]

  const toApproveColumns: DataTableColumn<ResourceRequest>[] = [
    ...baseColumns,
    { key: 'emSelected', header: 'EM/EP Selected', render: (row: ResourceRequest) => (
      <span style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>
        {row.resourceRequested || '—'}
      </span>
    )},
    { key: 'actions', header: '', width: '150px', render: (row: ResourceRequest) => (
      <ActionButtons>
        <ActionBtn $variant="success" title="Final Approve & Allocate" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setApprovingRequest(row) }}>
          <ThumbsUp size={13} /> Final Approve
        </ActionBtn>
        <ActionBtn $variant="danger" title="Reject" onClick={async (e: React.MouseEvent) => { e.stopPropagation(); await handleReject(row) }}>
          <X size={13} />
        </ActionBtn>
      </ActionButtons>
    )},
  ]

  const allColumns: DataTableColumn<ResourceRequest>[] = [
    ...baseColumns,
    { key: 'actions', header: '', width: '140px', render: (row: ResourceRequest) => (
      <ActionButtons>
        {row.approvalStatus === 'todo' && canShortlist && (
          <ActionBtn $variant="warning" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setShortlistingRequest(row) }}>
            <List size={13} /> Shortlist
          </ActionBtn>
        )}
        {row.approvalStatus === 'em_approved' && (
          <ActionBtn $variant="success" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setApprovingRequest(row) }}>
            <ThumbsUp size={13} /> Final Approve
          </ActionBtn>
        )}
        {row.approvalStatus === 'shortlisted' && (
          <WaitingBadge><Clock size={12} /> Awaiting EM/EP</WaitingBadge>
        )}
      </ActionButtons>
    )},
  ]

  const columns =
    activeTab === 'to-shortlist' ? toShortlistColumns :
    activeTab === 'to-approve'   ? toApproveColumns :
    allColumns

  if (requestsLoading) return <PageLoader message="Loading approvals…" />

  return (
    <div>
      <PageHeader>
        <PageTitle>
          <TitleIcon><CheckSquare size={18} /></TitleIcon>
          <h1>Resource Approvals</h1>
        </PageTitle>
        <HeaderActions>
          <IconBtn title="Export"><Download size={18} /></IconBtn>
        </HeaderActions>
      </PageHeader>

      <SummaryCardsRow>
        <SummaryCard>
          <SummaryLabel>Needs Shortlisting</SummaryLabel>
          <SummaryValue $color={toShortlist.length > 0 ? '#f59e0b' : undefined}>{toShortlist.length}</SummaryValue>
        </SummaryCard>
        <SummaryCard>
          <SummaryLabel>Awaiting Final Approval</SummaryLabel>
          <SummaryValue $color={toApprove.length > 0 ? 'var(--color-primary)' : undefined}>{toApprove.length}</SummaryValue>
        </SummaryCard>
        <SummaryCard>
          <SummaryLabel>Unallocated Hours</SummaryLabel>
          <SummaryValue $color="var(--color-danger)">{formatTotalHours(summaryStats.pendingHours)}</SummaryValue>
        </SummaryCard>
      </SummaryCardsRow>

      <TabBar>
        <Tab $active={activeTab === 'to-shortlist'} onClick={() => setActiveTab('to-shortlist')}>
          Needs Shortlisting
          {toShortlist.length > 0 && <TabBadge $color="#f59e0b">{toShortlist.length}</TabBadge>}
        </Tab>
        <Tab $active={activeTab === 'to-approve'} onClick={() => setActiveTab('to-approve')}>
          Awaiting Final Approval
          {toApprove.length > 0 && <TabBadge $color="var(--color-primary)">{toApprove.length}</TabBadge>}
        </Tab>
        <Tab $active={activeTab === 'all'} onClick={() => setActiveTab('all')}>
          All Requests <TabBadge>{requests.length}</TabBadge>
        </Tab>
      </TabBar>

      <FilterBar searchPlaceholder="Search requests…" onSearch={setSearch} />

      <DataTable<ResourceRequest>
        columns={columns}
        data={tabData(activeTab)}
        onRowClick={(row) => setSelectedRequest(row)}
        emptyMessage={
          activeTab === 'to-shortlist' ? 'No requests pending shortlisting' :
          activeTab === 'to-approve'   ? 'No requests awaiting final approval' :
          'No requests'
        }
      />

      {/* ── Request detail modal ── */}
      <Modal
        open={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        title={`Request #${selectedRequest?.id}`}
        subtitle={selectedRequest?.projectName}
        size="md"
        footer={
          selectedRequest?.approvalStatus === 'todo' ? (
            <ModalFooterRow>
              <ModalBtn onClick={() => { setShortlistingRequest(selectedRequest!); setSelectedRequest(null) }}>
                <List size={14} /> Shortlist Resources
              </ModalBtn>
            </ModalFooterRow>
          ) : selectedRequest?.approvalStatus === 'em_approved' ? (
            <ModalFooterRow>
              <ModalBtn $variant="success" onClick={() => { setApprovingRequest(selectedRequest!); setSelectedRequest(null) }}>
                <ThumbsUp size={14} /> Final Approve
              </ModalBtn>
              <ModalBtn $variant="danger" onClick={() => handleReject(selectedRequest!)}>
                <X size={14} /> Reject
              </ModalBtn>
            </ModalFooterRow>
          ) : undefined
        }
      >
        {selectedRequest && (
          <>
            <Section>
              <SectionTitle>Request Details</SectionTitle>
              <DetailGrid $cols={3}>
                <DetailItem><label>Role</label><span>{selectedRequest.role || '—'}</span></DetailItem>
                <DetailItem><label>Grade</label><span>{selectedRequest.grade || '—'}</span></DetailItem>
                <DetailItem><label>Primary Skill</label><span>{selectedRequest.primarySkill || '—'}</span></DetailItem>
                <DetailItem><label>Project</label><span>{selectedRequest.projectName}</span></DetailItem>
                <DetailItem><label>Status</label><span><StatusBadge status={selectedRequest.approvalStatus} /></span></DetailItem>
                <DetailItem><label>Requested By</label><span>{selectedRequest.requestedBy}</span></DetailItem>
              </DetailGrid>
            </Section>
            {selectedRequest.approvalStatus === 'em_approved' && (
              <Section>
                <SectionTitle>EM/EP Selection</SectionTitle>
                <ConfirmBox>
                  <ConfirmLabel>Selected Resource</ConfirmLabel>
                  <ConfirmValue>{selectedRequest.resourceRequested}</ConfirmValue>
                </ConfirmBox>
              </Section>
            )}
            <Section>
              <SectionTitle>Schedule</SectionTitle>
              <DetailGrid>
                <DetailItem><label>Start</label><span>{selectedRequest.durationStart}</span></DetailItem>
                <DetailItem><label>End</label><span>{selectedRequest.durationEnd}</span></DetailItem>
                <DetailItem><label>Hours/Day</label><span>{selectedRequest.hoursPerDay}</span></DetailItem>
              </DetailGrid>
            </Section>
          </>
        )}
      </Modal>

      {/* ── Final approval confirmation modal ── */}
      <Modal
        open={!!approvingRequest}
        onClose={() => setApprovingRequest(null)}
        title="Confirm Final Allocation"
        subtitle={approvingRequest ? `Request #${approvingRequest.id} — ${approvingRequest.projectName}` : ''}
        size="sm"
        footer={
          <ModalFooterRow>
            <ModalBtn $variant="success" onClick={handleFinalApprove} disabled={approving}>
              <ThumbsUp size={14} /> {approving ? 'Allocating…' : 'Confirm Allocation'}
            </ModalBtn>
            <ModalBtn $variant="danger" onClick={() => approvingRequest && handleReject(approvingRequest)} disabled={approving}>
              <X size={14} /> Reject
            </ModalBtn>
          </ModalFooterRow>
        }
      >
        {approvingRequest && (
          <>
            <Section>
              <SectionTitle>EM/EP Selected Resource</SectionTitle>
              <ConfirmBox>
                <ConfirmLabel>Resource to Allocate</ConfirmLabel>
                <ConfirmValue>{approvingRequest.resourceRequested}</ConfirmValue>
              </ConfirmBox>
              {approvingRequest.emApprovalNotes && (
                <div style={{ marginTop: 10, padding: '10px 14px', background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, color: '#78350f' }}>
                  <strong style={{ display: 'block', marginBottom: 4, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>EM/EP Note</strong>
                  {approvingRequest.emApprovalNotes}
                </div>
              )}
            </Section>
            <Section>
              <SectionTitle>Allocation Details</SectionTitle>
              <DetailGrid $cols={2}>
                <DetailItem><label>Project</label><span>{approvingRequest.projectName}</span></DetailItem>
                <DetailItem><label>Role</label><span>{approvingRequest.role || '—'}</span></DetailItem>
                <DetailItem><label>Start</label><span>{approvingRequest.durationStart}</span></DetailItem>
                <DetailItem><label>End</label><span>{approvingRequest.durationEnd}</span></DetailItem>
                <DetailItem><label>Hours/Day</label><span>{approvingRequest.hoursPerDay}</span></DetailItem>
                <DetailItem><label>Requested By</label><span>{approvingRequest.requestedBy}</span></DetailItem>
              </DetailGrid>
            </Section>
          </>
        )}
      </Modal>

      {/* ── Shortlist modal ── */}
      <ShortlistResourcesModal
        open={!!shortlistingRequest}
        onClose={() => setShortlistingRequest(null)}
        request={shortlistingRequest}
        onSubmit={handleShortlistSubmit}
      />
    </div>
  )
}
