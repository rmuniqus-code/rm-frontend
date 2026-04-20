'use client'

import { ReactNode } from 'react'
import styled from 'styled-components'
import { Search, Filter } from 'lucide-react'

const Bar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
`

const SearchInput = styled.div`
  position: relative;
  flex: 0 1 280px;

  svg {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-muted);
    width: 16px;
    height: 16px;
  }

  input {
    width: 100%;
    padding: 8px 12px 8px 34px;
    border: 1px solid var(--color-border);
    border-radius: var(--border-radius);
    background: var(--color-bg-card);
    font-size: 13px;
    outline: none;

    &:focus {
      border-color: var(--color-primary);
    }

    &::placeholder {
      color: var(--color-text-muted);
    }
  }
`

const FilterButton = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg-card);
  font-size: 13px;
  color: var(--color-text-secondary);
  transition: all var(--transition-fast);

  &:hover {
    border-color: var(--color-primary);
    color: var(--color-primary);
  }
`

const SelectFilter = styled.select`
  padding: 8px 30px 8px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg-card);
  font-size: 13px;
  color: var(--color-text);
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  cursor: pointer;

  &:focus {
    border-color: var(--color-primary);
  }
`

const Spacer = styled.div`
  flex: 1;
`

interface FilterBarProps {
  searchPlaceholder?: string;
  onSearch?: (value: string) => void;
  children?: ReactNode;
  actions?: ReactNode;
}

export default function FilterBar({
  searchPlaceholder = 'Search...',
  onSearch,
  children,
  actions,
}: FilterBarProps) {
  return (
    <Bar>
      <SearchInput>
        <Search />
        <input
          type="text"
          placeholder={searchPlaceholder}
          onChange={(e) => onSearch?.(e.target.value)}
        />
      </SearchInput>
      <FilterButton>
        <Filter size={14} />
        Filter
      </FilterButton>
      {children}
      <Spacer />
      {actions}
    </Bar>
  )
}

export { SelectFilter }
