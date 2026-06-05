'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import styled from 'styled-components'
import { Bell, Check, CheckCheck, UserPlus, AlertTriangle, Calendar, Trash2, X } from 'lucide-react'
import { apiRaw } from '@/lib/api'

export interface AllocationMetadata {
  resourceName: string
  roleSkill: string | null
  startDate: string
  endDate: string
  loadingPct: number
  projectName: string
  projectCode: string | null
  emEpName: string | null
  projectDescription: string | null
}

export interface Notification {
  id: string
  type: string
  title: string
  message: string
  is_read: boolean
  created_at: string
  metadata?: AllocationMetadata | null
}

/* ─── Mock fallback — lazily generated client-side to avoid SSR/CSR mismatch ── */
function makeMockNotifications(): Notification[] {
  const now = Date.now()
  return [
    { id: 'n1', type: 'approval', title: 'Allocation Approved', message: 'Sarah Chen → Project Alpha approved by Lisa Wang', is_read: false, created_at: new Date(now - 2*60000).toISOString() },
    { id: 'n2', type: 'request_raised', title: 'Request Pending', message: 'New team member request for Yatra Online INC', is_read: false, created_at: new Date(now - 15*60000).toISOString() },
    {
      id: 'n3', type: 'booking_confirmed', title: 'Booking Confirmed',
      message: 'You have been assigned to Project Beta as Strategy Lead',
      is_read: false, created_at: new Date(now - 60*60000).toISOString(),
      metadata: {
        resourceName: 'Sarah Chen', roleSkill: 'Strategy Lead',
        startDate: '2026-06-02', endDate: '2026-08-29', loadingPct: 100,
        projectName: 'Project Beta', projectCode: 'BETA-2026-001',
        emEpName: 'Lisa Wang', projectDescription: 'Digital transformation initiative for Q3.',
      },
    },
    { id: 'n4', type: 'over_allocation', title: 'Over-Allocation Warning', message: 'Michael Torres is at 120% FTE — requires attention', is_read: false, created_at: new Date(now - 2*60*60000).toISOString() },
    { id: 'n5', type: 'booking_confirmed', title: 'Booking Confirmed', message: 'John Smith → Project Beta confirmed for Q1 2026', is_read: true, created_at: new Date(now - 3*60*60000).toISOString() },
    { id: 'n6', type: 'request_raised', title: 'Extension Request', message: 'Emily Brown requested extension on Project Epsilon', is_read: true, created_at: new Date(now - 5*60*60000).toISOString() },
    { id: 'n7', type: 'timesheet_gap', title: 'Timesheet Gap Detected', message: '3 resources have not submitted timesheets for WC 1 Dec', is_read: true, created_at: new Date(now - 24*60*60000).toISOString() },
    { id: 'n8', type: 'allocation_updated', title: 'Role Reassignment', message: 'Priya Patel moved from Project Delta to Project Gamma', is_read: true, created_at: new Date(now - 24*60*60000).toISOString() },
  ]
}

/* ─── Styled components ──────────────────────────────────────────────────────── */

const Anchor = styled.div`
  position: relative;
`

const BellButton = styled.button<{ $hasUnread: boolean }>`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--border-radius);
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);

  &:hover {
    background: var(--color-border-light);
    color: var(--color-text);
  }
`

const Badge = styled.span`
  position: absolute;
  top: 4px;
  right: 4px;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  background: var(--color-danger);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
  border: 2px solid var(--color-bg-topbar);
`

const Panel = styled.div<{ $open: boolean }>`
  position: absolute;
  top: 44px;
  right: 0;
  width: 380px;
  max-height: 480px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-lg);
  z-index: 100;
  display: ${p => p.$open ? 'flex' : 'none'};
  flex-direction: column;
  overflow: hidden;
`

const PanelHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--color-border);

  h4 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
  }
`

const MarkAllBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-primary);
  font-weight: 500;

  &:hover {
    text-decoration: underline;
  }
`

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const ClearAllBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--color-text-muted);
  font-weight: 500;

  &:hover {
    color: var(--color-danger);
    text-decoration: underline;
  }
`

const NotifList = styled.div`
  overflow-y: auto;
  flex: 1;
`

const NotifItem = styled.div<{ $read: boolean; $clickable?: boolean }>`
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  cursor: ${p => p.$clickable ? 'pointer' : 'default'};
  background: ${p => p.$read ? 'transparent' : 'var(--color-primary-light)'};
  border-bottom: 1px solid var(--color-border-light);
  transition: background var(--transition-fast);

  &:hover {
    background: var(--color-border-light);
  }

  &:last-child {
    border-bottom: none;
  }
