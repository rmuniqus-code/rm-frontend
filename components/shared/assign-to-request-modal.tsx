'use client'

import { useState, useMemo } from 'react'
import styled from 'styled-components'
import Modal from '@/components/shared/modal'
import StatusBadge from '@/components/shared/status-badge'
import type { ResourceRequest } from '@/data/request-data'
import { useRequests } from '@/components/shared/requests-context'
import { Search, UserPlus, Check, Clock, Briefcase } from 'lucide-react'
import { parseDisplayDateToISO, countWorkingDaysISO, parseHoursString, computeTotalHours, formatTotalHours } from '@/lib/hours-calc'

/* ─── Styled Components ─── */

const SearchBox = styled.div`
  position: relative;
  margin-bottom: 16px;
`

const SearchIcon = styled.div`
  position: absolute;
  top: 50%;
  left: 12px;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  display: flex;
`

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 14px 10px 38px;
  border: 1px solid var(--color-border-strong);
  border-radius: 8px;
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-surface, var(--color-bg));
  outline: none;
  box-sizing: border-box;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  &:focus { border-color: var(--color-primary); box-shadow: var(--focus-ring); }
  &::placeholder { color: var(--color-text-muted); }
`

const ResourceBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--color-primary-light);
  border: 1.5px solid var(--color-primary);
  border-radius: 10px;
  margin-bottom: 16px;
`

const ResourceAvatar = styled.div<{ $color: string }>`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: ${p => p.$color};
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
`

const ResourceInfo = styled.div`
  flex: 1;
`

const ResourceName = styled.div`
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text);
`

const ResourceHint = styled.div`
  font-size: 12px;
  color: var(--color-text-secondary);
`

const RequestList = styled.div`
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-right: 4px;
`

const RequestCard = styled.div<{ $selected?: boolean }>`
  padding: 14px 16px;
  border: 1.5px solid ${p => p.$selected ? 'var(--color-primary)' : 'var(--color-border)'};
  border-radius: 10px;
  background: ${p => p.$selected ? 'var(--color-primary-light)' : 'var(--color-bg-card)'};
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: var(--color-primary);
    box-shadow: 0 1px 4px rgba(0,0,0,0.06);
  }
`

const RequestHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
`

const RequestTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const RequestId = styled.span`
  font-size: 12px;
  font-weight: 700;
  color: var(--color-text-secondary);
`

const ProjectDot = styled.span<{ $color: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${p => p.$color};
  flex-shrink: 0;
`

const ProjectName = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
`

const RequestMeta = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--color-text-secondary);
  flex-wrap: wrap;

  span {
    display: flex;
    align-items: center;
    gap: 4px;
  }
`

const SelectedBadge = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  flex-shrink: 0;
`

const EmptyMsg = styled.div`
  padding: 32px 16px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
`

const FooterRow = styled.div`
  display: flex;
  gap: 8px;
`

const ConfirmBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 24px;
  border-radius: var(--border-radius);
  background: var(--color-primary);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: background var(--transition-fast), box-shadow var(--transition-fast);
  &:hover { background: var(--color-primary-hover); }
  &:focus-visible { outline: none; box-shadow: var(--focus-ring); }
  &:disabled { background: #F2F4F7; border: 1px solid #EAECF0; color: #98A2B3; cursor: not-allowed; }
`

const CancelBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--border-radius);
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
  background: #fff;
  cursor: pointer;
  transition: background var(--transition-fast), box-shadow var(--transition-fast);
  &:hover { background: var(--color-border-light); }
  &:focus-visible { outline: none; box-shadow: var(--focus-ring); }
`

/* ─── Helpers ─── */

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
}

function getAvatarColor(name: string) {
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#22c55e', '#06b6d4', '#ef4444']
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

/* ─── Component ─── */

interface AssignToRequestModalProps {
  open: boolean
  resourceName: string
  onClose: () => void
  onAssign: (request: ResourceRequest) => void
}

export default function AssignToRequestModal({ open, resourceName, onClose, onAssign }: AssignToRequestModalProps) {
  const { requests } = useRequests()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const handleClose = () => {
    setSearch('')
    setSelectedId(null)
    onClose()
  }

  // Show only pending/todo requests
  const pendingRequests = useMemo(() => {
    return requests.filter(r => r.approvalStatus === 'todo')
  }, [requests])

  const filtered = useMemo(() => {
    if (!search) return pendingRequests
    const q = search.toLowerCase()
    return pendingRequests.filter(r =>
      r.projectName.toLowerCase().includes(q) ||
      r.resourceRequested.toLowerCase().includes(q) ||
      String(r.id).includes(q) ||
      (r.role ?? '').toLowerCase().includes(q)
    )
  }, [pendingRequests, search])

  const selectedRequest = requests.find(r => r.id === selectedId) ?? null

  const handleConfirm = () => {
    if (!selectedRequest) return
    onAssign(selectedRequest)
    handleClose()
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Assign to Request"
      subtitle="Select a pending request to assign this resource to"
      size="md"
      zIndex={110}
      footer={
        <FooterRow>
          <CancelBtn onClick={handleClose}>Cancel</CancelBtn>
          <ConfirmBtn onClick={handleConfirm} disabled={!selectedId}>
            <UserPlus size={16} /> Assign Resource
          </ConfirmBtn>
        </FooterRow>
      }
    >
      {/* Resource being assigned */}
      <ResourceBanner>
        <ResourceAvatar $color={getAvatarColor(resourceName)}>
          {getInitials(resourceName)}
        </ResourceAvatar>
        <ResourceInfo>
          <ResourceName>{resourceName}</ResourceName>
          <ResourceHint>Will be assigned as the resource for the selected request</ResourceHint>
        </ResourceInfo>
      </ResourceBanner>

      {/* Search */}
      <SearchBox>
        <SearchIcon><Search size={16} /></SearchIcon>
        <SearchInput
          placeholder="Search by project, role, or request ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </SearchBox>

      {/* Request list */}
      <RequestList>
        {filtered.length === 0 ? (
          <EmptyMsg>
            {pendingRequests.length === 0
              ? 'No pending requests available'
              : 'No requests match your search'}
          </EmptyMsg>
        ) : (
          filtered.map(req => {
            const isSelected = req.id === selectedId
            const startISO = req.startDateISO ?? parseDisplayDateToISO(req.durationStart)
            const endISO = req.endDateISO ?? parseDisplayDateToISO(req.durationEnd)
            const days = countWorkingDaysISO(startISO, endISO)
            const hpd = parseHoursString(req.hoursPerDay)
            const total = computeTotalHours(hpd, days)

            return (
              <RequestCard
                key={req.id}
                $selected={isSelected}
                onClick={() => setSelectedId(isSelected ? null : req.id)}
              >
                <RequestHeader>
                  <RequestTitle>
                    <RequestId>#{req.id}</RequestId>
                    <ProjectDot $color={req.projectColor} />
                    <ProjectName>{req.projectName}</ProjectName>
                  </RequestTitle>
                  {isSelected ? (
                    <SelectedBadge><Check size={14} /></SelectedBadge>
                  ) : (
                    <StatusBadge status={req.approvalStatus} />
                  )}
                </RequestHeader>
                <RequestMeta>
                  <span><Briefcase size={12} />{req.role || req.resourceRequested}</span>
                  <span>{req.grade || '—'}</span>
                  <span><Clock size={12} />{formatTotalHours(total)}</span>
                  <span>{req.durationStart} – {req.durationEnd}</span>
                </RequestMeta>
              </RequestCard>
            )
          })
        )}
      </RequestList>
    </Modal>
  )
}
