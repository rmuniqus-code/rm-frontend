'use client'

import React, { useState, useMemo, useCallback, useEffect } from 'react'
import styled from 'styled-components'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, ReferenceLine, Cell, LabelList,
} from 'recharts'
import { useChargeabilityPerformance, type CpEmployee } from '@/hooks/use-chargeability-performance'
import { useDashboardData } from '@/hooks/use-dashboard-data'
import { PageLoader } from '@/components/shared/page-loader'
import MultiSelect from '@/components/shared/multi-select'
import Modal, { Section, SectionTitle as ModalSectionTitle } from '@/components/shared/modal'
import { Calendar, ChevronDown, ChevronRight, ChevronUp, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { isPDGroup } from '@/lib/designation-filter'

/* ─── Constants ─── */
const TARGET = 75

const DEPT_COLORS: Record<string, string> = {
  'ARC': '#44217A',
  'GRC': '#BD1C7D',
  'SCC': '#D4A017',
  'Tech Consulting': '#10b981',
  'Valuations': '#0071e3',
}
const COLOR_FALLBACK = '#888888'

const LOC_COLORS: Record<string, string> = {
  'India': '#44217A',
  'KSA':   '#BD1C7D',
  'Qatar': '#D4A017',
  'UAE':   '#0071e3',
  'USA':   '#10b981',
  'ME':    '#BD1C7D',
}

const TREND_COLORS = [
  '#44217A', '#BD1C7D', '#D4A017', '#10b981',
  '#0071e3', '#e74c3c', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899',
]

const DEPT_MAILBOXES: Record<string, string> = {
  'ARC': 'resourcingrequestsarc@uniqus.com',
  'GRC': 'resourcingrequestsarc@uniqus.com',
  'SCC': 'resourcingrequestsscc@uniqus.com',
  'Tech Consulting': 'resourcingrequeststechcon@uniqus.com',
  'Valuations': 'resourcingrequestsarc@uniqus.com',
}

const CP_TABS = ['Trends', 'Service Lines', 'Sub-Teams', 'Locations', 'Designations', 'Resources', 'Alerts'] as const
type CPTab = typeof CP_TABS[number]

/* ─── Pure helpers ─── */
function pctColor(pct: number) {
  if (pct < 30) return '#c0392b'
  if (pct < 75) return '#f39c12'
  if (pct < 90) return '#27ae60'
  return '#1a56db'
}
function statusLabel(pct: number) {
  if (pct < 30) return 'Critical'
  if (pct < 75) return 'At Risk'
  if (pct < 90) return 'On Target'
  return 'Exceeding'
}
function statusBgColor(pct: number) {
  if (pct < 30) return '#fde8e8'
  if (pct < 75) return '#fff3e0'
  if (pct < 90) return '#e4f5e9'
  return '#e8f0fe'
}
function fmtHrs(hrs: number): string {
  if (!hrs) return '—'
  if (hrs >= 1000) return `${(hrs / 1000).toFixed(1)}k`
  return hrs.toFixed(0)
}
function periodToSortKey(p: string): number {
  const ORDER: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  }
  const parts = p.split('-')
  if (parts.length < 2) return 0
  if (/^\d{4}$/.test(parts[0])) return parseInt(parts[0]) * 12 + (parseInt(parts[1]) - 1)
  const cap = parts[0].charAt(0).toUpperCase() + parts[0].slice(1, 3).toLowerCase()
  return parseInt(parts[1]) * 12 + (ORDER[cap] ?? 0)
}
function formatPeriodLabel(period: string): string {
  const ORDER: Record<string, number> = {
    Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
    Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
  }
  const parts = period.split('-')
  if (parts.length < 2) return period
  if (/^\d{4}$/.test(parts[0])) {
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1)
      .toLocaleString('default', { month: 'long', year: 'numeric' })
  }
  const cap = parts[0].charAt(0).toUpperCase() + parts[0].slice(1, 3).toLowerCase()
  const idx = ORDER[cap]
  if (idx === undefined) return period
  return new Date(parseInt(parts[1]), idx).toLocaleString('default', { month: 'long', year: 'numeric' })
}

function normalizeEmpStatus(s: string): string {
  if (!s) return s
  const lower = s.toLowerCase()
  if (lower === 'active') return 'Active'
  if (lower.includes('notice')) return 'Serving Notice Period'
  if (lower === 'contract') return 'Contract'
  if (lower === 'inactive' || lower === 'exited') return 'Exited'
  if (lower.includes('maternity')) return 'Maternity Leave'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String((item[key] as any) ?? 'Unknown')
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {} as Record<string, T[]>)
}

function calcGroup(rows: CpEmployee[]) {
  const avail = rows.reduce((s, r) => s + r.availableHours, 0)
  const charged = rows.reduce((s, r) => s + r.chargeableHours, 0)
  const pct = avail > 0 ? +(charged / avail * 100).toFixed(1) : 0
  const below = rows.filter(r => r.chargeabilityPct < TARGET).length
  return { avail, charged, pct, below, count: rows.length }
}

/* ─── Sort types ─── */
type SortDir = 'asc' | 'desc'
type SortState = { col: string; dir: SortDir } | null

function sortRows<T>(data: T[], state: SortState, key: (col: string, row: T) => number | string): T[] {
  if (!state) return data
  return [...data].sort((a, b) => {
    const av = key(state.col, a)
    const bv = key(state.col, b)
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv))
    return state.dir === 'asc' ? cmp : -cmp
  })
}

/* ─── Styled Components ─── */
const PeriodRow = styled.div`
  display: flex; align-items: center; gap: 8px; padding: 9px 14px;
  background: var(--color-bg-card); border: 1px solid var(--color-border);
  border-radius: var(--border-radius); margin-bottom: 14px; flex-wrap: wrap;
`
const PSelect = styled.select`
  padding: 4px 8px; border: 1px solid var(--color-border);
  border-radius: var(--border-radius); background: var(--color-bg-card);
  color: var(--color-text); font-size: 13px; cursor: pointer;
  &:focus { outline: none; border-color: var(--color-primary); }
`
const FilterBar = styled.div`
  background: var(--color-bg-card); border: 1px solid var(--color-border);
  border-radius: var(--border-radius); padding: 10px 14px;
  display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px;
`
const FLabel = styled.span`
  font-size: 10px; font-weight: 700; color: var(--color-primary);
  text-transform: uppercase; letter-spacing: 0.06em; white-space: nowrap;
`
const SearchInput = styled.input`
  border: 1.5px solid var(--color-border); border-radius: 7px;
  padding: 4px 8px 4px 26px; font-size: 12px; color: var(--color-text);
  background: var(--color-bg-card); min-width: 170px;
  &:focus { outline: none; border-color: var(--color-primary); }
`
const SearchWrap = styled.div`
  position: relative; display: flex; align-items: center;
  span { position: absolute; left: 7px; font-size: 12px; color: #888; pointer-events: none; }
`
const ClearBtn = styled.button`
  background: var(--color-primary); color: #fff; border: none; border-radius: 7px;
  padding: 4px 12px; font-size: 12px; font-weight: 700; cursor: pointer;
  &:hover { background: #BD1C7D; }
`
const FilterStats = styled.span`
  margin-left: auto; font-size: 12px; color: #555;
  background: var(--color-bg); padding: 3px 10px; border-radius: 20px;
  font-weight: 600; white-space: nowrap;
`
const TabNav = styled.div`
  display: flex; gap: 2px; border-bottom: 2px solid var(--color-border);
  margin-bottom: 20px; overflow-x: auto;
`
const TabBtn = styled.button<{ $active: boolean }>`
  padding: 10px 16px; border: none; background: transparent;
  font-size: 13px; font-weight: ${p => p.$active ? 600 : 400};
  color: ${p => p.$active ? 'var(--color-primary)' : 'var(--color-text-secondary)'};
  border-bottom: 3px solid ${p => p.$active ? 'var(--color-primary)' : 'transparent'};
  margin-bottom: -2px; cursor: pointer; white-space: nowrap; transition: color 0.2s;
  &:hover { color: #BD1C7D; }
`
const KpiRow = styled.div`
  display: grid; grid-template-columns: repeat(auto-fill, minmax(155px, 1fr));
  gap: 12px; margin-bottom: 20px;
`
const KpiCard = styled.div<{ $accent: string }>`
  background: var(--color-bg-card); border-radius: 12px; padding: 15px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.07); border-left: 4px solid ${p => p.$accent};
  transition: transform 0.15s; &:hover { transform: translateY(-2px); }
`
const KpiLabel = styled.div`
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: #888; margin-bottom: 5px;
`
const KpiVal = styled.div<{ $color: string }>`
  font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: ${p => p.$color};
`
const KpiSub = styled.div`font-size: 11px; color: #999; margin-top: 3px;`
const ChartGrid = styled.div<{ $single?: boolean }>`
  display: grid; grid-template-columns: ${p => p.$single ? '1fr' : '1fr 1fr'};
  gap: 16px; margin-bottom: 20px;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`
