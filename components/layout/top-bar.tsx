'use client'

import { useState, useRef, useEffect } from 'react'
import styled from 'styled-components'
import { Search, Bell, Upload, Download, Menu, Moon, Sun, LogOut, User, Pencil, Check, X, ChevronDown } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import NotificationPanel from '@/components/shared/notification-panel'
import { useRole } from '@/components/shared/role-context'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'
import { apiAuthHeader } from '@/lib/api'

const TopBarContainer = styled.header`
  height: var(--topbar-height);
  background: var(--color-bg-topbar);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  gap: 16px;
`

const LeftSection = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const MenuButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--border-radius);
  color: var(--color-text-secondary);

  &:hover {
    background: var(--color-border-light);
  }

  @media (min-width: 769px) {
    display: none;
  }
`

const SearchWrapper = styled.div`
  position: relative;
  width: 280px;

  svg {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
    width: 16px;
    height: 16px;
  }

  input {
    width: 100%;
    padding: 8px 12px 8px 34px;
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius);
    background: var(--color-bg);
    font-size: 13px;
    outline: none;
    transition: border-color var(--transition-fast);

    &::placeholder {
      color: var(--color-text-muted);
    }

    &:focus {
      border-color: var(--color-primary);
    }
  }
`

const RightSection = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`

const IconButton = styled.button`
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

const NotifBadge = styled.span`
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  background: var(--color-danger);
  border-radius: 50%;
  border: 2px solid var(--color-bg-topbar);
`

const ThemeToggle = styled.button`
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

const ProfileWrapper = styled.div`
  position: relative;
`

const ExportWrapper = styled.div`
  position: relative;
`

const ExportMenu = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 180px;
  background: var(--color-bg-card, var(--color-bg));
  border: 1px solid var(--color-border);
  border-radius: calc(var(--border-radius) + 2px);
  box-shadow: 0 6px 20px rgba(0,0,0,0.12);
  z-index: 1000;
  overflow: hidden;
`

const ExportItem = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  font-size: 13px;
  color: var(--color-text);
  transition: background var(--transition-fast);

  &:hover { background: var(--color-border-light); }
  &:disabled { opacity: 0.5; cursor: not-allowed; }
`

const AvatarButton = styled.button<{ $open: boolean }>`
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid transparent;
  outline: ${p => p.$open ? '2px solid var(--color-primary)' : 'none'};
  outline-offset: 2px;
  transition: all var(--transition-fast);

  &:hover { opacity: 0.88; }
`

const ProfileMenu = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 240px;
  background: var(--color-bg-card, var(--color-bg));
  border: 1px solid var(--color-border);
  border-radius: calc(var(--border-radius) + 2px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.14);
  z-index: 1000;
  overflow: hidden;
`

const ProfileHeader = styled.div`
  padding: 14px 16px;
`

const ProfileNameRow = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 3px;
`

const ProfileNameText = styled.span`
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const ProfileEmailText = styled.div`
  font-size: 12px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const EditRow = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  margin-bottom: 3px;

  input {
    flex: 1;
    padding: 5px 8px;
    font-size: 13px;
    border: 1px solid var(--color-primary);
    border-radius: var(--border-radius);
    background: var(--color-bg);
    color: var(--color-text);
    outline: none;
    min-width: 0;
  }
`

const SmallIconBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: var(--border-radius);
  color: var(--color-text-secondary);
  flex-shrink: 0;

  &:hover {
    background: var(--color-border-light);
    color: var(--color-text);
  }
`

const ProfileDivider = styled.div`
  height: 1px;
  background: var(--color-border);
`

const ProfileAction = styled.button`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  font-size: 13px;
  color: var(--color-danger, #e53e3e);
  transition: background var(--transition-fast);

  &:hover {
    background: var(--color-border-light);
  }
`

interface TopBarProps {
  onMenuClick?: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { theme, toggleTheme } = useTheme()
  const { user, email, updateDisplayName } = useRole()
  const router = useRouter()

  const [profileOpen, setProfileOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
        setEditing(false)
      }
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const initials = user.name
    .split(' ')
    .slice(0, 2)
    .map(s => s[0]?.toUpperCase() ?? '')
    .join('')

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const handleStartEdit = () => {
    setEditValue(user.name)
    setEditing(true)
  }

