'use client'

import { useState } from 'react'
import styled from 'styled-components'
import AppSidebar from '@/components/layout/app-sidebar'
import TopBar from '@/components/layout/top-bar'
import { ToastProvider } from '@/components/shared/toast'
import { ThemeProvider } from '@/lib/theme-context'
import { RoleProvider } from '@/components/shared/role-context'
import { RequestsProvider } from '@/components/shared/requests-context'

const LayoutWrapper = styled.div`
  display: flex;
  min-height: 100vh;
`

const MainArea = styled.div<{ $collapsed: boolean }>`
  flex: 1;
  margin-left: ${p => p.$collapsed ? 'var(--sidebar-collapsed-width)' : 'var(--sidebar-width)'};
  transition: margin-left var(--transition-normal);
  display: flex;
  flex-direction: column;
  min-height: 100vh;
`

const Content = styled.main`
  flex: 1;
  padding: 24px;
  overflow-y: auto;
`

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <ThemeProvider>
      <RoleProvider>
        <RequestsProvider>
          <ToastProvider>
          <LayoutWrapper>
            <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
            <MainArea $collapsed={collapsed}>
              <TopBar onMenuClick={() => setCollapsed(!collapsed)} />
              <Content>{children}</Content>
            </MainArea>
          </LayoutWrapper>
          </ToastProvider>
        </RequestsProvider>
      </RoleProvider>
    </ThemeProvider>
  )
}