`

const NotifIcon = styled.div<{ $type: string }>`
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: ${p =>
    p.$type === 'booking_confirmed' || p.$type === 'approval' ? 'var(--color-success-light)' :
    p.$type === 'request_raised' ? 'var(--color-info-light)' :
    p.$type === 'allocation_updated' ? '#f3e8ff' :
    'var(--color-warning-light)'};
  color: ${p =>
    p.$type === 'booking_confirmed' || p.$type === 'approval' ? '#15803d' :
    p.$type === 'request_raised' ? '#1d4ed8' :
    p.$type === 'allocation_updated' ? '#7c3aed' :
    '#b45309'};
`

const NotifContent = styled.div`
  flex: 1;
  min-width: 0;

  .title {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 2px;
  }

  .msg {
    font-size: 12px;
    color: var(--color-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .time {
    font-size: 11px;
    color: var(--color-text-muted);
    margin-top: 2px;
  }
`

const UnreadDot = styled.div`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary);
  flex-shrink: 0;
  margin-top: 6px;
`

const EmptyNotif = styled.div`
  padding: 30px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--color-text-muted);
`

/* ─── Allocation Detail Modal ────────────────────────────────────────────────── */

const ModalOverlay = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
`

const ModalCard = styled.div`
  background: #1e1333;
  border-radius: 10px;
  overflow: hidden;
  width: 100%;
  max-width: 480px;
  box-shadow: 0 24px 48px rgba(0,0,0,0.5);
`

const ModalTitle = styled.div`
  padding: 18px 20px 16px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  h2 {
    font-size: 17px;
    font-weight: 700;
    color: #fff;
    line-height: 1.3;
  }

  button {
    color: #c4b5d4;
    flex-shrink: 0;
    margin-top: 2px;
    &:hover { color: #fff; }
  }
`

const ModalBody = styled.div`
  padding: 0 0 4px;
`

const SectionBanner = styled.div`
  background: #c026d3;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
  padding: 8px 16px;
  letter-spacing: 0.02em;
`

const SectionHeader = styled.div`
  background: #2d1b4e;
  color: #e9d5f5;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 16px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
`

const DetailRow = styled.div`
  display: grid;
  grid-template-columns: 48% 52%;
  border-bottom: 1px solid #3a2458;

  &:last-child { border-bottom: none; }
`

const DetailLabel = styled.div`
  background: #2a1a47;
  color: #c4b5d4;
  font-size: 12px;
  font-weight: 600;
  padding: 9px 14px;
  border-right: 1px solid #3a2458;
`

const DetailValue = styled.div`
  background: #231540;
  color: #f3e8ff;
  font-size: 12px;
  padding: 9px 14px;
  word-break: break-word;
`

/* ─── Helpers ────────────────────────────────────────────────────────────────── */

