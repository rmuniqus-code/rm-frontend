'use client'

import { useState, useMemo } from 'react'
import styled from 'styled-components'
import DataTable from '@/components/shared/data-table'
import type { DataTableColumn } from '@/components/shared/data-table'
import StatusBadge from '@/components/shared/status-badge'
import FilterBar, { SelectFilter } from '@/components/shared/filter-bar'
import Modal, { Section, SectionTitle, DetailGrid, DetailItem } from '@/components/shared/modal'
import type { ResourceRequest } from '@/data/request-data'
import { useRequests } from '@/components/shared/requests-context'
import { CheckSquare, Download, Search, Users, MoreVertical, Sparkles, Clock, UserPlus } from 'lucide-react'
import { useToast } from '@/components/shared/toast'
import { useRole } from '@/components/shared/role-context'
import SmartAllocationModal, { type SmartAllocationResult } from '@/components/shared/smart-allocation-modal'
import AllocateResourceModal, { type AllocationResult } from '@/components/shared/allocate-resource-modal'
import FindAvailabilityModal from '@/components/shared/find-availability-modal'
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

  h1 {
    font-size: 22px;
    font-weight: 700;
    color: var(--color-text);
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

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
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

const RequestTypeCell = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--color-text-secondary);

  svg { width: 14px; height: 14px; }
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

  &:hover {
    background: var(--color-success);
    color: #fff;
  }
`

const MoreButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--border-radius-sm);
  color: var(--color-text-muted);

  &:hover {
    background: var(--color-border-light);
    color: var(--color-text);
  }
`

