'use client'

import { useState } from 'react'
import styled from 'styled-components'

export type AllocationCategory = 'client' | 'internal' | 'training' | 'leaves' | 'available' | 'proposed'

export interface DayAllocation {
  id: string
  label: string          // e.g. "PS - Priya" or "Acme Portal"
  category: AllocationCategory
  hours?: number
  allocPct?: number      // source-of-truth allocation percentage (0-100)
  projectId?: string
  resourceId?: string
  emEp?: string          // engagement manager / engagement partner
  note?: string          // free-text comment saved to raw_text in DB
}

export interface GridRow {
  id: string
  name: string
  subtitle: string       // e.g. designation / role
  location?: string      // office location (city / country)
  avatar?: string        // 2-letter initials
  avatarColor?: string
  utilization?: number   // 0-100
  days: Record<string, DayAllocation[]>  // dayKey => allocations
}

interface AllocationGridProps {
  rows: GridRow[]
  dayColumns: { key: string; label: string; sublabel: string }[]
  perspective: 'resource' | 'project'
  onCellClick?: (row: GridRow, dayKey: string, alloc: DayAllocation) => void
  onRowClick?: (row: GridRow) => void
  onAddProjectClick?: (row: GridRow, dayKey: string) => void
  /** Pre-fetched confidential staff notes, keyed by empCode. Only pass when the viewer has the right role. */
  notesByEmpCode?: Record<string, string>
}

const Wrapper = styled.div`
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
`

const ScrollArea = styled.div`
  overflow-x: auto;
`

const Grid = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: 260px repeat(${p => p.$cols}, minmax(140px, 1fr));
  min-width: ${p => 260 + p.$cols * 140}px;
`

const HeaderCell = styled.div<{ $isFirst?: boolean }>`
  padding: 12px;
  text-align: ${p => p.$isFirst ? 'left' : 'center'};
  background: var(--color-bg);
  border-bottom: 2px solid var(--color-border);
  position: ${p => p.$isFirst ? 'sticky' : 'relative'};
  left: ${p => p.$isFirst ? '0' : 'auto'};
  z-index: ${p => p.$isFirst ? '3' : '1'};
`

const HeaderDay = styled.div`
  font-size: 12px;
  color: var(--color-text-secondary);
  font-weight: 500;
`

const HeaderDate = styled.div`
  font-size: 18px;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1.3;
`

const HeaderMonth = styled.div`
  font-size: 11px;
  color: var(--color-text-muted);
`

const HeaderLabel = styled.div`
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
`

const Row = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: 260px repeat(${p => p.$cols}, minmax(140px, 1fr));
  min-width: ${p => 260 + p.$cols * 140}px;
  border-bottom: 1px solid var(--color-border-light);
  transition: background var(--transition-fast);

  &:hover {
    background: rgba(0,0,0,0.015);
  }

  &:last-child {
    border-bottom: none;
  }
`

const NameCell = styled.div`
  padding: 12px;
  position: sticky;
  left: 0;
  z-index: 2;
  background: inherit;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  min-height: 80px;

  &:hover {
    background: var(--color-border-light);
  }
`

const ProjectIndicator = styled.div<{ $color: string }>`
  width: 4px;
  border-radius: 2px;
  align-self: stretch;
  background: ${p => p.$color};
  flex-shrink: 0;
`

const AvatarCircle = styled.div<{ $color: string }>`
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: ${p => p.$color};
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
`

const NameInfo = styled.div`
  flex: 1;
  min-width: 0;

  .name {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
    white-space: normal;
    overflow-wrap: break-word;
    word-break: break-word;
    line-height: 1.3;
  }

  .sub {
    font-size: 11px;
    color: var(--color-text-muted);
  }

  .loc {
    font-size: 10px;
    color: var(--color-text-muted);
    opacity: 0.75;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
`

