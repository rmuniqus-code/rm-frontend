'use client'

import styled from 'styled-components'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

const Card = styled.button<{ $accent?: string }>`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px 20px 18px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-left: ${p => p.$accent ? `3px solid ${p.$accent}` : '1px solid var(--color-border)'};
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-sm);
  text-align: left;
  width: 100%;
  position: relative;
  overflow: hidden;
  transition: all var(--transition-fast);

  /* Subtle tint from left edge */
  ${p => p.$accent ? `
    background: linear-gradient(105deg, ${p.$accent}12 0%, transparent 55%), var(--color-bg-card);
  ` : ''}

  &:hover {
    box-shadow: var(--shadow-md);
    border-color: ${p => p.$accent ?? 'var(--color-primary)'};
    ${p => p.$accent ? `border-left-color: ${p.$accent};` : ''}
    transform: translateY(-1px);
  }
`

const Label = styled.span`
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
`

const Value = styled.span<{ $accent?: string }>`
  font-size: 28px;
  font-weight: 700;
  color: ${p => p.$accent ?? 'var(--color-text)'};
  line-height: 1.15;
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
  line-height: 1.4;
`

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  change?: number;
  onClick?: () => void;
  /** Hex color — adds a left accent border + soft tint, and tints the value */
  accent?: string;
}

export default function StatCard({ title, value, subtitle, change, onClick, accent }: StatCardProps) {
  const direction = change && change > 0 ? 'up' : change && change < 0 ? 'down' : 'flat'

  return (
    <Card onClick={onClick} type="button" $accent={accent}>
      <Label>{title}</Label>
      <Value $accent={accent}>{value}</Value>
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
