'use client'

import styled from 'styled-components'

export interface TimelineAllocation {
  id: string
  label: string
  status: 'confirmed' | 'proposed' | 'bench'
  startWeek: number
  endWeek: number
  hours?: number
}

export interface TimelineRow {
  id: string
  name: string
  subtitle?: string
  totalFte?: number
  allocations: TimelineAllocation[]
}

interface TimelineViewProps {
  rows: TimelineRow[]
  weekLabels: string[]
  onRowClick?: (row: TimelineRow) => void
  onAllocationClick?: (row: TimelineRow, alloc: TimelineAllocation) => void
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
  grid-template-columns: 220px repeat(${p => p.$cols}, minmax(80px, 1fr));
  min-width: ${p => 220 + p.$cols * 80}px;
`

const HeaderCell = styled.div`
  padding: 10px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  text-align: center;

  &:first-child {
    text-align: left;
    position: sticky;
    left: 0;
    z-index: 2;
  }
`

const Row = styled.div<{ $cols: number }>`
  display: grid;
  grid-template-columns: 220px repeat(${p => p.$cols}, minmax(80px, 1fr));
  min-width: ${p => 220 + p.$cols * 80}px;
  border-bottom: 1px solid var(--color-border-light);
  cursor: pointer;
  transition: background var(--transition-fast);

  &:hover {
    background: var(--color-border-light);
  }

  &:last-child {
    border-bottom: none;
  }
`

const NameCell = styled.div`
  padding: 12px;
  position: sticky;
  left: 0;
  z-index: 1;
  background: inherit;
  display: flex;
  flex-direction: column;
  justify-content: center;

  .name {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
  }

  .sub {
    font-size: 11px;
    color: var(--color-text-muted);
  }
`

const WeekCell = styled.div`
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: stretch;
  justify-content: center;
  min-height: 48px;
`

const AllocBar = styled.div<{ $status: string }>`
  padding: 3px 6px;
  border-radius: var(--border-radius-sm);
  font-size: 10px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: filter var(--transition-fast);
  background: ${p =>
    p.$status === 'confirmed' ? '#dcfce7' :
    p.$status === 'proposed' ? '#dbeafe' :
    '#fef3c7'};
  color: ${p =>
    p.$status === 'confirmed' ? '#15803d' :
    p.$status === 'proposed' ? '#1d4ed8' :
    '#b45309'};

  &:hover {
    filter: brightness(0.92);
  }
`

const FteBadge = styled.span<{ $over: boolean }>`
  font-size: 11px;
  font-weight: 600;
  color: ${p => p.$over ? 'var(--color-danger)' : 'var(--color-text-secondary)'};
  margin-left: auto;
`

export default function TimelineView({ rows, weekLabels, onRowClick, onAllocationClick }: TimelineViewProps) {
  const cols = weekLabels.length

  return (
    <Wrapper>
      <ScrollArea>
        <Grid $cols={cols}>
          <HeaderCell>Resource / Project</HeaderCell>
          {weekLabels.map(w => (
            <HeaderCell key={w}>{w}</HeaderCell>
          ))}
        </Grid>

        {rows.map(row => (
          <Row key={row.id} $cols={cols} onClick={() => onRowClick?.(row)}>
            <NameCell>
              <span className="name">
                {row.name}
                {row.totalFte !== undefined && (
                  <FteBadge $over={(row.totalFte ?? 0) > 1}> ({(row.totalFte ?? 0).toFixed(1)})</FteBadge>
                )}
              </span>
              {row.subtitle && <span className="sub">{row.subtitle}</span>}
            </NameCell>
            {weekLabels.map((_, weekIndex) => (
              <WeekCell key={weekIndex}>
                {row.allocations
                  .filter(a => weekIndex >= a.startWeek && weekIndex <= a.endWeek)
                  .map(a => (
                    <AllocBar
                      key={a.id}
                      $status={a.status}
                      onClick={e => {
                        e.stopPropagation()
                        onAllocationClick?.(row, a)
                      }}
                      title={`${a.label} (${a.status})`}
                    >
                      {a.label} {a.hours ? `${a.hours}h` : ''}
                    </AllocBar>
                  ))}
              </WeekCell>
            ))}
          </Row>
        ))}
      </ScrollArea>
    </Wrapper>
  )
}