const ChartCard = styled.div`
  background: var(--color-bg-card); border-radius: 12px; padding: 18px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.07); border: 1px solid var(--color-border);
  h3 { font-size: 13px; font-weight: 700; color: var(--color-primary); margin-bottom: 3px; }
  p.sub { font-size: 11px; color: #888; margin-bottom: 12px; }
`
const TblCard = styled.div`
  background: var(--color-bg-card); border-radius: 12px; overflow: hidden;
  box-shadow: 0 1px 4px rgba(0,0,0,0.07); border: 1px solid var(--color-border); margin-bottom: 20px;
`
const TblHdr = styled.div`
  padding: 13px 16px 9px; border-bottom: 1px solid var(--color-border);
  display: flex; align-items: center; justify-content: space-between;
  h3 { font-size: 13px; font-weight: 700; color: var(--color-primary); margin: 0; }
`
const TblWrap = styled.div`overflow-x: auto;`
const StyledTable = styled.table`
  width: 100%; border-collapse: collapse; table-layout: auto;
  thead th {
    font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
    color: #666; padding: 8px 12px; background: var(--color-bg);
    border-bottom: 1px solid var(--color-border); text-align: left;
    white-space: nowrap; cursor: pointer; user-select: none;
    &:hover { background: #f0eafa; color: var(--color-primary); }
  }
  thead th.num { text-align: right; }
  tbody tr { transition: background 0.12s; }
  tbody tr:hover { background: #f9f7ff; }
  tbody td {
    font-size: 12px; color: var(--color-text); padding: 8px 12px;
    border-bottom: 1px solid #f0f0f0; vertical-align: middle; white-space: nowrap;
  }
  tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
  tbody tr:last-child td { border-bottom: none; }
`
const IBar = styled.div`display: flex; align-items: center; gap: 7px;`
const IBarBg = styled.div`flex: 1; background: #f0eafa; border-radius: 5px; height: 7px; overflow: hidden; min-width: 55px;`
const IBarFill = styled.div<{ $pct: number; $color: string }>`
  width: ${p => Math.min(p.$pct, 100)}%; height: 100%; border-radius: 5px; background: ${p => p.$color};
`
const IBarVal = styled.span<{ $color: string }>`
  font-size: 12px; font-weight: 700; min-width: 42px; text-align: right; color: ${p => p.$color};
`
const Badge = styled.span<{ $pct: number }>`
  display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 10px;
  font-size: 10px; font-weight: 700;
  background: ${p => statusBgColor(p.$pct)}; color: ${p => pctColor(p.$pct)};
`
const SectionHeader = styled.div`
  font-size: 15px; font-weight: 800; color: var(--color-primary); margin-bottom: 4px;
`
const SectionSub = styled.div`font-size: 12px; color: #888; margin-bottom: 14px;`
const AccordionSection = styled.div`margin-bottom: 10px;`
const AccordionHeader = styled.div<{ $open: boolean }>`
  background: var(--color-bg-card);
  border: 1.5px solid ${p => p.$open ? 'var(--color-primary)' : '#e0d6f5'};
  border-radius: ${p => p.$open ? '10px 10px 0 0' : '10px'};
  padding: 11px 16px; cursor: pointer;
  display: flex; align-items: center; justify-content: space-between;
  &:hover { background: #f9f7ff; }
  h4 { font-size: 13px; font-weight: 700; color: var(--color-primary); margin: 0; }
`
const AccordionMeta = styled.div`display: flex; align-items: center; gap: 10px;`
const AccordionBody = styled.div<{ $open: boolean }>`
  border: 1.5px solid var(--color-primary); border-top: none;
  border-radius: 0 0 10px 10px; overflow: hidden;
  display: ${p => p.$open ? 'block' : 'none'};
`
const DrilldownHdr = styled.div`
  background: var(--color-primary); color: #fff;
  padding: 8px 14px; font-size: 12px; font-weight: 700;
`
const AlertBox = styled.div`
  background: linear-gradient(135deg, #fff5f5, #fff);
  border: 1.5px solid rgba(192,57,43,0.2); border-radius: 12px;
  padding: 16px; margin-bottom: 14px;
  h4 { color: #c0392b; font-size: 14px; font-weight: 700; margin-bottom: 6px; }
`
const EmailPreview = styled.pre`
  background: var(--color-bg-card); border: 1px solid var(--color-border);
  border-radius: 8px; padding: 10px; font-size: 11px; white-space: pre-wrap;
  line-height: 1.6; color: var(--color-text); max-height: 160px; overflow-y: auto;
  margin-top: 8px; font-family: Calibri, sans-serif;
`
const SendBtn = styled.a`
  display: inline-block; background: var(--color-primary); color: #fff;
  border-radius: 7px; padding: 6px 16px; font-size: 12px; font-weight: 700;
  cursor: pointer; margin-top: 10px; text-decoration: none;
  &:hover { background: #BD1C7D; }
`
const ThresholdNote = styled.div`font-size: 10px; color: #c0392b; font-style: italic; margin-top: 4px;`
const NameBtn = styled.button`
  background: none; border: none; color: var(--color-primary); font-weight: 600;
  cursor: pointer; font-size: 12px; padding: 0; text-align: left;
  &:hover { text-decoration: underline; }
`
const EmpDG = styled.div`
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px;
  @media (max-width: 600px) { grid-template-columns: 1fr; }
`
const EmpDI = styled.div`
  display: flex; flex-direction: column; gap: 3px;
  label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #888; }
  span { font-size: 13px; color: var(--color-text); }
`

/* ─── Tiny pure components ─── */
function InlineBar({ pct }: { pct: number }) {
  const c = pctColor(pct)
  return (
    <IBar>
      <IBarBg><IBarFill $pct={pct} $color={c} /></IBarBg>
      <IBarVal $color={c}>{pct.toFixed(1)}%</IBarVal>
    </IBar>
  )
}
function VarCell({ pct }: { pct: number }) {
  const v = pct - TARGET
  return <span style={{ color: v >= 0 ? '#27ae60' : '#c0392b', fontWeight: 700 }}>{v >= 0 ? '+' : ''}{v.toFixed(1)}%</span>
}
function SortIcon({ col, sort }: { col: string; sort: SortState }) {
  if (!sort || sort.col !== col) return <ArrowUpDown size={10} style={{ opacity: 0.35, marginLeft: 3 }} />
  return sort.dir === 'asc'
    ? <ArrowUp size={10} style={{ color: 'var(--color-primary)', marginLeft: 3 }} />
    : <ArrowDown size={10} style={{ color: 'var(--color-primary)', marginLeft: 3 }} />
}
function SortTh({ col, sort, onSort, children, className }: {
  col: string; sort: SortState; onSort: (c: string) => void;
  children: React.ReactNode; className?: string;
}) {
  return (
    <th className={className} onClick={() => onSort(col)}>
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        {children}<SortIcon col={col} sort={sort} />
      </span>
    </th>
  )
}
function EmpField({ label, children }: { label: string; children: React.ReactNode }) {
  return <EmpDI><label>{label}</label><span>{children}</span></EmpDI>
}

/* ─── Employee detail modal ─── */
function EmployeeModal({ emp, weekRange, onClose }: {
  emp: CpEmployee
  weekRange: { start: string; end: string } | null
  onClose: () => void
}) {
  const normStatus = normalizeEmpStatus(emp.employeeStatus ?? '')
  const sc = normStatus === 'Active' ? '#27ae60'
    : normStatus === 'Serving Notice Period' ? '#f59e0b'
    : normStatus === 'Contract' ? '#3b82f6' : '#c0392b'

  const fmtDate = (d: string) =>
    new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

  const allocationStatusColor = (s: string) => {
    if (s === 'confirmed') return '#27ae60'
    if (s === 'proposed') return '#f59e0b'
    return '#888888'
  }

  return (
    <Modal title={emp.name} open onClose={onClose}>
      <Section>
        <ModalSectionTitle>Employee Details</ModalSectionTitle>
        <EmpDG>
          <EmpField label="Employee ID">{emp.empId || '—'}</EmpField>
          <EmpField label="Designation">{emp.designation || '—'}</EmpField>
          <EmpField label="Service Line">{emp.department || '—'}</EmpField>
          <EmpField label="Sub-Function">{emp.subFunction || '—'}</EmpField>
          <EmpField label="Location">{emp.location || '—'}</EmpField>
          <EmpField label="Region">{emp.region || '—'}</EmpField>
          <EmpField label="Email">{emp.email || '—'}</EmpField>
          <EmpField label="Date of Joining">
            {emp.dateOfJoining ? fmtDate(emp.dateOfJoining) : '—'}
          </EmpField>
          <EmpField label="Status">
            <span style={{ fontSize: 11, fontWeight: 700, color: sc, padding: '2px 8px', borderRadius: 999, background: `${sc}18`, border: `1px solid ${sc}44`, display: 'inline-block' }}>
              {normStatus || '—'}
            </span>
          </EmpField>
        </EmpDG>
      </Section>

      <Section>
        <ModalSectionTitle>Chargeability — {formatPeriodLabel(emp.period)}</ModalSectionTitle>
        <EmpDG>
          <EmpField label="Available Hours">{fmtHrs(emp.availableHours)}</EmpField>
          <EmpField label="Chargeable Hours">{fmtHrs(emp.chargeableHours)}</EmpField>
          <EmpField label="Non-Chargeable Hrs">{fmtHrs(emp.nonChargeableHours)}</EmpField>
          <EmpField label="Chargeability %">
            <span style={{ fontSize: 16, fontWeight: 800, color: pctColor(emp.chargeabilityPct) }}>{emp.chargeabilityPct.toFixed(1)}%</span>
          </EmpField>
          <EmpField label="Compliance %">{emp.compliancePct.toFixed(1)}%</EmpField>
          <EmpField label="Status"><Badge $pct={emp.chargeabilityPct}>{statusLabel(emp.chargeabilityPct)}</Badge></EmpField>
        </EmpDG>
      </Section>

      {emp.currentProjects.length > 0 && (
      <Section>
        <ModalSectionTitle>
          Current Projects
          {weekRange && (
            <span style={{ fontWeight: 400, fontSize: 11, color: '#888', marginLeft: 8 }}>
              (week of {fmtDate(weekRange.start)} – {fmtDate(weekRange.end)})
            </span>
          )}
        </ModalSectionTitle>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #eee' }}>
              <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', background: '#fafafa' }}>Project</th>
              <th style={{ textAlign: 'center', padding: '6px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', background: '#fafafa' }}>Allocation</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', background: '#fafafa' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888', background: '#fafafa' }}>Type</th>
            </tr>
          </thead>
          <tbody>
            {emp.currentProjects.map((p, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600, color: 'var(--color-text)' }}>{p.name}</td>
                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block', padding: '2px 10px', borderRadius: 999,
                    background: p.allocPct >= 100 ? '#fde8e8' : p.allocPct >= 50 ? '#e4f5e9' : '#f0eafa',
                    color: p.allocPct >= 100 ? '#c0392b' : p.allocPct >= 50 ? '#27ae60' : '#44217A',
                    fontWeight: 700, fontSize: 12,
                  }}>
                    {p.allocPct}%
                  </span>
                </td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ color: p.status === 'confirmed' ? '#27ae60' : p.status === 'proposed' ? '#f59e0b' : '#888', fontWeight: 600, fontSize: 12, textTransform: 'capitalize' }}>
                    {p.status || '—'}
                  </span>
                </td>
                <td style={{ padding: '8px 10px', color: '#888', fontSize: 12, textTransform: 'capitalize' }}>
                  {p.projectType || '—'}
                </td>
              </tr>
            ))}
            {emp.currentProjects.length > 1 && (
              <tr style={{ background: '#f9f7ff' }}>
                <td style={{ padding: '8px 10px', fontWeight: 600, color: '#888' }}>Total allocation</td>
                <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800, color: emp.currentProjects.reduce((s, p) => s + p.allocPct, 0) > 100 ? '#c0392b' : '#27ae60' }}>
                  {emp.currentProjects.reduce((s, p) => s + p.allocPct, 0)}%
                </td>
                <td colSpan={2} />
              </tr>
            )}
          </tbody>
        </table>
      </Section>
      )}
    </Modal>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Props
═══════════════════════════════════════════════════════════════════ */
interface ExternalFilters {
  search: string
  fDepts: string[]
  fSubFuncs: string[]
  fRegions: string[]
  fLocs: string[]
  fDesigs: string[]
  fStatus: string[]
}