function getIcon(type: string) {
  switch (type) {
    case 'booking_confirmed':
    case 'approval': return <Check size={16} />
    case 'request_raised': return <UserPlus size={16} />
    case 'allocation_updated': return <Calendar size={16} />
    default: return <AlertTriangle size={16} />
  }
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days > 1 ? 's' : ''} ago`
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

/* ─── Allocation Card Modal ──────────────────────────────────────────────────── */

function AllocationCard({ meta, onClose }: { meta: AllocationMetadata; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <ModalOverlay onClick={onClose}>
      <ModalCard onClick={e => e.stopPropagation()}>
        <ModalTitle>
          <h2>UniSource Notification: Project Allocation</h2>
          <button onClick={onClose}><X size={18} /></button>
        </ModalTitle>

        <ModalBody>
          <SectionBanner>Allocation Details –</SectionBanner>
          <SectionBanner style={{ background: '#9333ea', fontSize: '12px', fontWeight: 600 }}>
            Resource Booking Confirmation
          </SectionBanner>

          <SectionHeader>Resource Details</SectionHeader>
          <DetailRow>
            <DetailLabel>Resource Name</DetailLabel>
            <DetailValue>{meta.resourceName}</DetailValue>
          </DetailRow>
          <DetailRow>
            <DetailLabel>Role / Skill</DetailLabel>
            <DetailValue>{meta.roleSkill ?? '—'}</DetailValue>
          </DetailRow>

          <SectionHeader>Allocation Details</SectionHeader>
          <DetailRow>
            <DetailLabel>Start Date</DetailLabel>
            <DetailValue>{formatDate(meta.startDate)}</DetailValue>
          </DetailRow>
          <DetailRow>
            <DetailLabel>End Date</DetailLabel>
            <DetailValue>{formatDate(meta.endDate)}</DetailValue>
          </DetailRow>
          <DetailRow>
            <DetailLabel>Loading / Allocation</DetailLabel>
            <DetailValue>{meta.loadingPct}%</DetailValue>
          </DetailRow>

          <SectionHeader>Engagement Information</SectionHeader>
          <DetailRow>
            <DetailLabel>Project Name</DetailLabel>
            <DetailValue>{meta.projectName}</DetailValue>
          </DetailRow>
          <DetailRow>
            <DetailLabel>Project Code (if applicable)</DetailLabel>
            <DetailValue>{meta.projectCode ?? '—'}</DetailValue>
          </DetailRow>
          <DetailRow>
            <DetailLabel>EM/EP Name</DetailLabel>
            <DetailValue>{meta.emEpName ?? '—'}</DetailValue>
          </DetailRow>
          <DetailRow>
            <DetailLabel>Project Description</DetailLabel>
            <DetailValue>{meta.projectDescription ?? '—'}</DetailValue>
          </DetailRow>
        </ModalBody>
      </ModalCard>
    </ModalOverlay>
  )
}

/* ─── Main component ─────────────────────────────────────────────────────────── */

const POLL_INTERVAL = 60_000

export default function NotificationPanel() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>(makeMockNotifications)
  const [hasLiveData, setHasLiveData] = useState(false)
  const [fetchFailed, setFetchFailed] = useState(false)
  const [activeCard, setActiveCard] = useState<AllocationMetadata | null>(null)
  const hasFetchedRef = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.is_read).length

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiRaw('/api/notifications?limit=20')
      if (res.ok) {
        const body = await res.json()
        if (body.notifications && body.notifications.length > 0) {
          setNotifications(body.notifications)
          setHasLiveData(true)
        }
        setFetchFailed(false)
      } else {
        setFetchFailed(true)
      }
    } catch {
      setFetchFailed(true)
    }
  }, [])

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true
      fetchNotifications()
    }
  }, [fetchNotifications])

  useEffect(() => {
    if (!open || fetchFailed) return
    const interval = setInterval(fetchNotifications, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [open, fetchFailed, fetchNotifications])

  const handleToggle = () => {
    const nextOpen = !open
    setOpen(nextOpen)
    if (nextOpen) fetchNotifications()
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const markAllRead = async () => {
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    if (hasLiveData) {
      try {
        await apiRaw('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mark_all: true }),
        })
      } catch { /* ignore */ }
    }
  }

  const clearAll = async () => {
    setNotifications([])
    if (hasLiveData) {
      try {
        await apiRaw('/api/notifications', { method: 'DELETE' })
      } catch { /* ignore */ }
    }
  }

  const markRead = async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    if (hasLiveData) {
      try {
        await apiRaw('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [id] }),
        })
      } catch { /* ignore */ }
    }
  }

  const handleItemClick = async (n: Notification) => {
    await markRead(n.id)
    if (n.type === 'booking_confirmed' && n.metadata) {
      setOpen(false)
      setActiveCard(n.metadata)
    }
  }

  return (
    <>
      <Anchor ref={panelRef}>
        <BellButton $hasUnread={unreadCount > 0} onClick={handleToggle} title="Notifications">
          <Bell size={18} />
          {unreadCount > 0 && <Badge>{unreadCount}</Badge>}
        </BellButton>
        <Panel $open={open}>
          <PanelHeader>
            <h4>Notifications {unreadCount > 0 && `(${unreadCount})`}</h4>
            <HeaderActions>
              {unreadCount > 0 && (
                <MarkAllBtn onClick={markAllRead}>
                  <CheckCheck size={14} /> Mark all read
                </MarkAllBtn>
              )}
              {notifications.length > 0 && (
                <ClearAllBtn onClick={clearAll}>
                  <Trash2 size={13} /> Clear all
                </ClearAllBtn>
              )}
            </HeaderActions>
          </PanelHeader>
          <NotifList>
            {notifications.length === 0 && (
              <EmptyNotif>No notifications</EmptyNotif>
            )}
            {notifications.map(n => (
              <NotifItem
                key={n.id}
                $read={n.is_read}
                $clickable={n.type === 'booking_confirmed' && !!n.metadata}
                onClick={() => handleItemClick(n)}
              >
                <NotifIcon $type={n.type}>{getIcon(n.type)}</NotifIcon>
                <NotifContent>
                  <div className="title">{n.title}</div>
                  <div className="msg">{n.message}</div>
                  <div className="time">{timeAgo(n.created_at)}</div>
                </NotifContent>
                {!n.is_read && <UnreadDot />}
              </NotifItem>
            ))}
          </NotifList>
        </Panel>
      </Anchor>

      {activeCard && (
        <AllocationCard meta={activeCard} onClose={() => setActiveCard(null)} />
      )}
    </>
  )
}
