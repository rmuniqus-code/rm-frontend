'use client'

import styled from 'styled-components'
import { useDesignationFilter } from './designation-filter-context'
import type { DesignationFilter } from '@/lib/designation-filter'

const Group = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  background: #EAECF0;
  border-radius: 8px;
  padding: 2px;
`

const Btn = styled.button<{ $active: boolean }>`
  padding: 5px 14px;
  border-radius: 6px;
  border: none;
  font-size: 13px;
  font-weight: ${p => p.$active ? '600' : '400'};
  cursor: pointer;
  background: ${p => p.$active ? '#4E2C79' : 'transparent'};
  color: ${p => p.$active ? '#fff' : '#475467'};
  transition: all 0.15s;
  white-space: nowrap;
  line-height: 20px;

  &:hover {
    background: ${p => p.$active ? '#3D2261' : '#F9FAFB'};
  }
`

const OPTIONS: { value: DesignationFilter; label: string }[] = [
  { value: 'all',      label: 'All' },
  { value: 'upto_ad',  label: 'Upto AD' },
  { value: 'pd_group', label: 'PD Group' },
]

export default function DesignationFilterButtons() {
  const { filter, setFilter } = useDesignationFilter()
  return (
    <Group>
      {OPTIONS.map(o => (
        <Btn key={o.value} $active={filter === o.value} onClick={() => setFilter(o.value)}>
          {o.label}
        </Btn>
      ))}
    </Group>
  )
}
