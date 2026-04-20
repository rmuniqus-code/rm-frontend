'use client'

import styled from 'styled-components'

const ToggleWrapper = styled.div`
  display: inline-flex;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  overflow: hidden;
  background: var(--color-bg-card);
`

const ToggleButton = styled.button<{ $active: boolean }>`
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: ${p => p.$active ? '#fff' : 'var(--color-text-secondary)'};
  background: ${p => p.$active ? 'var(--color-primary)' : 'transparent'};
  transition: all var(--transition-fast);
  border-right: 1px solid var(--color-border);

  &:last-child {
    border-right: none;
  }

  &:hover:not([disabled]) {
    background: ${p => p.$active ? 'var(--color-primary-hover)' : 'var(--color-border-light)'};
  }
`

interface ToggleViewProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
}

export default function ToggleView({ options, value, onChange }: ToggleViewProps) {
  return (
    <ToggleWrapper>
      {options.map(opt => (
        <ToggleButton
          key={opt}
          $active={opt === value}
          onClick={() => onChange(opt)}
        >
          {opt}
        </ToggleButton>
      ))}
    </ToggleWrapper>
  )
}
