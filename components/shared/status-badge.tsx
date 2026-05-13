'use client'

import styled from 'styled-components'
import { Check, X, Circle, Clock, ThumbsUp } from 'lucide-react'
import type { ApprovalStatus } from '@/data/request-data'

const badgeStyles: Record<ApprovalStatus, { bg: string; color: string; border: string }> = {
  todo: {
    bg: 'var(--color-bg)',
    color: 'var(--color-text-secondary)',
    border: 'var(--color-border)',
  },
  shortlisted: {
    bg: '#fef9c3',
    color: '#a16207',
    border: '#fde68a',
  },
  em_approved: {
    bg: '#dbeafe',
    color: '#1d4ed8',
    border: '#bfdbfe',
  },
  approved: {
    bg: 'var(--color-success-light)',
    color: '#15803d',
    border: '#bbf7d0',
  },
  blocked: {
    bg: 'var(--color-danger-light)',
    color: '#b91c1c',
    border: '#fecaca',
  },
}

const badgeLabels: Record<ApprovalStatus, string> = {
  todo: 'Pending',
  shortlisted: 'Review Required',
  em_approved: 'Awaiting Approval',
  approved: 'Approved',
  blocked: 'Rejected',
}

const Badge = styled.span<{ $status: ApprovalStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  background: ${p => badgeStyles[p.$status].bg};
  color: ${p => badgeStyles[p.$status].color};
  border: 1px solid ${p => badgeStyles[p.$status].border};

  svg {
    width: 12px;
    height: 12px;
  }
`

interface StatusBadgeProps {
  status: ApprovalStatus;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge $status={status}>
      {status === 'approved'    && <Check />}
      {status === 'blocked'     && <X />}
      {status === 'todo'        && <Circle />}
      {status === 'shortlisted' && <Clock />}
      {status === 'em_approved' && <ThumbsUp />}
      {badgeLabels[status] ?? status}
    </Badge>
  )
}
