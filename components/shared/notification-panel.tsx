'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import styled from 'styled-components'
import { Bell, Check, CheckCheck, UserPlus, AlertTriangle, Calendar, Trash2 } from 'lucide-react'
import { apiRaw } from '@/lib/api'

export interface Notification {
  id: string
  type: string
  title: string
  message: string
  is_read: boolean
  created_at: string
}

/* ─── Mock fallback — shown while first API fetch is in flight ── */
const mockNotifications: Notification[] = [
  { id: 'n1', type: 'approval', title: 'Allocation Approved', message: 'Sarah Chen → Project Alpha approved by Lisa Wang', is_read: false, created_at: new Date(Date.now() - 2*60000).toISOString() },
  { id: 'n2', type: 'request_raised', title: 'Request Pending', message: 'New team member request for Yatra Online INC', is_read: false, created_at: new Date(Date.now() - 15*60000).toISOString() },
  { id: 'n3', type: 'booking_confirmed', title: 'Booking Confirmed', message: 'You have been assigned to Project Beta as Strategy Lead', is_read: false, created_at: new Date(Date.now() - 60*60000).toISOString() },
  { id: 'n4', type: 'over_allocation', title: 'Over-Allocation Warning', message: 'Michael Torres is at 120% FTE — requires attention', is_read: false, created_at: new Date(Date.now() - 2*60*60000).toISOString() },
  { id: 'n5', type: 'booking_confirmed', title: 'Booking Confirmed', message: 'John Smith → Project Beta confirmed for Q1 2026', is_read: true, created_at: new Date(Date.now() - 3*60*60000).toISOString() },
  { id: 'n6', type: 'request_raised', title: 'Extension Request', message: 'Emily Brown requested extension on Project Epsilon', is_read: true, created_at: new Date(Date.now() - 5*60*60000).toISOString() },
  { id: 'n7', type: 'timesheet_gap', title: 'Timesheet Gap Detected', message: '3 resources have not submitted timesheets for WC 1 Dec', is_read: true, created_at: new Date(Date.now() - 24*60*60000).toISOString() },
  { id: 'n8', type: 'allocation_updated', title: 'Role Reassignment', message: 'Priya Patel moved from Project Delta to Project Gamma', is_read: true, created_at: new Date(Date.now() - 24*60*60000).toISOString() },
]

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

const NotifItem = styled.div<{ $read: boolean }>`
  display: flex;
  gap: 10px;
  padding: 12px 16px;
  cursor: pointer;
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

const POLL_INTERVAL = 60_000 // 60 seconds — poll only when panel is open

export default function NotificationPanel() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications)
  const [hasLiveData, setHasLiveData] = useState(false)
  const [fetchFailed, setFetchFailed] = useState(false)
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
        // API returned an error (e.g. table doesn't exist) — stop polling
        setFetchFailed(true)
      }
    } catch {
      setFetchFailed(true)
    }
  }, [])

  // Fetch once on mount (not continuously)
  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true
      fetchNotifications()
    }
  }, [fetchNotifications])

  // Poll only when the panel is open AND the API is healthy
  useEffect(() => {
    if (!open || fetchFailed) return
    const interval = setInterval(fetchNotifications, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [open, fetchFailed, fetchNotifications])

  // Re-fetch when the panel is opened
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
        await apiRaw('/api/notifications', {
          method: 'DELETE',
        })
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

  return (
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
            <NotifItem key={n.id} $read={n.is_read} onClick={() => markRead(n.id)}>
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
  )
}