interface ChargeabilityDashboardProps {
  /** Period value controlled from outside (e.g. main dashboard global selector) */
  externalPeriod?: string
  /** Called when user changes period via the built-in period row */
  onPeriodChange?: (p: string | undefined) => void
  /** Hide the period selector row (parent controls it) */
  hidePeriodSelector?: boolean
  /** When provided, the component uses these filter values instead of internal state */
  externalFilters?: ExternalFilters
  /** Hide the internal filter bar (parent renders its own) */
  hideFilterBar?: boolean
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════════════════ */
export default function ChargeabilityDashboard({
  externalPeriod,
  onPeriodChange,
  hidePeriodSelector = false,
  externalFilters,
  hideFilterBar = false,
}: ChargeabilityDashboardProps) {
  /* ── Period state (internal fallback when not controlled from outside) ── */
  const [internalPeriod, setInternalPeriod] = useState<string | undefined>(undefined)
  const selectedPeriod = externalPeriod !== undefined ? externalPeriod : internalPeriod
  const setSelectedPeriod = (p: string | undefined) => {
    setInternalPeriod(p)
    onPeriodChange?.(p)
  }

  /* ── Data hooks ── */
  const { data, loading } = useChargeabilityPerformance(selectedPeriod)
  const { data: dashData } = useDashboardData(selectedPeriod)

  /* ── Filter state ── */
  const [search, setSearch] = useState('')
  const [fDepts, setFDepts] = useState<string[]>([])
  const [fSubFuncs, setFSubFuncs] = useState<string[]>([])
  const [fRegions, setFRegions] = useState<string[]>([])
  const [fLocs, setFLocs] = useState<string[]>([])
  const [fDesigs, setFDesigs] = useState<string[]>([])
  const [fStatus, setFStatus] = useState<string[]>([])

  /* ── Effective filter values (external overrides internal when provided) ── */
  const effSearch   = externalFilters ? externalFilters.search   : search
  const effDepts    = externalFilters ? externalFilters.fDepts   : fDepts
  const effSubFuncs = externalFilters ? externalFilters.fSubFuncs : fSubFuncs
  const effRegions  = externalFilters ? externalFilters.fRegions  : fRegions
  const effLocs     = externalFilters ? externalFilters.fLocs     : fLocs
  const effDesigs   = externalFilters ? externalFilters.fDesigs   : fDesigs
  const effStatus   = externalFilters ? externalFilters.fStatus   : fStatus

  /* ── UI state ── */
  const [cpTab, setCpTab] = useState<CPTab>('Trends')
  const [drillSL, setDrillSL] = useState<string | null>(null)
  const [filterBelow75, setFilterBelow75] = useState<string | null>(null)
  const [drillSub, setDrillSub] = useState<string | null>(null)
  const [drillDesig, setDrillDesig] = useState<string | null>(null)
  const [drillTrend, setDrillTrend] = useState<string | null>(null)
  const [selectedEmp, setSelectedEmp] = useState<CpEmployee | null>(null)
  const [accordionState, setAccordionState] = useState<Map<string, boolean>>(new Map())

  /* ── Sort states ── */
  const [slSort, setSlSort] = useState<SortState>(null)
  const [subSrt, setSubSrt] = useState<SortState>(null)
  const [locSrt, setLocSrt] = useState<SortState>(null)
  const [desigSrt, setDesigSrt] = useState<SortState>(null)
  const [resSrt, setResSrt] = useState<SortState>(null)

  const makeToggle = useCallback((set: React.Dispatch<React.SetStateAction<SortState>>) =>
    (col: string) => set(prev => prev?.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
  , [])

  const toggleSlSort   = useCallback(makeToggle(setSlSort), [makeToggle])
  const toggleSubSort  = useCallback(makeToggle(setSubSrt), [makeToggle])
  const toggleLocSort  = useCallback(makeToggle(setLocSrt), [makeToggle])
  const toggleDesigSort = useCallback(makeToggle(setDesigSrt), [makeToggle])
  const toggleResSort  = useCallback(makeToggle(setResSrt), [makeToggle])

  const allEmployees = data.employees

  /* ── Filter options ── */
  const deptOptions    = useMemo(() => [...new Set(allEmployees.map(e => e.department).filter(Boolean))].sort(), [allEmployees])
  const subFuncOptions = useMemo(() => {
    const base = effDepts.length ? allEmployees.filter(e => effDepts.includes(e.department)) : allEmployees
    return [...new Set(base.map(e => e.subFunction).filter(Boolean))].sort()
  }, [allEmployees, effDepts])
  const regionOptions  = useMemo(() => [...new Set(allEmployees.map(e => e.region).filter(Boolean))].sort(), [allEmployees])
  const locOptions     = useMemo(() => {
    const base = effRegions.length ? allEmployees.filter(e => effRegions.includes(e.region)) : allEmployees
    return [...new Set(base.map(e => e.location).filter(Boolean))].sort()
  }, [allEmployees, effRegions])
  const desigOptions   = useMemo(() => [...new Set(allEmployees.map(e => e.designation).filter(Boolean))].sort(), [allEmployees])

  /* ── Cascade resets ── */
  useEffect(() => { setFSubFuncs(prev => prev.filter(s => subFuncOptions.includes(s))) }, [subFuncOptions])
  useEffect(() => { setFLocs(prev => prev.filter(l => locOptions.includes(l))) }, [locOptions])

  /* ── Filtered employees ── */
  const filtered = useMemo((): CpEmployee[] => {
    const q = effSearch.toLowerCase()
    return allEmployees.filter(e => {
      if (effDepts.length && !effDepts.includes(e.department)) return false
      if (effSubFuncs.length && !effSubFuncs.includes(e.subFunction)) return false
      if (effRegions.length && !effRegions.includes(e.region)) return false
      if (effLocs.length && !effLocs.includes(e.location)) return false
      if (effDesigs.length && !effDesigs.includes(e.designation)) return false
      if (effStatus.length) {
        const p = e.chargeabilityPct
        const ok = effStatus.some(s =>
          (s === 'critical' && p < 30) || (s === 'atrisk' && p >= 30 && p < 75) ||
          (s === 'below75' && p < 75) || (s === 'above75' && p >= 75) || (s === 'exceeding' && p >= 90)
        )
        if (!ok) return false
      }
      if (q && !e.name.toLowerCase().includes(q) && !e.location.toLowerCase().includes(q) && !e.designation.toLowerCase().includes(q)) return false
      return true
    })
  }, [allEmployees, effDepts, effSubFuncs, effRegions, effLocs, effDesigs, effStatus, effSearch])

  /* ── Totals ── */
  const totalAvail   = useMemo(() => filtered.reduce((s, e) => s + e.availableHours, 0), [filtered])
  const totalCharg   = useMemo(() => filtered.reduce((s, e) => s + e.chargeableHours, 0), [filtered])
  const totalPct     = totalAvail > 0 ? +(totalCharg / totalAvail * 100).toFixed(1) : 0
  const below75count = useMemo(() => filtered.filter(e => e.chargeabilityPct < TARGET).length, [filtered])

  /* ── Group data ── */
  const slGrp    = useMemo(() => groupBy(filtered, 'department'), [filtered])
  const subGrp   = useMemo(() => groupBy(filtered, 'subFunction'), [filtered])
  const locGrp   = useMemo(() => groupBy(filtered, 'location'), [filtered])
  const desigGrp = useMemo(() => groupBy(filtered, 'designation'), [filtered])
  const regGrp   = useMemo(() => groupBy(filtered, 'region'), [filtered])

  const slRawStats    = useMemo(() => Object.keys(slGrp).map(d => ({ d, ...calcGroup(slGrp[d]) })), [slGrp])
  const subRawStats   = useMemo(() => Object.keys(subGrp).map(k => ({ k, dept: subGrp[k][0]?.department ?? '', ...calcGroup(subGrp[k]) })), [subGrp])
  const locRawStats   = useMemo(() => Object.keys(locGrp).map(k => ({ k, reg: locGrp[k][0]?.region ?? 'Other', ...calcGroup(locGrp[k]) })), [locGrp])
  const DESIG_COLOR_PD    = '#BD1C7D'  // pink  — PD Group
  const DESIG_COLOR_UPTOAD = '#44217A' // purple — Upto AD
  const desigRawStats = useMemo(() => Object.keys(desigGrp).map((k) => ({ k, color: isPDGroup(k) ? DESIG_COLOR_PD : DESIG_COLOR_UPTOAD, ...calcGroup(desigGrp[k]) })), [desigGrp])
  const resSorted     = useMemo(() => [...filtered].sort((a, b) => a.chargeabilityPct - b.chargeabilityPct), [filtered])

  /* ── Sort key functions ── */
  const slKey    = useCallback((col: string, r: typeof slRawStats[0]) => {
    if (col === 'dept') return r.d; if (col === 'resources') return r.count
    if (col === 'avail') return r.avail; if (col === 'charged') return r.charged
    if (col === 'pct') return r.pct; if (col === 'below') return r.below
    if (col === 'var') return r.pct - TARGET; return r.pct
  }, [])
  const subKey   = useCallback((col: string, r: typeof subRawStats[0]) => {
    if (col === 'sub') return r.k; if (col === 'dept') return r.dept
    if (col === 'resources') return r.count; if (col === 'avail') return r.avail
    if (col === 'charged') return r.charged; if (col === 'pct') return r.pct
    if (col === 'below') return r.below; if (col === 'var') return r.pct - TARGET; return r.pct
  }, [])
  const locKey   = useCallback((col: string, r: typeof locRawStats[0]) => {
    if (col === 'loc') return r.k; if (col === 'region') return r.reg
    if (col === 'resources') return r.count; if (col === 'pct') return r.pct
    if (col === 'below') return r.below; return r.pct
  }, [])
  const desigKey = useCallback((col: string, r: typeof desigRawStats[0]) => {
    if (col === 'desig') return r.k; if (col === 'resources') return r.count
    if (col === 'avail') return r.avail; if (col === 'charged') return r.charged
    if (col === 'pct') return r.pct; if (col === 'below') return r.below
    if (col === 'var') return r.pct - TARGET; return r.pct
  }, [])
  const resKey   = useCallback((col: string, r: CpEmployee) => {
    if (col === 'name') return r.name; if (col === 'desig') return r.designation
    if (col === 'dept') return r.department; if (col === 'sub') return r.subFunction
    if (col === 'loc') return r.location; if (col === 'avail') return r.availableHours
    if (col === 'charged') return r.chargeableHours; if (col === 'pct') return r.chargeabilityPct
    if (col === 'var') return r.chargeabilityPct - TARGET; return r.chargeabilityPct
  }, [])

  const slStats    = useMemo(() => sortRows(slRawStats, slSort, slKey), [slRawStats, slSort, slKey])
  const subStats   = useMemo(() => sortRows(subRawStats, subSrt, subKey), [subRawStats, subSrt, subKey])
  const locStats   = useMemo(() => sortRows(locRawStats, locSrt, locKey), [locRawStats, locSrt, locKey])
  const desigStats = useMemo(() => sortRows(desigRawStats, desigSrt, desigKey), [desigRawStats, desigSrt, desigKey])
  const resData    = useMemo(() => sortRows(resSorted, resSrt, resKey), [resSorted, resSrt, resKey])

  /* ── Chart data ── */
  const slChartData    = useMemo(() => [...slRawStats].sort((a, b) => a.pct - b.pct).map(s => ({ name: s.d, pct: s.pct, below: s.below })), [slRawStats])
  const subChartData   = useMemo(() => [...subRawStats].sort((a, b) => a.pct - b.pct).map(s => ({ name: s.k, pct: s.pct, dept: s.dept })), [subRawStats])
  const locChartData   = useMemo(() => [...locRawStats].sort((a, b) => a.pct - b.pct).map(s => ({ name: s.k, pct: s.pct, below: s.below, reg: s.reg })), [locRawStats])
  const desigChartData = useMemo(() => [...desigRawStats].sort((a, b) => a.pct - b.pct).map((s) => ({ name: s.k, pct: s.pct, below: s.below, color: s.color })), [desigRawStats])

  /* ── Trend data ── */
  const trendData = useMemo(() => {
    const rows = dashData.chargeabilityTrendByDept
    if (!rows.length) return { points: [], keys: [] as string[] }
    const keys = rows.map(r => r.department)
    const allPeriods = [...new Set(rows.flatMap(r => r.trend.map(t => t.period)))]
      .sort((a, b) => periodToSortKey(a) - periodToSortKey(b))
    const points = allPeriods.map(period => {
      const pt: Record<string, any> = { period, label: formatPeriodLabel(period) }
      rows.forEach(r => {
        const t = r.trend.find(x => x.period === period)
        pt[r.department] = t?.value ?? null
      })
      const vals = keys.map(k => pt[k]).filter((v): v is number => v != null)
      pt.overallPct = vals.length > 0 ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : null
      return pt
    })
    return { points, keys }
  }, [dashData.chargeabilityTrendByDept])

  /* ── Filtered trend data — by Service Line (client-side) ── */
  const filteredTrendData = useMemo(() => {
    const { points: basePoints, keys: baseKeys } = trendData
    const currentPeriod = data.period
    const subTeamRows = dashData.chargeabilityTrendBySubTeam

    // Determine which dept lines to show
    let visibleKeys: string[]
    if (effDepts.length > 0) {
      visibleKeys = baseKeys.filter(k => effDepts.includes(k))
    } else if (effSubFuncs.length > 0) {
      const deptsWithSub = new Set(allEmployees.filter(e => effSubFuncs.includes(e.subFunction)).map(e => e.department))
      visibleKeys = baseKeys.filter(k => deptsWithSub.has(k))
    } else {
      visibleKeys = baseKeys
    }

    // When sub-function filters are active, build a per-period lookup from sub-team trend data
    // so historical months reflect the actual sub-function chargeability, not the whole dept
    const subFuncHistorical = effSubFuncs.length > 0
      ? subTeamRows.filter(r => effSubFuncs.includes(r.subTeam))
      : []

    const points = basePoints.map(p => {
      const pt: any = { ...p }
      // Zero out depts not in visibleKeys
      for (const k of baseKeys) { if (!visibleKeys.includes(k)) pt[k] = null }

      if (p.period === currentPeriod) {
        // Current period: recompute from filtered employees
        const byDept: Record<string, { avail: number; charged: number }> = {}
        for (const e of filtered) {
          if (!byDept[e.department]) byDept[e.department] = { avail: 0, charged: 0 }
          byDept[e.department].avail   += e.availableHours
          byDept[e.department].charged += e.chargeableHours
        }
        for (const k of visibleKeys) {
          const g = byDept[k]
          pt[k] = g && g.avail > 0 ? +(g.charged / g.avail * 100).toFixed(1) : null
        }
        const totAvail = filtered.reduce((s, e) => s + e.availableHours, 0)
        const totCharged = filtered.reduce((s, e) => s + e.chargeableHours, 0)
        pt.overallPct = totAvail > 0 ? +(totCharged / totAvail * 100).toFixed(1) : null
        return pt
      }

      if (subFuncHistorical.length > 0) {
        // Historical + sub-function filter: aggregate across selected sub-teams for this period
        // Group by department so the dept line shows the correct sub-function-filtered value
        const byDept: Record<string, number[]> = {}
        for (const row of subFuncHistorical) {
          const dept = row.department
          if (!visibleKeys.includes(dept)) continue
          const t = row.trend.find((x: any) => x.period === p.period)
          if (t?.value != null) {
            if (!byDept[dept]) byDept[dept] = []
            byDept[dept].push(t.value)
          }
        }
        for (const k of visibleKeys) {
          const vals = byDept[k]
          pt[k] = vals && vals.length > 0 ? +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1) : null
        }
        const allVals = visibleKeys.map(k => pt[k]).filter((v): v is number => v != null)
        pt.overallPct = allVals.length > 0 ? +(allVals.reduce((s: number, v: number) => s + v, 0) / allVals.length).toFixed(1) : null
        return pt
      }

      // Historical + dept filter only: use pre-computed dept values
      const vals = visibleKeys.map(k => pt[k]).filter((v): v is number => v != null)
      pt.overallPct = vals.length > 0 ? +(vals.reduce((s: number, v: number) => s + v, 0) / vals.length).toFixed(1) : null
      return pt
    })
    return { points, visibleKeys }
  }, [trendData, data.period, filtered, effDepts, effSubFuncs, allEmployees, dashData.chargeabilityTrendBySubTeam])

  /* ── Filtered trend data — by Sub-Service Line (client-side) ── */
  const filteredTrendSubTeam = useMemo(() => {
    const rows = dashData.chargeabilityTrendBySubTeam
    if (!rows.length) return { points: [] as any[], visibleKeys: [] as string[] }

    const currentPeriod = data.period

    // Which sub-teams are visible given current filters?
    const allSubKeys = rows.map(r => r.subTeam)
    let visibleKeys: string[]
    if (effDepts.length > 0 && effSubFuncs.length === 0) {
      // Filter sub-teams that belong to selected depts
      visibleKeys = rows.filter(r => effDepts.includes(r.department)).map(r => r.subTeam)
    } else if (effSubFuncs.length > 0) {
      visibleKeys = effSubFuncs
    } else {
      visibleKeys = allSubKeys
    }

    const allPeriods = [...new Set(rows.flatMap(r => r.trend.map(t => t.period)))]
      .sort((a, b) => periodToSortKey(a) - periodToSortKey(b))

    const points = allPeriods.map(period => {
      const pt: Record<string, any> = { period, label: formatPeriodLabel(period) }
      if (period === currentPeriod) {
        // Current period: recompute from filtered employees so all filters apply
        const bySub: Record<string, { avail: number; charged: number }> = {}
        for (const e of filtered) {
          const key = e.subFunction || 'Unknown'
          if (!bySub[key]) bySub[key] = { avail: 0, charged: 0 }
          bySub[key].avail   += e.availableHours
          bySub[key].charged += e.chargeableHours
        }
        for (const k of visibleKeys) {
          const g = bySub[k]
          pt[k] = g && g.avail > 0 ? +(g.charged / g.avail * 100).toFixed(1) : null
        }
      } else {
        // Historical: use API data (dept-filter applied above via visibleKeys)
        rows.forEach(r => {
          if (!visibleKeys.includes(r.subTeam)) return
          const t = r.trend.find(x => x.period === period)
          pt[r.subTeam] = t?.value ?? null
        })
      }
      const vals = visibleKeys.map(k => pt[k]).filter((v): v is number => v != null)
      pt.overallPct = vals.length > 0 ? +(vals.reduce((s: number, v: number) => s + v, 0) / vals.length).toFixed(1) : null
      return pt
    })

    return { points, visibleKeys }
  }, [dashData.chargeabilityTrendBySubTeam, data.period, filtered, effDepts, effSubFuncs])

  /* ── Refs for scroll-to-data ── */
  const slDataRef      = React.useRef<HTMLDivElement>(null)
  const subDataRef     = React.useRef<HTMLDivElement>(null)
  const locDataRef     = React.useRef<HTMLDivElement>(null)
  const desigDataRef   = React.useRef<HTMLDivElement>(null)
  const trendTableRef  = React.useRef<HTMLDivElement>(null)

  const scrollToData = (ref: React.RefObject<HTMLDivElement | null>) => {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80)
  }