const UtilBadge = styled.span<{ $value: number }>`
  font-size: 12px;
  font-weight: 600;
  color: ${p =>
    p.$value >= 80 ? 'var(--color-success)' :
    p.$value >= 50 ? 'var(--color-warning)' :
    'var(--color-danger)'};
  flex-shrink: 0;
`

const DayCell = styled.div`
  padding: 6px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  justify-content: flex-start;
  border-left: 1px solid var(--color-border-light);
  min-height: 80px;
`

const CATEGORY_COLORS: Record<AllocationCategory, { bg: string; text: string }> = {
  client:   { bg: '#0070C0', text: '#ffffff' },
  internal: { bg: '#3b82f6', text: '#ffffff' },
  training: { bg: '#8b5cf6', text: '#ffffff' },
  leaves:   { bg: '#FF33CC', text: '#ffffff' },
  available:{ bg: '#92D050', text: '#1a5c00' },
  proposed: { bg: '#9ca3af', text: '#ffffff' },
}

const AllocBlock = styled.div<{ $category: AllocationCategory }>`
  padding: 4px 8px;
  border-radius: var(--border-radius-sm);
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: filter var(--transition-fast);
  background: ${p => CATEGORY_COLORS[p.$category].bg};
  color: ${p => CATEGORY_COLORS[p.$category].text};
  line-height: 1.4;

  &:hover {
    filter: brightness(0.92);
    box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  }
`

const EmptyCell = styled.span`
  font-size: 11px;
  color: var(--color-text-muted);
  text-align: center;
  padding: 8px 0;
`

const AddProjectBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 100%;
  padding: 2px 4px;
  border-radius: var(--border-radius-sm);
  border: 1.5px dashed var(--color-primary);
  font-size: 10px;
  font-weight: 600;
  background: rgba(78, 44, 121, 0.06);
  color: var(--color-primary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
  white-space: nowrap;
  &:hover {
    background: var(--color-primary-light);
    border-style: solid;
  }
`

const NoteTooltip = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  left: 8px;
  z-index: 40;
  background: var(--color-primary-dark, #2d1349);
  color: #f4ebff;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 11px;
  line-height: 1.6;
  max-width: 260px;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: 0 6px 18px rgba(0,0,0,0.28);
  pointer-events: none;
  border: 1px solid rgba(212,163,255,0.2);

  &::before {
    content: '';
    position: absolute;
    bottom: 100%;
    left: 18px;
    border: 5px solid transparent;
    border-bottom-color: var(--color-primary-dark, #2d1349);
  }
`

const AllocBlockWrap = styled.div`
  position: relative;
`

const TooltipBox = styled.div`
  position: absolute;
  bottom: calc(100% + 6px);
  left: 50%;
  transform: translateX(-50%);
  background: #1e293b;
  color: #f1f5f9;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 11px;
  line-height: 1.6;
  white-space: nowrap;
  z-index: 30;
  pointer-events: none;
  box-shadow: 0 4px 14px rgba(0,0,0,0.25);

  &::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    border: 5px solid transparent;
    border-top-color: #1e293b;
  }

  strong {
    font-weight: 700;
    color: #fff;
  }

  .tip-row {
    opacity: 0.85;
  }
`

export default function AllocationGrid({
  rows,
  dayColumns,
  perspective,
  onCellClick,
  onRowClick,
  onAddProjectClick,
  notesByEmpCode,
}: AllocationGridProps) {
  const cols = dayColumns.length
  const [hoveredAlloc, setHoveredAlloc] = useState<string | null>(null)
  const [hoveredName, setHoveredName] = useState<string | null>(null)

  return (
    <Wrapper>
      <ScrollArea>
        <Grid $cols={cols}>
          <HeaderCell $isFirst>
            <HeaderLabel>{perspective === 'resource' ? 'RESOURCE' : 'PROJECT'}</HeaderLabel>
          </HeaderCell>
          {dayColumns.map(col => (
            <HeaderCell key={col.key}>
              <HeaderDay>{col.label}</HeaderDay>
              <HeaderDate>{col.sublabel.split(' ')[0]}</HeaderDate>
              <HeaderMonth>{col.sublabel.split(' ').slice(1).join(' ')}</HeaderMonth>
            </HeaderCell>
          ))}
        </Grid>

        {rows.map(row => (
          <Row key={row.id} $cols={cols}>
            <NameCell
              onClick={() => onRowClick?.(row)}
              onMouseEnter={() => setHoveredName(row.id)}
              onMouseLeave={() => setHoveredName(null)}
              style={{ position: 'relative' }}
            >
              {perspective === 'project' ? (
                <ProjectIndicator $color={row.avatarColor || '#22c55e'} />
              ) : (
                <AvatarCircle $color={row.avatarColor || '#3b82f6'}>
                  {row.avatar || row.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </AvatarCircle>
              )}
              <NameInfo>
                <div className="name">{row.name}</div>
                <div className="sub">{row.subtitle}</div>
                {row.location && <div className="loc">{row.location}</div>}
              </NameInfo>
              {row.utilization !== undefined && perspective === 'resource' && (
                <UtilBadge $value={row.utilization}>{row.utilization}%</UtilBadge>
              )}
              {hoveredName === row.id && notesByEmpCode && notesByEmpCode[row.id] && (
                <NoteTooltip>
                  <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3, display: 'block' }}>Staff Note</span>
                  {notesByEmpCode[row.id]}
                </NoteTooltip>
              )}
            </NameCell>

            {dayColumns.map(col => {
              const allocs = row.days[col.key] || []
              return (
                <DayCell key={col.key}>
                  {allocs.length === 0 ? (
                    <EmptyCell>—</EmptyCell>
                  ) : (
                    allocs.map(alloc => (
                      <AllocBlockWrap key={alloc.id}>
                        <AllocBlock
                          $category={alloc.category}
                          onClick={(e) => {
                            e.stopPropagation()
                            onCellClick?.(row, col.key, alloc)
                          }}
                          onMouseEnter={() => setHoveredAlloc(alloc.id + col.key)}
                          onMouseLeave={() => setHoveredAlloc(null)}
                        >
                          {alloc.category === 'proposed'
                            ? `Proposed: ${alloc.label}${alloc.allocPct != null ? ` ${Math.round(alloc.allocPct)}%` : ''}`
                            : `${alloc.label}${alloc.allocPct != null ? ` ${Math.round(alloc.allocPct)}%` : ''}`
                          }
                          {alloc.note && <span style={{ marginLeft: 4, opacity: 0.85, fontSize: 9 }}>&#128203;</span>}
                        </AllocBlock>
                        {hoveredAlloc === alloc.id + col.key && (
                          <TooltipBox>
                            <strong>{alloc.label}</strong><br/>
                            {alloc.hours != null && <span className="tip-row">{alloc.hours}h · {alloc.allocPct != null ? Math.round(alloc.allocPct) : Math.round((alloc.hours / 40) * 100)}% load</span>}
                            {alloc.hours != null && <br/>}
                            <span className="tip-row">{col.label} {col.sublabel} · {alloc.category}</span>
                            {alloc.note && <><br/><span className="tip-row" style={{ fontStyle: 'italic', marginTop: 2, display: 'inline-block' }}>&#128203; {alloc.note}</span></>}
                          </TooltipBox>
                        )}
                      </AllocBlockWrap>
                    ))
                  )}
                  {onAddProjectClick && perspective === 'resource' && allocs.length > 0 && (
                    <AddProjectBtn
                      onClick={e => { e.stopPropagation(); onAddProjectClick(row, col.key) }}
                      title="Add another project to this week"
                    >
                      + Add Project
                    </AddProjectBtn>
                  )}
                </DayCell>
              )
            })}
          </Row>
        ))}
      </ScrollArea>
    </Wrapper>
  )
}
