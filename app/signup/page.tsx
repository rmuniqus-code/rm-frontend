'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styled from 'styled-components'
import { UserPlus, AlertCircle, CheckCircle } from 'lucide-react'

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

const SuccessBanner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: var(--border-radius);
  color: #16a34a;
  font-size: 13px;
  line-height: 1.5;
`

const Footer = styled.p`
  text-align: center;
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-top: 24px;

  a {
    color: var(--color-primary);
    font-weight: 500;
    text-decoration: none;
    &:hover { text-decoration: underline; }
  }
`

const HintText = styled.p`
  font-size: 11px;
  color: var(--color-text-muted);
  margin-top: 4px;
`

export default function SignupPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)
    const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? ''

    const res = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Registration failed')
      return
    }

    setSuccess(true)
  }

  if (success) {
    return (
      <Page>
        <Card>
          <Logo>
            <LogoBox>RM</LogoBox>
            <AppName>Resource Manager</AppName>
          </Logo>
          <SuccessBanner>
            <CheckCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>Account created!</strong><br />
              Check your email and click the verification link before signing in.
            </div>
          </SuccessBanner>
          <Footer style={{ marginTop: 16 }}>
            <Link href="/login">Back to sign in</Link>
          </Footer>
        </Card>
      </Page>
    )
  }

  return (
    <Page>
      <Card>
        <Logo>
          <LogoBox>RM</LogoBox>
          <AppName>Resource Manager</AppName>
        </Logo>

        <Heading>Create account</Heading>
        <Subheading>You&rsquo;ll be added as an Employee. An admin can update your role.</Subheading>

        {error && (
          <ErrorBanner>
            <AlertCircle size={15} />
            {error}
          </ErrorBanner>
        )}

        <form onSubmit={handleSubmit}>
          <Field>
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Jane Smith"
              value={name}
              onChange={e => setName(e.target.value)}
              required
            />
          </Field>

          <Field>
            <Label htmlFor="email">Work email</Label>
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
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <HintText>Minimum 8 characters</HintText>
          </Field>

          <Field>
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              required
            />
          </Field>

          <SubmitButton type="submit" disabled={loading}>
            <UserPlus size={16} />
            {loading ? 'Creating account…' : 'Create account'}
          </SubmitButton>
        </form>

        <Footer>
          Already have an account? <Link href="/login">Sign in</Link>
        </Footer>
      </Card>
    </Page>
  )
}