  /* ── Accordion helpers ── */
  function accordionIsOpen(key: string, defaultOpen: boolean): boolean {
    return accordionState.has(key) ? accordionState.get(key)! : defaultOpen
  }
  function toggleAccordion(key: string, defaultOpen: boolean) {
    setAccordionState(prev => {
      const next = new Map(prev)
      next.set(key, !accordionIsOpen(key, defaultOpen))
      return next
    })
  }

  const clearFilters = () => {
    setSearch(''); setFDepts([]); setFSubFuncs([]); setFRegions([]); setFLocs([]); setFDesigs([]); setFStatus([])
  }
  const hasFilters = !!(effSearch || effDepts.length || effSubFuncs.length || effRegions.length || effLocs.length || effDesigs.length || effStatus.length)

  if (loading && !allEmployees.length) return <PageLoader message="Loading chargeability data…" />

  /* ════════════════════════════════════════════════════
     RENDER FUNCTIONS — no hooks inside
  ════════════════════════════════════════════════════ */

  const renderServiceLines = () => {
    const handleSlBarClick = (barData: any) => {
      if (!barData?.name) return
      setFilterBelow75(null)
      setDrillSL(prev => prev === barData.name ? null : barData.name)
      scrollToData(slDataRef)
    }
    const handleBelow75Click = (barData: any) => {
      if (!barData?.name) return
      setFilterBelow75(prev => prev === barData.name ? null : barData.name)
      scrollToData(slDataRef)
    }

    return (
    <>
      <SectionHeader>Service Line Overview</SectionHeader>
      <SectionSub>Chargeability vs 75% target · Deduped by Employee ID · Click a bar to expand employee detail</SectionSub>
      <KpiRow>
        <KpiCard $accent="#44217A"><KpiLabel>Total Resources</KpiLabel><KpiVal $color="#44217A">{filtered.length}</KpiVal><KpiSub>Unique employees</KpiSub></KpiCard>
        <KpiCard $accent="#BD1C7D"><KpiLabel>Overall Chargeability</KpiLabel><KpiVal $color="#BD1C7D">{totalPct.toFixed(1)}%</KpiVal><KpiSub>Target: 75%</KpiSub></KpiCard>
        <KpiCard $accent="#c0392b"><KpiLabel>Below 75%</KpiLabel><KpiVal $color="#c0392b">{below75count}</KpiVal><KpiSub>{filtered.length > 0 ? ((below75count / filtered.length) * 100).toFixed(1) : 0}% of workforce</KpiSub></KpiCard>
        <KpiCard $accent="#D4A017"><KpiLabel>Avail Hours</KpiLabel><KpiVal $color="#D4A017">{fmtHrs(totalAvail)}</KpiVal><KpiSub>Total available</KpiSub></KpiCard>
        <KpiCard $accent="#10b981"><KpiLabel>Charged Hours</KpiLabel><KpiVal $color="#10b981">{fmtHrs(totalCharg)}</KpiVal><KpiSub>Billed to clients</KpiSub></KpiCard>
      </KpiRow>
      <ChartGrid>
        <ChartCard>
          <h3>Chargeability % by Service Line</h3><p className="sub">vs 75% target · click bar to see employees</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={slChartData} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" angle={0} textAnchor="middle" interval={0} height={36} tick={{ fontSize: 11, fill: '#444' }} />
              <YAxis domain={[0, 110]} unit="%" fontSize={10} width={40} />
              <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
              <ReferenceLine y={75} stroke="#c0392b" strokeDasharray="5 4" label={{ value: '75%', position: 'insideTopRight', fill: '#c0392b', fontSize: 10 }} />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]} name="Chargeability %" style={{ cursor: 'pointer' }} onClick={handleSlBarClick}>
                {slChartData.map((e, i) => (
                  <Cell key={i}
                    fill={DEPT_COLORS[e.name] ?? COLOR_FALLBACK}
                    opacity={drillSL && drillSL !== e.name ? 0.35 : 1}
                    stroke={drillSL === e.name ? '#fff' : 'none'}
                    strokeWidth={drillSL === e.name ? 2 : 0}
                  />
                ))}
                <LabelList dataKey="pct" position="top" formatter={(v: any) => `${Number(v).toFixed(1)}%`} style={{ fontSize: 10, fill: '#444', fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <ThresholdNote>— 75% target</ThresholdNote>
        </ChartCard>
        <ChartCard>
          <h3>Resources Below 75% by Service Line</h3><p className="sub">Headcount at risk · click bar to filter employees below</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={slChartData} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" angle={0} textAnchor="middle" interval={0} height={36} tick={{ fontSize: 11, fill: '#444' }} />
              <YAxis fontSize={10} allowDecimals={false} />
              <Tooltip formatter={(v: any) => `${v} resources`} />
              <Bar dataKey="below" radius={[4, 4, 0, 0]} name="Below 75%" style={{ cursor: 'pointer' }} onClick={handleBelow75Click}>
                {slChartData.map((e, i) => {
                  const b = DEPT_COLORS[e.name] ?? COLOR_FALLBACK
                  return <Cell key={i} fill={`${b}88`} stroke={b} strokeWidth={1} opacity={filterBelow75 && filterBelow75 !== e.name ? 0.3 : 1} />
                })}
                <LabelList dataKey="below" position="top" style={{ fontSize: 10, fill: '#444', fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </ChartGrid>

      <div ref={slDataRef} style={{ scrollMarginTop: 80 }}>
      {filterBelow75 ? (
        /* Filtered flat employee list — Resources Below 75% chart click */
        <TblCard>
          <TblHdr>
            <h3>{filterBelow75} — Resources Below 75%</h3>
            <button onClick={() => setFilterBelow75(null)} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
              ✕ Show all
            </button>
          </TblHdr>
          <TblWrap><StyledTable>
            <thead><tr>
              <th style={{ width: 36 }}>#</th>
              <th>Name</th>
              <th>Sub-Function</th>
              <th>Designation</th>
              <th>Location</th>
              <th>Avail Hrs</th>
              <th>Charged Hrs</th>
              <th>Actual %</th>
              <th>Status</th>
            </tr></thead>
            <tbody>
              {[...(slGrp[filterBelow75] ?? [])]
                .filter(r => r.chargeabilityPct < 75)
                .sort((a, b) => a.chargeabilityPct - b.chargeabilityPct)
                .map((r, idx) => (
                  <tr key={`${r.empId}-${idx}`}>
                    <td style={{ color: '#888', fontSize: 11 }}>{idx + 1}</td>
                    <td><NameBtn onClick={() => setSelectedEmp(r)}>{r.name}</NameBtn></td>
                    <td style={{ color: '#666', fontSize: 11 }}>{r.subFunction}</td>
                    <td style={{ color: '#666', fontSize: 11 }}>{r.designation}</td>
                    <td style={{ color: '#666', fontSize: 11 }}>{r.location}</td>
                    <td className="num" style={{ fontSize: 11 }}>{fmtHrs(r.availableHours)}</td>
                    <td className="num" style={{ fontSize: 11 }}>{fmtHrs(r.chargeableHours)}</td>
                    <td><InlineBar pct={r.chargeabilityPct} /></td>
                    <td><Badge $pct={r.chargeabilityPct}>{statusLabel(r.chargeabilityPct)}</Badge></td>
                  </tr>
                ))}
            </tbody>
          </StyledTable></TblWrap>
        </TblCard>
      ) : (
        /* Full accordion table — Chargeability % chart click or default */
        <TblCard>
          <TblHdr>
            <h3>Service Line Detail</h3>
            {drillSL && (
              <button onClick={() => setDrillSL(null)} style={{ background: 'none', border: '1px solid var(--color-border)', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                ✕ Close {drillSL}
              </button>
            )}
          </TblHdr>
          <TblWrap><StyledTable>
            <thead><tr>
              <th style={{ width: 36 }}>#</th>
              <th style={{ width: 24 }} />
              <SortTh col="dept" sort={slSort} onSort={toggleSlSort}>Service Line</SortTh>
              <SortTh col="resources" sort={slSort} onSort={toggleSlSort} className="num">Resources</SortTh>
              <SortTh col="avail" sort={slSort} onSort={toggleSlSort} className="num">Avail Hrs</SortTh>
              <SortTh col="charged" sort={slSort} onSort={toggleSlSort} className="num">Charged Hrs</SortTh>
              <SortTh col="pct" sort={slSort} onSort={toggleSlSort}>Actual %</SortTh>
              <SortTh col="below" sort={slSort} onSort={toggleSlSort} className="num">Below 75%</SortTh>
              <th>Status</th>
            </tr></thead>
            <tbody>
              {slStats.map((s, si) => {
                const isOpen = drillSL === s.d
                const empRows = [...(slGrp[s.d] ?? [])].sort((a, b) => a.chargeabilityPct - b.chargeabilityPct)
                const accent = DEPT_COLORS[s.d] ?? COLOR_FALLBACK
                return (
                  <React.Fragment key={s.d}>
                    <tr
                      style={{ cursor: 'pointer', background: isOpen ? `${accent}0d` : undefined }}
                      onClick={() => setDrillSL(isOpen ? null : s.d)}
                    >
                      <td style={{ color: '#888', fontSize: 11 }}>{si + 1}</td>
                      <td style={{ textAlign: 'center', color: accent }}>
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: accent, display: 'inline-block', flexShrink: 0 }} />
                          <strong>{s.d}</strong>
                        </span>
                      </td>
                      <td className="num">{s.count}</td>
                      <td className="num">{fmtHrs(s.avail)}</td>
                      <td className="num">{fmtHrs(s.charged)}</td>
                      <td><InlineBar pct={s.pct} /></td>
                      <td className="num"><strong style={{ color: s.below > 0 ? '#c0392b' : '#27ae60' }}>{s.below}</strong>/{s.count}</td>
                      <td><Badge $pct={s.pct}>{statusLabel(s.pct)}</Badge></td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={9} style={{ padding: 0 }}>
                          <DrilldownHdr style={{ background: accent }}>{s.d} — {empRows.length} resources</DrilldownHdr>
                          <TblWrap>
                            <StyledTable>
                              <thead><tr>
                                <th style={{ width: 36 }}>#</th>
                                <th>Name</th>
                                <th>Sub-Function</th>
                                <th>Designation</th>
                                <th>Location</th>
                                <th>Avail Hrs</th>
                                <th>Charged Hrs</th>
                                <th>Actual %</th>
                                <th>Status</th>
                              </tr></thead>
                              <tbody>
                                {empRows.map((r, ri) => (
                                  <tr key={`${r.empId}-${ri}`}>
                                    <td style={{ color: '#888', fontSize: 11 }}>{ri + 1}</td>
                                    <td><NameBtn onClick={() => setSelectedEmp(r)}>{r.name}</NameBtn></td>
                                    <td style={{ color: '#666', fontSize: 11 }}>{r.subFunction}</td>
                                    <td style={{ color: '#666', fontSize: 11 }}>{r.designation}</td>
                                    <td style={{ color: '#666', fontSize: 11 }}>{r.location}</td>
                                    <td className="num" style={{ fontSize: 11 }}>{fmtHrs(r.availableHours)}</td>
                                    <td className="num" style={{ fontSize: 11 }}>{fmtHrs(r.chargeableHours)}</td>
                                    <td><InlineBar pct={r.chargeabilityPct} /></td>
                                    <td><Badge $pct={r.chargeabilityPct}>{statusLabel(r.chargeabilityPct)}</Badge></td>
                                  </tr>
                                ))}
                              </tbody>
                            </StyledTable>
                          </TblWrap>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </StyledTable></TblWrap>
        </TblCard>
      )}
      </div>
    </>
    )
  }

  const renderSubTeams = () => (
    <>
      <SectionHeader>Sub-Team Chargeability</SectionHeader>
      <SectionSub>Click row to expand · Click column to sort</SectionSub>
      <ChartCard style={{ marginBottom: 16 }}>
        <h3>Sub-Team Chargeability % (Low to High)</h3><p className="sub">75% threshold shown</p>
        <ResponsiveContainer width="100%" height={Math.max(280, subChartData.length * 26)}>
          <BarChart data={subChartData} layout="vertical" margin={{ top: 5, right: 50, left: 5, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis type="number" domain={[0, 115]} unit="%" fontSize={10} />
            <YAxis type="category" dataKey="name" fontSize={10} width={175} />
            <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
            <ReferenceLine x={75} stroke="#c0392b" strokeDasharray="5 4" label={{ value: '75%', position: 'insideTopRight', fill: '#c0392b', fontSize: 10 }} />
            <Bar dataKey="pct" radius={[0, 4, 4, 0]} name="Chargeability %" style={{ cursor: 'pointer' }}
              onClick={(barData: any) => {
                if (barData?.name) setDrillSub(barData.name)
                scrollToData(subDataRef)
              }}>
              {subChartData.map((e, i) => <Cell key={i} fill={DEPT_COLORS[e.dept] ?? COLOR_FALLBACK} fillOpacity={0.9} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <ThresholdNote>— 75% target</ThresholdNote>
      </ChartCard>
      <div ref={subDataRef} style={{ scrollMarginTop: 80 }} />
      <TblCard>
        <TblHdr><h3>Sub-Team Detail</h3></TblHdr>
        <TblWrap><StyledTable>
          <thead><tr>
            <th style={{ width: 36 }}>#</th>
            <SortTh col="sub" sort={subSrt} onSort={toggleSubSort}>Sub-Team</SortTh>
            <SortTh col="dept" sort={subSrt} onSort={toggleSubSort}>Department</SortTh>
            <SortTh col="resources" sort={subSrt} onSort={toggleSubSort} className="num">Resources</SortTh>
            <SortTh col="avail" sort={subSrt} onSort={toggleSubSort} className="num">Avail Hrs</SortTh>
            <SortTh col="charged" sort={subSrt} onSort={toggleSubSort} className="num">Charged Hrs</SortTh>
            <SortTh col="pct" sort={subSrt} onSort={toggleSubSort}>Actual %</SortTh>
            <SortTh col="below" sort={subSrt} onSort={toggleSubSort} className="num">Below 75%</SortTh>
          </tr></thead>
          <tbody>
            {subStats.map((s, si) => (
              <React.Fragment key={s.k}>
                <tr style={{ cursor: 'pointer' }} onClick={() => setDrillSub(drillSub === s.k ? null : s.k)}>
                  <td style={{ color: '#888', fontSize: 11 }}>{si + 1}</td>
                  <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {drillSub === s.k ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <strong>{s.k}</strong>
                  </span></td>
                  <td>{s.dept}</td>
                  <td className="num">{s.count}</td>
                  <td className="num">{fmtHrs(s.avail)}</td>
                  <td className="num">{fmtHrs(s.charged)}</td>
                  <td><InlineBar pct={s.pct} /></td>
                  <td className="num"><strong style={{ color: s.below > 0 ? '#c0392b' : '#27ae60' }}>{s.below}</strong>/{s.count}</td>
                </tr>
                {drillSub === s.k && (
                  <tr><td colSpan={8} style={{ padding: 0, background: '#f9f7ff' }}>
                    <DrilldownHdr>{s.k} — {s.count} resources</DrilldownHdr>
                    <TblWrap><StyledTable>
                      <thead><tr><th style={{ width: 36 }}>#</th><th>Name</th><th>Designation</th><th>Location</th><th>Actual %</th><th>Status</th></tr></thead>
                      <tbody>
                        {[...subGrp[s.k]].sort((a, b) => a.chargeabilityPct - b.chargeabilityPct).map((r, ri) => (
                          <tr key={`${r.empId}-${ri}`}>
                            <td style={{ color: '#888', fontSize: 11 }}>{ri + 1}</td>
                            <td><NameBtn onClick={() => setSelectedEmp(r)}>{r.name}</NameBtn></td>
                            <td>{r.designation}</td><td>{r.location}</td>
                            <td><InlineBar pct={r.chargeabilityPct} /></td>
                            <td><Badge $pct={r.chargeabilityPct}>{statusLabel(r.chargeabilityPct)}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </StyledTable></TblWrap>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </StyledTable></TblWrap>
      </TblCard>
    </>
  )

  const renderLocations = () => (
    <>
      <SectionHeader>Location Overview</SectionHeader>
      <SectionSub>Chargeability by office · Accordion shows resources below 75%</SectionSub>
      <KpiRow>
        <KpiCard $accent="#44217A"><KpiLabel>Locations</KpiLabel><KpiVal $color="#44217A">{locRawStats.length}</KpiVal><KpiSub>Active in selection</KpiSub></KpiCard>
        <KpiCard $accent="#c0392b"><KpiLabel>Below 75%</KpiLabel><KpiVal $color="#c0392b">{below75count}</KpiVal><KpiSub>Across all locations</KpiSub></KpiCard>
        {Object.keys(regGrp).sort().map(reg => {
          const g = calcGroup(regGrp[reg]); const c = LOC_COLORS[reg] ?? COLOR_FALLBACK
          return (
            <KpiCard key={reg} $accent={c}>
              <KpiLabel>{reg}</KpiLabel><KpiVal $color={c}>{g.pct.toFixed(1)}%</KpiVal>
              <KpiSub>{g.count} resources · {g.below} below 75%</KpiSub>
            </KpiCard>
          )
        })}
      </KpiRow>
      <ChartGrid>
        <ChartCard>
          <h3>Chargeability % by Location</h3><p className="sub">vs 75% target</p>
          <p style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>Click a bar to jump to detail below</p>
          <ResponsiveContainer width="100%" height={Math.max(220, locChartData.length * 32)}>
            <BarChart data={locChartData} layout="vertical" margin={{ top: 8, right: 60, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis type="number" domain={[0, 120]} unit="%" fontSize={9} />
              <YAxis type="category" dataKey="name" fontSize={11} width={110} tick={{ fill: '#444' }} />
              <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
              <ReferenceLine x={75} stroke="#c0392b" strokeDasharray="5 4" label={{ value: '75%', position: 'insideTopRight', fill: '#c0392b', fontSize: 9 }} />
              <Bar dataKey="pct" radius={[0, 3, 3, 0]} name="Chargeability %" style={{ cursor: 'pointer' }}
                onClick={(barData: any) => {
                  if (barData?.name) setAccordionState(prev => { const n = new Map(prev); n.set(barData.name, true); return n })
                  scrollToData(locDataRef)
                }}>
                {locChartData.map((e, i) => <Cell key={i} fill={LOC_COLORS[e.reg] ?? COLOR_FALLBACK} fillOpacity={0.85} />)}
                <LabelList dataKey="pct" position="right" formatter={(v: any) => `${Number(v).toFixed(1)}%`} style={{ fontSize: 10, fill: '#444', fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <ThresholdNote>— 75% target</ThresholdNote>
        </ChartCard>
        <ChartCard>
          <h3>Resources Below 75% by Location</h3><p className="sub">Headcount at risk per office</p>
          <ResponsiveContainer width="100%" height={Math.max(220, locChartData.length * 32)}>
            <BarChart data={locChartData} layout="vertical" margin={{ top: 8, right: 50, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis type="number" fontSize={9} allowDecimals={false} />
              <YAxis type="category" dataKey="name" fontSize={11} width={110} tick={{ fill: '#444' }} />
              <Tooltip formatter={(v: any) => `${v} resources`} />
              <Bar dataKey="below" radius={[0, 3, 3, 0]} name="Below 75%" style={{ cursor: 'pointer' }}
                onClick={(barData: any) => {
                  if (barData?.name) setAccordionState(prev => { const n = new Map(prev); n.set(barData.name, true); return n })
                  scrollToData(locDataRef)
                }}>
                {locChartData.map((e, i) => { const b = LOC_COLORS[e.reg] ?? COLOR_FALLBACK; return <Cell key={i} fill={`${b}99`} stroke={b} strokeWidth={1} /> })}
                <LabelList dataKey="below" position="right" style={{ fontSize: 10, fill: '#444', fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </ChartGrid>
      <div ref={locDataRef} style={{ scrollMarginTop: 80 }} />
      {locStats.map(s => {
        const below = [...locGrp[s.k]].filter(r => r.chargeabilityPct < TARGET).sort((a, b) => a.chargeabilityPct - b.chargeabilityPct)
        const defaultOpen = false
        const isOpen = accordionIsOpen(s.k, defaultOpen)
        const bc = s.pct < 30 ? '#c0392b' : s.pct < 75 ? '#f39c12' : '#27ae60'
        return (
          <AccordionSection key={s.k}>
            <AccordionHeader $open={isOpen} onClick={() => toggleAccordion(s.k, defaultOpen)}>
              <h4>{s.k}&nbsp;<span style={{ color: bc }}>{s.pct.toFixed(1)}%</span></h4>
              <AccordionMeta>
                <Badge $pct={s.pct}>{below.length} below 75%</Badge>
                <span style={{ color: '#888', fontSize: 12 }}>{s.count} total · {s.reg}</span>
                {isOpen ? <ChevronUp size={16} color="#888" /> : <ChevronDown size={16} color="#888" />}
              </AccordionMeta>
            </AccordionHeader>
            <AccordionBody $open={isOpen}>
              {below.length === 0 ? (
                <div style={{ padding: 14, color: '#888', fontSize: 13 }}>✅ All resources above 75% threshold</div>
              ) : (
                <TblWrap>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <colgroup>
                      <col style={{ width: '4%' }} /><col style={{ width: '17%' }} /><col style={{ width: '13%' }} /><col style={{ width: '10%' }} />
                      <col style={{ width: '17%' }} /><col style={{ width: '17%' }} /><col style={{ width: '8%' }} />
                      <col style={{ width: '6%' }} />
                    </colgroup>
                    <thead>
                      <tr style={{ background: 'var(--color-bg)' }}>
                        {['#','NAME','DESIGNATION','DEPT','SUB-FUNCTION','ACTUAL %','STATUS'].map((h) => (
                          <th key={h} style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
                            color: '#666', padding: '8px 12px', borderBottom: '1px solid var(--color-border)',
                            textAlign: h === 'ACTUAL %' ? 'right' : 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {below.map((r, ri) => (
                        <tr key={`${r.empId}-${ri}`} style={{ borderBottom: '1px solid #f0f0f0' }}>
                          <td style={{ padding: '8px 12px', color: '#888', fontSize: 11 }}>{ri + 1}</td>
                          <td style={{ padding: '8px 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <NameBtn onClick={() => setSelectedEmp(r)}>{r.name}</NameBtn>
                          </td>
                          <td style={{ padding: '8px 12px', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.designation}</td>
                          <td style={{ padding: '8px 12px', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.department}</td>
                          <td style={{ padding: '8px 12px', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subFunction}</td>
                          <td style={{ padding: '8px 12px' }}><InlineBar pct={r.chargeabilityPct} /></td>
                          <td style={{ padding: '8px 12px' }}><Badge $pct={r.chargeabilityPct}>{statusLabel(r.chargeabilityPct)}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TblWrap>
              )}
            </AccordionBody>
          </AccordionSection>
        )
      })}
    </>
  )

  const renderDesignations = () => {
    const trackedDesigChartData = desigChartData.filter(d => {
      const raw = desigRawStats.find(r => r.k === d.name)
      return raw && raw.avail > 0
    })
    const trackedDesigStats = desigStats.filter(s => s.avail > 0)

    // Grade Summary aggregates
    const pdStats    = desigRawStats.filter(s => isPDGroup(s.k) && s.avail > 0)
    const uptoAdStats = desigRawStats.filter(s => !isPDGroup(s.k) && s.avail > 0)
    const agg = (rows: typeof desigRawStats) => {
      const totAvail = rows.reduce((s, r) => s + r.avail, 0)
      const totCharged = rows.reduce((s, r) => s + r.charged, 0)
      const pct = totAvail > 0 ? (totCharged / totAvail * 100) : 0
      const below = rows.reduce((s, r) => s + r.below, 0)
      return { pct, below }
    }
    const pdAgg    = agg(pdStats)
    const uptoAdAgg = agg(uptoAdStats)
    return (
    <>
      <SectionHeader>Designation Breakdown</SectionHeader>
      <SectionSub>Chargeability by grade · Click row to expand employees</SectionSub>
      <ChartGrid>
        <ChartCard>
          <h3>Chargeability % by Designation</h3><p className="sub">vs 75% target</p>
          <ResponsiveContainer width="100%" height={310}>
            <BarChart data={trackedDesigChartData} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" fontSize={9} angle={-55} textAnchor="end" interval={0} height={120} tick={{ fontSize: 9 }} />
              <YAxis domain={[0, 115]} unit="%" fontSize={10} />
              <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
              <ReferenceLine y={75} stroke="#c0392b" strokeDasharray="5 4" />
              <Bar dataKey="pct" radius={[4, 4, 0, 0]} name="Chargeability %" style={{ cursor: 'pointer' }}
                onClick={(barData: any) => {
                  if (barData?.name) setDrillDesig(barData.name)
                  scrollToData(desigDataRef)
                }}>
                {trackedDesigChartData.map((e, i) => <Cell key={i} fill={e.color} fillOpacity={0.78} />)}
                <LabelList dataKey="pct" position="top" formatter={(v: any) => `${Number(v).toFixed(1)}%`} style={{ fontSize: 9, fill: '#444', fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <ThresholdNote>— 75% target</ThresholdNote>
        </ChartCard>
        <ChartCard>
          <h3>Resources Below 75% by Designation</h3><p className="sub">Headcount at risk per grade</p>
          <ResponsiveContainer width="100%" height={310}>
            <BarChart data={trackedDesigChartData} margin={{ top: 16, right: 24, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="name" fontSize={9} angle={-55} textAnchor="end" interval={0} height={120} tick={{ fontSize: 9 }} />
              <YAxis fontSize={10} allowDecimals={false} />
              <Tooltip formatter={(v: any) => `${v} resources`} />
              <Bar dataKey="below" radius={[4, 4, 0, 0]} name="Below 75%" style={{ cursor: 'pointer' }}
                onClick={(barData: any) => {
                  if (barData?.name) setDrillDesig(barData.name)
                  scrollToData(desigDataRef)
                }}>
                {trackedDesigChartData.map((e, i) => <Cell key={i} fill={`${e.color}88`} stroke={e.color} strokeWidth={1} />)}
                <LabelList dataKey="below" position="top" style={{ fontSize: 9, fill: '#444', fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </ChartGrid>
      <div ref={desigDataRef} style={{ scrollMarginTop: 80 }} />
      <TblCard>
        <TblHdr><h3>Designation Detail</h3></TblHdr>
        <TblWrap><StyledTable>
          <thead><tr>
            <th style={{ width: 36 }}>#</th>
            <SortTh col="desig" sort={desigSrt} onSort={toggleDesigSort}>Designation</SortTh>
            <SortTh col="resources" sort={desigSrt} onSort={toggleDesigSort} className="num">Resources</SortTh>
            <SortTh col="avail" sort={desigSrt} onSort={toggleDesigSort} className="num">Avail Hrs</SortTh>
            <SortTh col="charged" sort={desigSrt} onSort={toggleDesigSort} className="num">Charged Hrs</SortTh>
            <SortTh col="pct" sort={desigSrt} onSort={toggleDesigSort}>Actual %</SortTh>
            <SortTh col="below" sort={desigSrt} onSort={toggleDesigSort} className="num">Below 75%</SortTh>
            <th>Status</th>
          </tr></thead>
          <tbody>
            {trackedDesigStats.map((s, si) => (
              <React.Fragment key={s.k}>
                <tr style={{ cursor: 'pointer' }} onClick={() => setDrillDesig(drillDesig === s.k ? null : s.k)}>
                  <td style={{ color: '#888', fontSize: 11 }}>{si + 1}</td>
                  <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {drillDesig === s.k ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    <strong>{s.k}</strong>
                  </span></td>
                  <td className="num">{s.count}</td>
                  <td className="num">{fmtHrs(s.avail)}</td>
                  <td className="num">{fmtHrs(s.charged)}</td>
                  <td><InlineBar pct={s.pct} /></td>
                  <td className="num"><strong style={{ color: s.below > 0 ? '#c0392b' : '#27ae60' }}>{s.below}</strong>/{s.count}</td>
                  <td><Badge $pct={s.pct}>{statusLabel(s.pct)}</Badge></td>
                </tr>
                {drillDesig === s.k && (
                  <tr><td colSpan={8} style={{ padding: 0, background: '#f9f7ff' }}>
                    <DrilldownHdr>{s.k} — {s.count} resources</DrilldownHdr>
                    <TblWrap><StyledTable>
                      <thead><tr><th style={{ width: 36 }}>#</th><th>Name</th><th>Sub-Function</th><th>Location</th><th>Actual %</th><th>Status</th></tr></thead>
                      <tbody>
                        {[...desigGrp[s.k]].sort((a, b) => a.chargeabilityPct - b.chargeabilityPct).map((r, ri) => (
                          <tr key={`${r.empId}-${ri}`}>
                            <td style={{ color: '#888', fontSize: 11 }}>{ri + 1}</td>
                            <td><NameBtn onClick={() => setSelectedEmp(r)}>{r.name}</NameBtn></td>
                            <td>{r.subFunction}</td><td>{r.location}</td>
                            <td><InlineBar pct={r.chargeabilityPct} /></td>
                            <td><Badge $pct={r.chargeabilityPct}>{statusLabel(r.chargeabilityPct)}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </StyledTable></TblWrap>
                  </td></tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </StyledTable></TblWrap>
      </TblCard>

      {/* Grade Summary footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 16, marginTop: 12, padding: '10px 16px', background: '#F9F5FF', borderRadius: 8, border: '1px solid #E9D7FE', fontSize: 13 }}>
        <span style={{ color: '#475467', fontWeight: 500 }}>Grade Summary</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: DESIG_COLOR_UPTOAD, display: 'inline-block' }} />
          <strong style={{ color: DESIG_COLOR_UPTOAD }}>Upto AD:</strong>
          <span style={{ color: '#344054' }}>{uptoAdAgg.pct.toFixed(1)}% · {uptoAdAgg.below} below 75%</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: DESIG_COLOR_PD, display: 'inline-block' }} />
          <strong style={{ color: DESIG_COLOR_PD }}>PD Group:</strong>
          <span style={{ color: '#344054' }}>{pdAgg.pct.toFixed(1)}% · {pdAgg.below} below 75%</span>
        </span>
      </div>
    </>
    )
  }

  const renderResources = () => (
    <>
      <SectionHeader>Individual Resource View</SectionHeader>
      <SectionSub>All resources · Click column header to sort · Click name for details</SectionSub>
      <KpiRow>
        <KpiCard $accent="#44217A"><KpiLabel>Total</KpiLabel><KpiVal $color="#44217A">{resSorted.length}</KpiVal><KpiSub>Unique employees</KpiSub></KpiCard>
        <KpiCard $accent="#BD1C7D"><KpiLabel>Overall %</KpiLabel><KpiVal $color="#BD1C7D">{totalPct.toFixed(1)}%</KpiVal><KpiSub>Chargeability</KpiSub></KpiCard>
        <KpiCard $accent="#c0392b"><KpiLabel>Below 75%</KpiLabel><KpiVal $color="#c0392b">{below75count}</KpiVal><KpiSub>{resSorted.length > 0 ? ((below75count / resSorted.length) * 100).toFixed(0) : 0}%</KpiSub></KpiCard>
        <KpiCard $accent="#D4A017"><KpiLabel>Avail Hours</KpiLabel><KpiVal $color="#D4A017">{fmtHrs(totalAvail)}</KpiVal><KpiSub>Total</KpiSub></KpiCard>
        <KpiCard $accent="#10b981"><KpiLabel>Charged Hours</KpiLabel><KpiVal $color="#10b981">{fmtHrs(totalCharg)}</KpiVal><KpiSub>Total</KpiSub></KpiCard>
      </KpiRow>
      <TblCard>
        <TblHdr><h3>{resSorted.length} Resources</h3></TblHdr>
        <TblWrap><StyledTable>
          <thead><tr>
            <th style={{ width: 36 }}>#</th>
            <SortTh col="name" sort={resSrt} onSort={toggleResSort}>Name</SortTh>
            <SortTh col="desig" sort={resSrt} onSort={toggleResSort}>Designation</SortTh>
            <SortTh col="dept" sort={resSrt} onSort={toggleResSort}>Service Line</SortTh>
            <SortTh col="sub" sort={resSrt} onSort={toggleResSort}>Sub-Function</SortTh>
            <SortTh col="loc" sort={resSrt} onSort={toggleResSort}>Location</SortTh>
            <SortTh col="avail" sort={resSrt} onSort={toggleResSort} className="num">Avail Hrs</SortTh>
            <SortTh col="charged" sort={resSrt} onSort={toggleResSort} className="num">Charged Hrs</SortTh>
            <SortTh col="pct" sort={resSrt} onSort={toggleResSort}>Actual %</SortTh>
            <th>Status</th>
          </tr></thead>
          <tbody>
            {resData.map((r, i) => (
              <tr key={`${r.empId}-${i}`}>
                <td style={{ color: '#888', fontSize: 11 }}>{i + 1}</td>
                <td><NameBtn onClick={() => setSelectedEmp(r)}>{r.name}</NameBtn></td>
                <td>{r.designation}</td><td>{r.department}</td><td>{r.subFunction}</td><td>{r.location}</td>
                <td className="num">{fmtHrs(r.availableHours)}</td>
                <td className="num">{fmtHrs(r.chargeableHours)}</td>
                <td><InlineBar pct={r.chargeabilityPct} /></td>
                <td><Badge $pct={r.chargeabilityPct}>{statusLabel(r.chargeabilityPct)}</Badge></td>
              </tr>
            ))}
          </tbody>
        </StyledTable></TblWrap>
      </TblCard>
    </>
  )

  const renderTrends = () => {
    const { points: filteredPoints, visibleKeys } = filteredTrendData
    const validPoints = filteredPoints.filter((p: any) => p.overallPct != null)
    const activeFilterLabels = [...effDepts, ...effSubFuncs, ...effRegions, ...effLocs, ...effDesigs]
    const hasDeepFilters = effSubFuncs.length > 0 || effRegions.length > 0 || effLocs.length > 0 || effDesigs.length > 0

    const handleTrendDotClick = (chartData: any) => {
      const idx = chartData?.activeTooltipIndex
      if (idx == null || idx < 0) return
      const period = filteredPoints[idx]?.period
      if (!period) return
      setDrillTrend(prev => prev === period ? null : period)
      scrollToData(trendTableRef)
    }

    if (!visibleKeys.length) {
      return <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 13 }}>No trend data available. Import multiple periods to see historical trends.</div>
    }
    return (
      <>
        <SectionHeader>Historical Trends</SectionHeader>
        <SectionSub>
          12-month chargeability trend · monthly overall % and by service line
          {activeFilterLabels.length > 0 ? ` — filtered: ${activeFilterLabels.join(', ')}` : ''}
          {hasDeepFilters && <span style={{ marginLeft: 8, fontSize: 10, color: '#f59e0b', fontStyle: 'italic' }}>Historical months reflect sub-function level where available</span>}
        </SectionSub>
        <ChartGrid>
          <ChartCard>
            <h3>Overall Chargeability %</h3><p className="sub">Click a dot to expand that month below</p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={filteredPoints} margin={{ top: 10, right: 30, left: 40, bottom: 8 }} onClick={handleTrendDotClick} style={{ cursor: 'pointer' }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" fontSize={10} angle={-35} textAnchor="end" interval={0} height={70} tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 115]} unit="%" fontSize={10} width={40} />
                <Tooltip formatter={(v: any) => v != null ? `${Number(v).toFixed(1)}%` : 'N/A'} />
                <ReferenceLine y={75} stroke="#c0392b" strokeDasharray="5 4" label={{ value: '75%', position: 'insideTopRight', fill: '#c0392b', fontSize: 10 }} />
                <Line type="monotone" dataKey="overallPct" name="Overall %" stroke="#4E2C79" strokeWidth={2.5} dot={{ r: 5, fill: '#4E2C79', cursor: 'pointer' }} activeDot={{ r: 7, cursor: 'pointer' }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
            <ThresholdNote>— 75% target</ThresholdNote>
          </ChartCard>
          <ChartCard>
            <h3>Chargeability % by Service Line</h3><p className="sub">Click a dot to expand that month below</p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={filteredPoints} margin={{ top: 10, right: 30, left: 40, bottom: 8 }} onClick={handleTrendDotClick} style={{ cursor: 'pointer' }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="label" fontSize={10} angle={-35} textAnchor="end" interval={0} height={70} tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 115]} unit="%" fontSize={10} width={40} />
                <Tooltip formatter={(v: any) => v != null ? `${Number(v).toFixed(1)}%` : 'N/A'} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                <ReferenceLine y={75} stroke="#c0392b" strokeDasharray="5 4" />
                {visibleKeys.map((k, i) => (
                  <Line key={k} type="monotone" dataKey={k}
                    stroke={DEPT_COLORS[k] ?? TREND_COLORS[i % TREND_COLORS.length]}
                    strokeWidth={2.5} dot={{ r: 5, fill: DEPT_COLORS[k] ?? TREND_COLORS[i % TREND_COLORS.length], cursor: 'pointer' }} activeDot={{ r: 7, cursor: 'pointer' }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <ThresholdNote>— 75% target</ThresholdNote>
          </ChartCard>
        </ChartGrid>
        <TblCard ref={trendTableRef}>
          <TblHdr><h3>Monthly Summary</h3></TblHdr>
          <TblWrap><StyledTable>
            <thead><tr>
              <th style={{ width: 36 }}>#</th>
              <th>Month</th><th>Chargeability %</th>
              {visibleKeys.map(k => <th key={k} className="num">{k}</th>)}
            </tr></thead>
            <tbody>
              {validPoints.map((s, si) => (
                <React.Fragment key={s.period}>
                  <tr style={{ cursor: 'pointer' }} onClick={() => setDrillTrend(drillTrend === s.period ? null : s.period)}>
                    <td style={{ color: '#888', fontSize: 11 }}>{si + 1}</td>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {drillTrend === s.period ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      <strong>{s.label}</strong>
                    </span></td>
                    <td><InlineBar pct={s.overallPct} /></td>
                    {visibleKeys.map(k => (
                      <td key={k} className="num">
                        {s[k] != null ? <span style={{ color: pctColor(s[k]), fontWeight: 600 }}>{Number(s[k]).toFixed(1)}%</span> : <span style={{ color: '#ccc' }}>—</span>}
                      </td>
                    ))}
                  </tr>
                  {drillTrend === s.period && (
                    <tr><td colSpan={2 + visibleKeys.length} style={{ padding: 0, background: '#f9f7ff' }}>
                      <DrilldownHdr>{s.label} — resources below 75%</DrilldownHdr>
                      <TblWrap><StyledTable>
                        <thead><tr><th style={{ width: 36 }}>#</th><th>Name</th><th>Dept</th><th>Location</th><th>Actual %</th><th>Status</th></tr></thead>
                        <tbody>
                          {filtered.filter(e => e.chargeabilityPct < 75).sort((a, b) => a.chargeabilityPct - b.chargeabilityPct).map((r, ri) => (
                            <tr key={`${r.empId}-${ri}`}>
                              <td style={{ color: '#888', fontSize: 11 }}>{ri + 1}</td>
                              <td><NameBtn onClick={() => setSelectedEmp(r)}>{r.name}</NameBtn></td>
                              <td>{r.department}</td><td>{r.location}</td>
                              <td><InlineBar pct={r.chargeabilityPct} /></td>
                              <td><Badge $pct={r.chargeabilityPct}>{statusLabel(r.chargeabilityPct)}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </StyledTable></TblWrap>
                    </td></tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </StyledTable></TblWrap>
        </TblCard>
      </>
    )
  }

  const renderAlerts = () => {
    const belowEmps = filtered.filter(e => e.chargeabilityPct < TARGET)
    const byDept = groupBy(belowEmps, 'department')
    const periodLabel = data.period ? formatPeriodLabel(data.period) : 'Current Period'
    if (!belowEmps.length) {
      return <div style={{ padding: 40, textAlign: 'center', color: '#888', fontSize: 14 }}>✅ No resources below 75% in current filter selection</div>
    }
    return (
      <>
        <SectionHeader>Low Chargeability Alerts</SectionHeader>
        <SectionSub>Auto-generated email drafts per service line for resources below 75%</SectionSub>
        {Object.keys(byDept).sort().map(dept => {
          const rows = [...byDept[dept]].sort((a, b) => a.chargeabilityPct - b.chargeabilityPct)
          const from = DEPT_MAILBOXES[dept] ?? 'resourcingrequestsarc@uniqus.com'
          const nameList = rows.slice(0, 12).map(r => `  • ${r.name} — ${r.location} | ${r.designation} | ${r.chargeabilityPct.toFixed(1)}%`).join('\n')
          const more = rows.length > 12 ? `\n  ... and ${rows.length - 12} more resources` : ''
          const body = `Hi All,\n\nHope you're doing well.\n\nBased on the timesheet data from Zoho, we've observed that your utilisation for the month of ${periodLabel} is currently showing less than 75%.\n\nAccording to our forecast tracker, you were scheduled to be on a chargeable project during this period. Could you please clarify the reason for the low utilisation and confirm whether the time will be charged back for this variance.\n\nResources below 75% — ${dept} (${rows.length} total):\n${nameList}${more}\n\nPlease revert at the earliest so we can update the forecast accordingly.\n\nBest Regards,\nResource Management Team\nUniqus Consultech`
          const mailto = `mailto:${from}?subject=${encodeURIComponent(`Low Utilisation Alert — ${dept} | ${periodLabel} (${rows.length} Resources Below 75%)`)}&body=${encodeURIComponent(body)}`
          return (
            <AlertBox key={dept}>
              <h4>🔔 {dept} — {rows.length} resources below 75%</h4>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>From: <strong>{from}</strong></div>
              <EmailPreview>{body}</EmailPreview>
              <SendBtn href={mailto}>📧 Open in Outlook — {dept}</SendBtn>
            </AlertBox>
          )
        })}
      </>
    )
  }

  /* ════════════════════════════════════════════════════
     JSX
  ════════════════════════════════════════════════════ */
  return (
    <div>
      {selectedEmp && <EmployeeModal emp={selectedEmp} weekRange={data.weekRange} onClose={() => setSelectedEmp(null)} />}

      {/* Period selector — hidden when parent controls it */}
      {!hidePeriodSelector && data.availablePeriods.length > 0 && (
        <PeriodRow>
          <Calendar size={14} style={{ color: 'var(--color-text-secondary)' }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Period:</span>
          <PSelect value={selectedPeriod ?? ''} onChange={e => setSelectedPeriod(e.target.value || undefined)}>
            <option value="">Latest ({data.availablePeriods[0] ? formatPeriodLabel(data.availablePeriods[0]) : '—'})</option>
            {data.availablePeriods.map(p => <option key={p} value={p}>{formatPeriodLabel(p)}</option>)}
          </PSelect>
          {selectedPeriod && <span style={{ fontSize: 11, color: 'var(--color-primary)' }}>Showing: {formatPeriodLabel(selectedPeriod)}</span>}
        </PeriodRow>
      )}

      {/* Filter bar — hidden when parent (dashboard) owns the filter bar */}
      {!hideFilterBar && (
      <FilterBar>
        <SearchWrap>
          <span>🔍</span>
          <SearchInput type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, location, grade…" />
        </SearchWrap>
        <FLabel>Dept</FLabel>
        <MultiSelect options={deptOptions} values={fDepts} onChange={v => { setFDepts(v); setFSubFuncs([]) }} placeholder="All Depts" />
        <FLabel>Sub-Function</FLabel>
        <MultiSelect options={subFuncOptions} values={fSubFuncs} onChange={setFSubFuncs} placeholder="All Sub-Functions" />
        <FLabel>Region</FLabel>
        <MultiSelect options={regionOptions} values={fRegions} onChange={v => { setFRegions(v); setFLocs([]) }} placeholder="All Regions" />
        <FLabel>Location</FLabel>
        <MultiSelect options={locOptions} values={fLocs} onChange={setFLocs} placeholder="All Locations" />
        <FLabel>Designation</FLabel>
        <MultiSelect options={desigOptions} values={fDesigs} onChange={setFDesigs} placeholder="All Designations" />
        <FLabel>Status</FLabel>
        <MultiSelect
          options={['Critical (< 30%)', 'At Risk (30–74%)', 'Below Target (< 75%)', 'On Target (≥ 75%)', 'Exceeding (≥ 90%)']}
          values={fStatus.map(s => s === 'critical' ? 'Critical (< 30%)' : s === 'atrisk' ? 'At Risk (30–74%)' : s === 'below75' ? 'Below Target (< 75%)' : s === 'above75' ? 'On Target (≥ 75%)' : 'Exceeding (≥ 90%)')}
          onChange={labels => setFStatus(labels.map(l => l === 'Critical (< 30%)' ? 'critical' : l === 'At Risk (30–74%)' ? 'atrisk' : l === 'Below Target (< 75%)' ? 'below75' : l === 'On Target (≥ 75%)' ? 'above75' : 'exceeding'))}
          placeholder="All Statuses"
        />
        {hasFilters && <ClearBtn onClick={clearFilters}>✕ Clear</ClearBtn>}
        <FilterStats>{filtered.length} of {allEmployees.length} shown</FilterStats>
      </FilterBar>
      )}

      {/* Tab nav */}
      <TabNav>
        {CP_TABS.map(tab => (
          <TabBtn key={tab} $active={cpTab === tab} onClick={() => setCpTab(tab)}>
            {tab === 'Service Lines' && '📊 '}{tab === 'Sub-Teams' && '🔍 '}
            {tab === 'Locations' && '🌍 '}{tab === 'Designations' && '🏷️ '}
            {tab === 'Resources' && '👤 '}{tab === 'Trends' && '📈 '}{tab === 'Alerts' && '🔔 '}
            {tab}
          </TabBtn>
        ))}
      </TabNav>

      {cpTab === 'Service Lines'  && renderServiceLines()}
      {cpTab === 'Sub-Teams'      && renderSubTeams()}
      {cpTab === 'Locations'      && renderLocations()}
      {cpTab === 'Designations'   && renderDesignations()}
      {cpTab === 'Resources'      && renderResources()}
      {cpTab === 'Trends'         && renderTrends()}
      {cpTab === 'Alerts'         && renderAlerts()}
    </div>
  )
}
