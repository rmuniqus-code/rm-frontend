'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import styled from 'styled-components'
import { LogIn, AlertCircle } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'

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
`

const Logo = styled.div`
  display: flex;
  align-items: center;
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
  margin-bottom: 4px;
`

const Subheading = styled.p`
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 28px;
`

const Field = styled.div`
  margin-bottom: 16px;
`

const Label = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  margin-bottom: 6px;
`

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg);
  color: var(--color-text);
  font-size: 14px;
  outline: none;
  transition: border-color var(--transition-fast);

  &:focus {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px var(--color-primary-light);
  }

  &::placeholder {
    color: var(--color-text-muted);
  }
`

const SubmitButton = styled.button`
  width: 100%;
  padding: 11px;
  background: var(--color-primary);
  color: #fff;
  border: none;
  border-radius: var(--border-radius);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
  transition: background var(--transition-fast);

  &:hover:not(:disabled) {
    background: var(--color-primary-hover);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`

const ErrorBanner = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: var(--border-radius);
  color: #dc2626;
  font-size: 13px;
  margin-bottom: 16px;
`

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <Page>
      <Card>
        <Logo>
          <LogoBox>RM</LogoBox>
          <AppName>Resource Manager</AppName>
        </Logo>

        <Heading>Sign in</Heading>
        <Subheading>Enter your credentials to access the platform.</Subheading>

        {error && (
          <ErrorBanner>
            <AlertCircle size={15} />
            {error}
          </ErrorBanner>
        )}

        <form onSubmit={handleSubmit}>
          <Field>
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </Field>

          <Field>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </Field>

          <SubmitButton type="submit" disabled={loading}>
            <LogIn size={16} />
            {loading ? 'Signing in…' : 'Sign in'}
          </SubmitButton>
        </form>
      </Card>
    </Page>
  )
}