  const downloadExport = async (type: string, params?: string) => {
    setExporting(type)
    setExportOpen(false)
    try {
      const auth = await apiAuthHeader()
      const url = `${process.env.NEXT_PUBLIC_API_BASE_URL ?? ''}/api/exports/${type}${params ? `?${params}` : ''}`
      const res = await fetch(url, { headers: auth })
      if (!res.ok) { setExporting(null); return }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[ 1] ?? `${type}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setExporting(null)
    }
  }

  const handleSaveName = async () => {
    const trimmed = editValue.trim()
    if (!trimmed || trimmed === user.name) { setEditing(false); return }
    setSaving(true)
    await updateDisplayName(trimmed)
    setSaving(false)
    setEditing(false)
  }

  return (
    <TopBarContainer>
      <LeftSection>
        <MenuButton onClick={onMenuClick}>
          <Menu size={20} />
        </MenuButton>
        <SearchWrapper>
          <Search />
          <input type="text" placeholder="Search resources, projects..." />
        </SearchWrapper>
      </LeftSection>

      <RightSection>
        <ThemeToggle onClick={toggleTheme} title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </ThemeToggle>
        <IconButton title="Import">
          <Upload size={18} />
        </IconButton>

        <ExportWrapper ref={exportRef}>
          <IconButton
            title="Export"
            onClick={() => setExportOpen(o => !o)}
            style={exportOpen ? { background: 'var(--color-border-light)' } : undefined}
          >
            <Download size={18} />
            <ChevronDown size={12} style={{ marginLeft: 1 }} />
          </IconButton>
          {exportOpen && (
            <ExportMenu>
              <ExportItem
                disabled={!!exporting}
                onClick={() => downloadExport('employees')}
              >
                <Download size={13} />
                {exporting === 'employees' ? 'Exporting…' : 'Employees CSV'}
              </ExportItem>
              <ExportItem
                disabled={!!exporting}
                onClick={() => {
                  const today = new Date().toISOString().slice(0, 10)
                  const d30 = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)
                  downloadExport('allocations', `from=${today}&to=${d30}`)
                }}
              >
                <Download size={13} />
                {exporting === 'allocations' ? 'Exporting…' : 'Allocations CSV'}
              </ExportItem>
              <ExportItem
                disabled={!!exporting}
                onClick={() => downloadExport('utilization')}
              >
                <Download size={13} />
                {exporting === 'utilization' ? 'Exporting…' : 'Utilization CSV'}
              </ExportItem>
            </ExportMenu>
          )}
        </ExportWrapper>

        <NotificationPanel />

        <ProfileWrapper ref={profileRef}>
          <AvatarButton
            $open={profileOpen}
            onClick={() => { setProfileOpen(o => !o); setEditing(false) }}
            title="Profile"
          >
            {initials || <User size={14} />}
          </AvatarButton>

          {profileOpen && (
            <ProfileMenu>
              <ProfileHeader>
                {editing ? (
                  <EditRow>
                    <input
                      autoFocus
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') handleSaveName()
                        if (e.key === 'Escape') setEditing(false)
                      }}
                      disabled={saving}
                      placeholder="Display name"
                    />
                    <SmallIconBtn onClick={handleSaveName} title="Save" disabled={saving}>
                      <Check size={14} color="var(--color-success, #38a169)" />
                    </SmallIconBtn>
                    <SmallIconBtn onClick={() => setEditing(false)} title="Cancel">
                      <X size={14} />
                    </SmallIconBtn>
                  </EditRow>
                ) : (
                  <ProfileNameRow>
                    <ProfileNameText title={user.name}>{user.name}</ProfileNameText>
                    <SmallIconBtn onClick={handleStartEdit} title="Edit display name">
                      <Pencil size={13} />
                    </SmallIconBtn>
                  </ProfileNameRow>
                )}
                <ProfileEmailText title={email}>{email}</ProfileEmailText>
              </ProfileHeader>
              <ProfileDivider />
              <ProfileAction onClick={handleLogout}>
                <LogOut size={15} />
                Sign out
              </ProfileAction>
            </ProfileMenu>
          )}
        </ProfileWrapper>
      </RightSection>
    </TopBarContainer>
  )
}
