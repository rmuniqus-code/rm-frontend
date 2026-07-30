'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import styled from 'styled-components'
import { AuthProvider, useAuth } from '@ai-universe/auth-react'

const Page = styled.div`
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
`

const Card = styled.div`
  width: 100%;
  max-width: 400px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 40px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);
  text-align: center;
`

const Logo = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-bottom: 32px;
`

const LogoBox = styled.div`
  width: 36px;
  height: 36px;
  background: var(--color-primary);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-weight: 700;
  font-size: 16px;
`

const AppName = styled.span`
  font-size: 17px;
  font-weight: 700;
  color: var(--color-text);
`

const Heading = styled.h1`
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 8px;
`

const Subheading = styled.p`
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 28px;
`

const LoginButton = styled.button`
  width: 100%;
  padding: 11px;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: var(--border-radius);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background var(--transition-fast);

  &:hover {
    background: var(--color-primary-hover);
  }
`

function LoginInner() {
  const { login, isAuthenticated } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (isAuthenticated) {
      const next = searchParams.get('next') ?? '/dashboard'
      router.replace(next)
    } else {
      login()
    }
  }, [isAuthenticated, login, router, searchParams])

  return (
    <Page>
      <Card>
        <Logo>
          <LogoBox>RM</LogoBox>
          <AppName>Resource Manager</AppName>
        </Logo>

        <Heading>Signing you in&hellip;</Heading>
        <Subheading>You will be redirected to the login page shortly.</Subheading>

        <LoginButton onClick={() => login()}>
          Sign in manually
        </LoginButton>
      </Card>
    </Page>
  )
}

export default function LoginPage() {
  return (
    <AuthProvider publishableKey={process.env.NEXT_PUBLIC_AIU_PUBLISHABLE_KEY!}>
      <LoginInner />
    </AuthProvider>
  )
}
