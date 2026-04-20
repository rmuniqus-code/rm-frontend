'use client'

import styled from 'styled-components'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const Card = styled.button`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 20px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-sm);
  text-align: left;
  width: 100%;
  transition: all var(--transition-fast);

  &:hover {
    box-shadow: var(--shadow-md);
    border-color: var(--color-primary);
  }
`

const Label = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

const Value = styled.span`
  font-size: 28px;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.2;
`

const TrendWrapper = styled.div<{ $direction: 'up' | 'down' | 'flat' }>`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: ${p =>
    p.$direction === 'up' ? 'var(--color-trend-up)' :
    p.$direction === 'down' ? 'var(--color-trend-down)' :
    'var(--color-text-muted)'};
`

const Subtitle = styled.span`
  font-size: 12px;
  color: var(--color-text-muted);
`

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: number;
  onClick?: () => void;
}

export default function StatCard({ title, value, subtitle, change, onClick }: StatCardProps) {
  const direction = change && change > 0 ? 'up' : change && change < 0 ? 'down' : 'flat'

  return (
    <Card onClick={onClick} type="button">
      <Label>{title}</Label>
      <Value>{value}</Value>
      {change !== undefined && (
        <TrendWrapper $direction={direction}>
          {direction === 'up' && <TrendingUp size={14} />}
          {direction === 'down' && <TrendingDown size={14} />}
          {direction === 'flat' && <Minus size={14} />}
          <span>{change > 0 ? '+' : ''}{change}%</span>
        </TrendWrapper>
      )}
      {subtitle && <Subtitle>{subtitle}</Subtitle>}
    </Card>
  )
}
