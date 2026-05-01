'use client'
import React, { useRef, useState, useEffect, useCallback } from 'react'
import styled from 'styled-components'
import { ChevronDown, X, Check } from 'lucide-react'

// ── Styled ─────────────────────────────────────────────────────────────────────

const Wrapper = styled.div`
  position: relative;
  display: inline-block;
  min-width: 140px;
  max-width: 240px;
`

const Trigger = styled.button<{ $open: boolean; $hasValue: boolean }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  border: 1.5px solid ${p => p.$hasValue ? 'var(--color-primary)' : 'var(--color-border)'};
  border-radius: var(--border-radius);
  background: ${p => p.$hasValue ? 'var(--color-primary-light)' : 'var(--color-bg-card)'};
  color: ${p => p.$hasValue ? 'var(--color-primary)' : 'var(--color-text)'};
  font-size: 12px;
  font-weight: ${p => p.$hasValue ? 600 : 400};
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
  min-height: 32px;

  &:focus { outline: none; box-shadow: var(--focus-ring); }
  &:hover { border-color: var(--color-primary); }
`

const TriggerLabel = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  text-align: left;
`

const DropContainer = styled.div<{ $open: boolean }>`
  display: ${p => p.$open ? 'block' : 'none'};
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 100%;
  max-width: 280px;
  background: var(--color-bg-card);
  border: 1.5px solid var(--color-border);
  border-radius: var(--border-radius);
  box-shadow: 0 8px 24px rgba(0,0,0,0.12);
  z-index: 9999;
  overflow: hidden;
`

const SearchBox = styled.input`
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
  font-size: 12px;
  color: var(--color-text);
  outline: none;
  box-sizing: border-box;
`

const ActionRow = styled.div`
  display: flex;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg);
`

const ActionBtn = styled.button`
  font-size: 11px;
  color: var(--color-primary);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.1s;
  &:hover { background: var(--color-primary-light); }
`

const OptionList = styled.ul`
  list-style: none;
  margin: 0;
  padding: 4px 0;
  max-height: 220px;
  overflow-y: auto;
`

const OptionItem = styled.li<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  cursor: pointer;
  font-size: 12px;
  color: ${p => p.$selected ? 'var(--color-primary)' : 'var(--color-text)'};
  background: ${p => p.$selected ? 'var(--color-primary-light)' : 'transparent'};
  transition: background 0.1s;
  &:hover { background: var(--color-border-light); }
`

const CheckIcon = styled.span<{ $checked: boolean }>`
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  border: 1.5px solid ${p => p.$checked ? 'var(--color-primary)' : 'var(--color-border)'};
  border-radius: 3px;
  background: ${p => p.$checked ? 'var(--color-primary)' : 'transparent'};
  display: flex;
  align-items: center;
  justify-content: center;
`

const ClearBtn = styled.span`
  display: flex;
  align-items: center;
  color: var(--color-text-muted);
  padding: 2px 2px;
  border-radius: 3px;
  transition: color 0.1s;
  flex-shrink: 0;
  cursor: pointer;
  &:hover { color: var(--color-danger); }
`

// ── Component ───────────────────────────────────────────────────────────────────

interface MultiSelectProps {
  options: string[]
  values: string[]          // selected items — empty = "All"
  onChange: (values: string[]) => void
  placeholder?: string      // shown when nothing selected
  maxDisplayed?: number     // how many labels to show before "X more"
  disabled?: boolean
}

export default function MultiSelect({
  options,
  values,
  onChange,
  placeholder = 'All',
  maxDisplayed = 2,
  disabled = false,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = useCallback((opt: string) => {
    const next = values.includes(opt)
      ? values.filter(v => v !== opt)
      : [...values, opt]
    onChange(next)
  }, [values, onChange])

  const selectAll = () => onChange([...options])
  const clearAll = () => onChange([])

  const filtered = search
    ? options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
    : options

  // Display label
  const label = values.length === 0
    ? placeholder
    : values.length <= maxDisplayed
      ? values.join(', ')
      : `${values.slice(0, maxDisplayed).join(', ')} +${values.length - maxDisplayed}`

  const hasValue = values.length > 0

  return (
    <Wrapper ref={ref}>
      <Trigger
        type="button"
        $open={open}
        $hasValue={hasValue}
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
      >
        <TriggerLabel>{label}</TriggerLabel>
        {hasValue && (
          <ClearBtn
            role="button"
            aria-label="Clear selection"
            onClick={(e) => { e.stopPropagation(); clearAll() }}
            title="Clear selection"
          >
            <X size={11} />
          </ClearBtn>
        )}
        <ChevronDown size={12} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
      </Trigger>

      <DropContainer $open={open}>
        {options.length > 6 && (
          <SearchBox
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onClick={e => e.stopPropagation()}
            autoFocus
          />
        )}
        <ActionRow>
          <ActionBtn type="button" onClick={selectAll}>Select All</ActionBtn>
          {hasValue && <ActionBtn type="button" onClick={clearAll}>Clear</ActionBtn>}
        </ActionRow>
        <OptionList>
          {filtered.length === 0 && (
            <OptionItem $selected={false} style={{ color: 'var(--color-text-muted)', cursor: 'default' }}>
              No options
            </OptionItem>
          )}
          {filtered.map(opt => {
            const selected = values.includes(opt)
            return (
              <OptionItem key={opt} $selected={selected} onClick={() => toggle(opt)}>
                <CheckIcon $checked={selected}>
                  {selected && <Check size={10} strokeWidth={3} color="#fff" />}
                </CheckIcon>
                {opt}
              </OptionItem>
            )
          })}
        </OptionList>
      </DropContainer>
    </Wrapper>
  )
}
