'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styled from 'styled-components'
import {
  BarChart3,
  FileText,
  FolderKanban,
  Users,
  TrendingUp,
  ClipboardList,
  ChevronLeft,
  ChevronRight,
  Shield,
} from 'lucide-react'
import { useRole } from '@/components/shared/role-context'

const baseNavItems = [
  { title: 'Dashboard', url: '/dashboard', icon: BarChart3 },
  { title: 'Resource Requests', url: '/requests', icon: FileText },
  { title: 'Projects', url: '/projects', icon: FolderKanban },
  { title: 'Resources', url: '/resources', icon: Users },
  { title: 'Forecasting', url: '/forecasting', icon: TrendingUp },
  { title: 'Audit Trail', url: '/version-history', icon: ClipboardList },
]

const adminNavItem = { title: 'Admin', url: '/admin', icon: Shield }

const SidebarContainer = styled.aside<{ $collapsed: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  width: ${p => p.$collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)'};
  background: var(--color-bg-sidebar);
  color: var(--color-text-sidebar);
  display: flex;
  flex-direction: column;
  transition: width var(--transition-normal);
  z-index: 50;
  overflow: hidden;
`

const SidebarHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  min-height: 56px;
`

const LogoIcon = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  min-width: 32px;
  border-radius: 8px;
  background: var(--color-primary);
  color: #fff;
`

const LogoText = styled.div`
  overflow: hidden;
  white-space: nowrap;

  h2 {
    font-size: 14px;
    font-weight: 600;
    color: #fff;
    line-height: 1.2;
  }

  p {
    font-size: 11px;
    color: var(--color-text-sidebar);
    line-height: 1.2;
  }
`

const Nav = styled.nav`
  flex: 1;
  padding: 8px;
  overflow-y: auto;
`

const NavItem = styled(Link)<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--border-radius);
  color: ${p => p.$active ? 'var(--color-text-sidebar-active)' : 'var(--color-text-sidebar)'};
  background: ${p => p.$active ? 'var(--color-bg-sidebar-active)' : 'transparent'};
  font-size: 13px;
  font-weight: ${p => p.$active ? 500 : 400};
  transition: all var(--transition-fast);
  white-space: nowrap;
  overflow: hidden;

  &:hover {
    background: var(--color-bg-sidebar-active);
    color: var(--color-text-sidebar-active);
  }

  svg {
    min-width: 18px;
    width: 18px;
    height: 18px;
  }
`

const CollapseButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--color-text-sidebar);
  transition: color var(--transition-fast);

  &:hover {
    color: #fff;
  }
`

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const pathname = usePathname()
  const { canAccessAdmin } = useRole()
  const navItems = canAccessAdmin ? [...baseNavItems, adminNavItem] : baseNavItems

  return (
    <SidebarContainer $collapsed={collapsed}>
      <SidebarHeader>
        <LogoIcon>
          <BarChart3 size={16} />
        </LogoIcon>
        {!collapsed && (
          <LogoText>
            <h2>RMT</h2>
            <p>Resource Manager</p>
          </LogoText>
        )}
      </SidebarHeader>

      <Nav>
        {navItems.map(item => (
          <NavItem
            key={item.url}
            href={item.url}
            $active={pathname === item.url || (item.url !== '/dashboard' && pathname.startsWith(item.url))}
          >
            <item.icon />
            {!collapsed && <span>{item.title}</span>}
          </NavItem>
        ))}
      </Nav>

      <CollapseButton onClick={onToggle}>
        {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </CollapseButton>
    </SidebarContainer>
  )
}
