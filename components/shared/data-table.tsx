'use client'

import React, { ReactNode, useState } from 'react'
import styled from 'styled-components'
import { ChevronDown, ChevronRight, MoreVertical } from 'lucide-react'

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => ReactNode;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  title?: string;
  totalRow?: Record<string, ReactNode>;
  onRowClick?: (row: T) => void;
  expandable?: boolean;
  getExpandContent?: (row: T) => ReactNode;
  emptyMessage?: string;
  headerActions?: ReactNode;
}

const TableCard = styled.div`
  background: var(--color-bg-card);
  border-radius: var(--border-radius-lg);
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
`

const TableHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);

  h3 {
    font-size: 16px;
    font-weight: 600;
    color: var(--color-text);
  }
`

const TableScroll = styled.div`
  overflow-x: auto;
`

const StyledTable = styled.table`
  width: 100%;
  border-collapse: collapse;
`

const Th = styled.th<{ $align?: string; $width?: string }>`
  padding: 12px 16px;
  text-align: ${p => p.$align || 'left'};
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
  ${p => p.$width ? `width: ${p.$width};` : ''}
`

const Td = styled.td<{ $align?: string }>`
  padding: 12px 16px;
  text-align: ${p => p.$align || 'left'};
  font-size: 13px;
  color: var(--color-text);
  border-bottom: 1px solid var(--color-border-light);
  vertical-align: middle;
`

const Tr = styled.tr<{ $clickable?: boolean }>`
  cursor: ${p => p.$clickable ? 'pointer' : 'default'};
  transition: background var(--transition-fast);

  &:hover {
    background: var(--color-border-light);
  }

  &:last-child td {
    border-bottom: none;
  }
`

const TotalRow = styled.tr`
  background: var(--color-bg);
  font-weight: 600;

  td {
    border-top: 2px solid var(--color-border);
    padding: 12px 16px;
    font-size: 13px;
  }
`

const ExpandButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--border-radius-sm);
  color: var(--color-text-secondary);

  &:hover {
    background: var(--color-border);
  }
`

const ExpandedRow = styled.tr`
  background: var(--color-border-light);

  td {
    padding: 0;
  }
`

const EmptyState = styled.div`
  padding: 48px 24px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 14px;
`

export default function DataTable<T extends object>({
  columns,
  data,
  title,
  totalRow,
  onRowClick,
  expandable,
  getExpandContent,
  emptyMessage = 'No data available',
  headerActions,
}: DataTableProps<T>) {
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  const toggleExpand = (index: number) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  return (
    <TableCard>
      {(title || headerActions) && (
        <TableHeader>
          {title && <h3>{title}</h3>}
          {headerActions}
        </TableHeader>
      )}
      <TableScroll>
        <StyledTable>
          <thead>
            <tr>
              {expandable && <Th $width="40px" />}
              {columns.map(col => (
                <Th key={col.key} $align={col.align} $width={col.width}>
                  {col.header}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (expandable ? 1 : 0)}>
                  <EmptyState>{emptyMessage}</EmptyState>
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <React.Fragment key={i}>
                  <Tr
                    $clickable={!!onRowClick || expandable}
                    onClick={() => {
                      if (expandable) toggleExpand(i)
                      onRowClick?.(row)
                    }}
                  >
                    {expandable && (
                      <Td>
                        <ExpandButton onClick={(e) => { e.stopPropagation(); toggleExpand(i) }}>
                          {expandedRows.has(i) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </ExpandButton>
                      </Td>
                    )}
                    {columns.map(col => (
                      <Td key={col.key} $align={col.align}>
                        {col.render ? col.render(row, i) : String((row as Record<string, unknown>)[col.key] ?? '—')}
                      </Td>
                    ))}
                  </Tr>
                  {expandable && expandedRows.has(i) && getExpandContent && (
                    <ExpandedRow key={`exp-${i}`}>
                      <td colSpan={columns.length + 1}>
                        {getExpandContent(row)}
                      </td>
                    </ExpandedRow>
                  )}
                </React.Fragment>
              ))
            )}
            {totalRow && (
              <TotalRow>
                {expandable && <td />}
                {columns.map(col => (
                  <td key={col.key}>{totalRow[col.key] ?? ''}</td>
                ))}
              </TotalRow>
            )}
          </tbody>
        </StyledTable>
      </TableScroll>
    </TableCard>
  )
}
