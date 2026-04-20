'use client'

import { useState } from 'react'
import styled from 'styled-components'
import { Search, Bell, Upload, Download, Menu, Moon, Sun, Shield } from 'lucide-react'
import { useTheme } from '@/lib/theme-context'
import NotificationPanel from '@/components/shared/notification-panel'
import { useRole, type UserRole } from '@/components/shared/role-context'

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

const RoleSelect = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg);
  font-size: 12px;

  select {
    border: none;
    background: transparent;
    color: var(--color-text);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;

    &:focus {
      outline: none;
    }
  }
`

interface TopBarProps {
  onMenuClick?: () => void;
}

export default function TopBar({ onMenuClick }: TopBarProps) {
  const { theme, toggleTheme } = useTheme()
  const { role, setRole, roleLabel } = useRole()

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
        <RoleSelect>
          <Shield size={14} style={{ color: 'var(--color-primary)' }} />
          <select value={role} onChange={e => setRole(e.target.value as UserRole)}>
            <option value="admin">Admin</option>
            <option value="rm">Resource Manager</option>
            <option value="employee">Employee</option>
            <option value="slh">Service Line Head</option>
          </select>
        </RoleSelect>
        <ThemeToggle onClick={toggleTheme} title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}>
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </ThemeToggle>
        <IconButton title="Import">
          <Upload size={18} />
        </IconButton>
        <IconButton title="Export">
          <Download size={18} />
        </IconButton>
        <NotificationPanel />
      </RightSection>
    </TopBarContainer>
  )
}
