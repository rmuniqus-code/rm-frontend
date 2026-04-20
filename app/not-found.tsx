'use client'

import styled from 'styled-components'
import Link from 'next/link'

const Container = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  text-align: center;
  padding: 24px;
`

const Code = styled.h1`
  font-size: 72px;
  font-weight: 800;
  color: var(--color-primary);
  line-height: 1;
`

const Message = styled.p`
  font-size: 18px;
  color: var(--color-text-secondary);
  margin: 12px 0 24px;
`

const HomeLink = styled(Link)`
  padding: 10px 24px;
  background: var(--color-primary);
  color: #fff;
  border-radius: var(--border-radius);
  font-size: 14px;
  font-weight: 500;
  transition: background var(--transition-fast);

  &:hover {
    background: var(--color-primary-hover);
  }
`

export default function NotFound() {
  return (
    <Container>
      <Code>404</Code>
      <Message>Page not found</Message>
      <HomeLink href="/dashboard">Back to Dashboard</HomeLink>
    </Container>
  )
}