const BookingBadge = styled.span<{ $type: string }>`
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: ${p => p.$type === 'Confirmed' ? 'var(--color-success-light)' : '#fef3c7'};
  color: ${p => p.$type === 'Confirmed' ? '#15803d' : '#92400e'};
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
  transition: background var(--transition-fast);

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
  {
    key: 'id',
    header: 'ID',
    width: '80px',
    render: (row) => <span style={{ fontWeight: 500, color: 'var(--color-text-secondary)' }}>{row.id}</span>,
  },
  {
    key: 'resourceRequested',
    header: 'Resource requested',
    render: (row) => (
      <ResourceCell>
        <Avatar $color={getAvatarColor(row.resourceRequested)}>
          {getInitials(row.resourceRequested)}
        </Avatar>
        <span>{row.resourceRequested}</span>
      </ResourceCell>
    ),
  },
  {
    key: 'duration',
    header: 'Total Hours',
    render: (row) => {
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
    },
  },
  {
    key: 'approvalStatus',
    header: 'Allocation status',
    render: (row) => <StatusBadge status={row.approvalStatus} />,
  },
  {
    key: 'requestType',
    header: 'Request type',
    render: (row) => (
      <RequestTypeCell>
        <Users />
        {row.requestType}
      </RequestTypeCell>
    ),
  },
  {
    key: 'bookingType',
    header: 'Booking',
    render: (row) => <BookingBadge $type={row.bookingType}>{row.bookingType}</BookingBadge>,
  },
  {
    key: 'projectName',
    header: 'Project name',
    render: (row) => (
      <ProjectCell>
        <ProjectDot $color={row.projectColor} />
        <span>{row.projectName}</span>
      </ProjectCell>
    ),
  },
  {
    key: 'hours',
    header: 'Hrs/Day',
    align: 'right',
    render: (row) => <span style={{ fontWeight: 500 }}>{row.hoursPerDay}</span>,
  },
]

export default function ApprovalsPage() {
  const { addToast } = useToast()
  const { requests, updateStatus, loading: requestsLoading } = useRequests()
  const { canApprove } = useRole()
  const [search, setSearch] = useState('')
  const [selectedRequest, setSelectedRequest] = useState<ResourceRequest | null>(null)
  const [allocatingRequest, setAllocatingRequest] = useState<ResourceRequest | null>(null)
  const [smartAllocRequest, setSmartAllocRequest] = useState<ResourceRequest | null>(null)
  const [findAvailRequest, setFindAvailRequest] = useState<ResourceRequest | null>(null)

  const handleApproveClick = (row: ResourceRequest, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!canApprove) return
    // AllocateResourceModal uses zIndex=110 so it stacks cleanly on top of
    // the detail modal (zIndex=100) — no need to close first.
    setAllocatingRequest(row)
  }

  const handleAllocationConfirm = async (requestId: number, allocation: AllocationResult) => {
    try {
      await updateStatus(requestId, 'approved', {
        allocatedEmployee: allocation.employeeName,
        hoursPerDay: allocation.hoursPerDay,
        totalHours: allocation.totalHours,
      })
      addToast(`Request #${requestId} approved — ${allocation.employeeName} allocated (${Math.round(allocation.totalHours)}h)`, 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Approval failed — employee not found in system', 'error')
    }
    setAllocatingRequest(null)
    setSelectedRequest(null)  // close detail modal too after allocation
  }

  const handleSmartAllocSelect = async (result: SmartAllocationResult) => {
    const req = smartAllocRequest
    if (!req) return
    try {
      await updateStatus(req.id, 'approved', {
        allocatedEmployee: result.candidateName,
      })
      addToast(`Request #${req.id} approved — ${result.candidateName} allocated via Smart Allocate`, 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Smart allocation failed', 'error')
    }
    setSmartAllocRequest(null)
    setSelectedRequest(null)
  }

  const columns: DataTableColumn<ResourceRequest>[] = [
    ...baseColumns,
    {
      key: 'actions',
      header: '',
      width: '130px',
      render: (row: ResourceRequest) => (
        <ActionButtons>
          {row.approvalStatus === 'todo' ? (
            <>
              <ApproveBtn title="Find Availability" onClick={(e: React.MouseEvent) => { e.stopPropagation(); setFindAvailRequest(row) }}><Search size={14} /></ApproveBtn>
              <ApproveBtn title="Allocate Resource" onClick={(e: React.MouseEvent) => handleApproveClick(row, e)}><UserPlus size={14} /></ApproveBtn>
            </>
          ) : (
            <MoreButton><MoreVertical size={16} /></MoreButton>
          )}
        </ActionButtons>
      ),
    },
  ]

  const filtered = requests.filter(r =>
    !search || r.resourceRequested.toLowerCase().includes(search.toLowerCase()) ||
    r.projectName.toLowerCase().includes(search.toLowerCase()) ||
    String(r.id).includes(search)
  )

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalHours = filtered.reduce((sum, r) => {
      const startISO = r.startDateISO ?? parseDisplayDateToISO(r.durationStart)
      const endISO = r.endDateISO ?? parseDisplayDateToISO(r.durationEnd)
      const days = countWorkingDaysISO(startISO, endISO)
      const hpd = parseHoursString(r.hoursPerDay)
      return sum + computeTotalHours(hpd, days)
    }, 0)
    const unallocatedHours = filtered
      .filter(r => r.approvalStatus === 'todo')
      .reduce((sum, r) => {
        const startISO = r.startDateISO ?? parseDisplayDateToISO(r.durationStart)
        const endISO = r.endDateISO ?? parseDisplayDateToISO(r.durationEnd)
        const days = countWorkingDaysISO(startISO, endISO)
        const hpd = parseHoursString(r.hoursPerDay)
        return sum + computeTotalHours(hpd, days)
      }, 0)
    return { totalHours, unallocatedHours }
  }, [filtered])

  return requestsLoading ? <PageLoader message="Loading approvals…" /> : (
    <div>
      <PageHeader>
        <PageTitle>
          <TitleIcon><CheckSquare size={18} /></TitleIcon>
          <h1>Resource Allocations</h1>
        </PageTitle>
        <HeaderActions>
          <IconBtn title="Search"><Search size={18} /></IconBtn>
          <IconBtn title="Export"><Download size={18} /></IconBtn>
        </HeaderActions>
      </PageHeader>

      <ViewControls>
        <ViewLabel>Group by:</ViewLabel>
        <SelectFilter defaultValue="none">
          <option value="none">None</option>
          <option value="status">Status</option>
          <option value="project">Project</option>
        </SelectFilter>
      </ViewControls>

      <FilterBar
        searchPlaceholder="Search requests..."
        onSearch={setSearch}
      />

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

      <DataTable<ResourceRequest>
        columns={columns}
        data={filtered}
        onRowClick={(row) => setSelectedRequest(row)}
        emptyMessage="No pending approvals"
      />

      <Modal
        open={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        title={`Allocation Request #${selectedRequest?.id}`}
        subtitle={selectedRequest?.projectName}
        size="md"
        footer={
          selectedRequest?.approvalStatus === 'todo' ? (
            <ModalActionRow>
              <ModalSmartAllocBtn onClick={() => setFindAvailRequest(selectedRequest)} style={{ background: 'var(--color-primary)' }}>
                <Search size={14} /> Find Availability
              </ModalSmartAllocBtn>
              <ModalApproveBtn onClick={() => handleApproveClick(selectedRequest)}>
                <UserPlus size={14} /> Allocate Resource
              </ModalApproveBtn>
              <ModalSmartAllocBtn onClick={() => setSmartAllocRequest(selectedRequest)}>
                <Sparkles size={14} /> Smart Allocate
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
                <DetailItem>
                  <label>Resource</label>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {selectedRequest.resourceRequested}
                    {selectedRequest.approvalStatus === 'todo' && canApprove && (
                      <button
                        onClick={() => handleApproveClick(selectedRequest)}
                        title="Assign a resource"
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '2px 8px', borderRadius: 6, border: '1px solid var(--color-primary)',
                          background: 'var(--color-primary-light)', color: 'var(--color-primary)',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        <UserPlus size={11} /> Assign
                      </button>
                    )}
                  </span>
                </DetailItem>
                <DetailItem><label>Type</label><span>{selectedRequest.requestType}</span></DetailItem>
                <DetailItem><label>Booking</label><span><BookingBadge $type={selectedRequest.bookingType}>{selectedRequest.bookingType}</BookingBadge></span></DetailItem>
                <DetailItem><label>Project</label><span>{selectedRequest.projectName}</span></DetailItem>
                <DetailItem><label>Status</label><span><StatusBadge status={selectedRequest.approvalStatus} /></span></DetailItem>
                <DetailItem><label>Role</label><span>{selectedRequest.role || '—'}</span></DetailItem>
                <DetailItem><label>Grade</label><span>{selectedRequest.grade || '—'}</span></DetailItem>
                <DetailItem><label>Primary Skill</label><span>{selectedRequest.primarySkill || '—'}</span></DetailItem>
                <DetailItem><label>Sector</label><span>{selectedRequest.sector || '—'}</span></DetailItem>
              </DetailGrid>
            </Section>
            <Section>
              <SectionTitle>Schedule & Effort</SectionTitle>
              <DetailGrid>
                <DetailItem><label>Start Date</label><span>{selectedRequest.durationStart}</span></DetailItem>
                <DetailItem><label>End Date</label><span>{selectedRequest.durationEnd}</span></DetailItem>
                <DetailItem><label>Hours/Day</label><span>{selectedRequest.hoursPerDay}</span></DetailItem>
                <DetailItem><label>Total Hours</label><span>{selectedRequest.hours}</span></DetailItem>
              </DetailGrid>
            </Section>
            <Section>
              <SectionTitle>Requester</SectionTitle>
              <DetailGrid $cols={1}>
                <DetailItem><label>Requested By</label><span>{selectedRequest.requestedBy}</span></DetailItem>
                <DetailItem><label>Requested On</label><span>{selectedRequest.requestedDate}</span></DetailItem>
              </DetailGrid>
            </Section>
          </>
        )}
      </Modal>
      <SmartAllocationModal
        open={!!smartAllocRequest}
        onClose={() => setSmartAllocRequest(null)}
        request={smartAllocRequest}
        onSelect={handleSmartAllocSelect}
      />
      <AllocateResourceModal
        open={!!allocatingRequest}
        request={allocatingRequest}
        onClose={() => setAllocatingRequest(null)}
        onConfirm={handleAllocationConfirm}
      />
      <FindAvailabilityModal
        open={!!findAvailRequest}
        request={findAvailRequest}
        onClose={() => setFindAvailRequest(null)}
        onAssign={async (req, resourceName) => {
          try {
            await updateStatus(req.id, 'approved', { allocatedEmployee: resourceName })
            addToast(`Request #${req.id} approved — ${resourceName} assigned`, 'success')
          } catch (err) {
            addToast(err instanceof Error ? err.message : 'Assignment failed', 'error')
          }
          setFindAvailRequest(null)
          setSelectedRequest(null)
        }}
      />
    </div>
  )
}
