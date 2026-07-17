'use client'

import React, { useState, useMemo, useEffect } from 'react'
import styled from 'styled-components'
import StatCard from '@/components/shared/stat-card'
import Modal from '@/components/shared/modal'
import { SelectFilter } from '@/components/shared/filter-bar'
import MultiSelect from '@/components/shared/multi-select'
import { useToast } from '@/components/shared/toast'
import { PageLoader } from '@/components/shared/page-loader'
import { useDashboardData } from '@/hooks/use-dashboard-data'
import {
  forecastSummary as forecastSummaryApi,
  type ForecastSummary,
  type WeeklyForecastRow,
} from '@/lib/api'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, ReferenceLine, LabelList, Cell,
} from 'recharts'
import { useGlobalSearch } from '@/components/shared/search-context'
import { useDesignationFilter } from '@/components/shared/designation-filter-context'
import DesignationFilterButtons from '@/components/shared/designation-filter-buttons'

const DEPT_COLORS: Record<string, string> = {
  'ARC': '#44217A',
  'GRC': '#BD1C7D',
  'SCC': '#D4A017',
  'Tech Consulting': '#10b981',
  'Valuations': '#0071e3',
}
const DEPT_COLOR_FALLBACK = '#888888'

// ─── Styled components ────────────────────────────────────────────────────────

const PageHeader = styled.div`
  margin-bottom: 24px;
  h1 { font-size: 22px; font-weight: 700; }
  p  { font-size: 14px; color: var(--color-text-secondary); margin-top: 4px; }
`

const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`

const FilterRow = styled.div`
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  align-items: center;
  flex-wrap: wrap;
`

const FilterLabel = styled.span`
  font-size: 13px;
  color: var(--color-text-secondary);
  white-space: nowrap;
`

const SectionGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 24px;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`

const ChartCard = styled.div`
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-sm);
  h3 { font-size: 14px; font-weight: 600; margin-bottom: 16px; }
`

const ChartToggle = styled.div`
  display: inline-flex;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  overflow: hidden;
`

const ChartToggleBtn = styled.button<{ $active: boolean }>`
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 500;
  color: ${p => p.$active ? '#fff' : 'var(--color-text-secondary)'};
  background: ${p => p.$active ? 'var(--color-primary)' : 'transparent'};
  &:hover { background: ${p => p.$active ? 'var(--color-primary-hover)' : 'var(--color-border-light)'}; }
`

// ─── FTE Breakdown table ──────────────────────────────────────────────────────

const BreakdownCard = styled.div`
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-sm);
  margin-bottom: 24px;
`

const BreakdownHeader = styled.div`
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
  h3 { font-size: 15px; font-weight: 600; margin: 0; }
`

const TabRow = styled.div`
  display: inline-flex;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  overflow: hidden;
`

const Tab = styled.button<{ $active: boolean }>`
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 500;
  color: ${p => p.$active ? '#fff' : 'var(--color-text-secondary)'};
  background: ${p => p.$active ? 'var(--color-primary)' : 'transparent'};
  border: none;
  cursor: pointer;
  &:hover { background: ${p => p.$active ? 'var(--color-primary)' : 'var(--color-border-light)'}; }
`

const BreakdownFilters = styled.div`
  padding: 12px 20px;
  border-bottom: 1px solid var(--color-border);
  display: flex;
  gap: 12px;
  align-items: center;
`

const BTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
`

const BTh = styled.th`
  padding: 10px 16px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
`

const BTd = styled.td`
  padding: 10px 16px;
  border-bottom: 1px solid var(--color-border-light);
  vertical-align: middle;
`

// ─── Info tooltip ─────────────────────────────────────────────────────────────

const InfoWrap = styled.div`
  position: relative;
  display: inline-flex;
  align-items: center;
`

const InfoBtn = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid var(--color-text-secondary);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 11px;
  font-weight: 700;
  cursor: default;
  margin-left: 8px;
  flex-shrink: 0;
  line-height: 1;
  &:hover { border-color: var(--color-primary); color: var(--color-primary); }
`

const InfoPopover = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  width: 340px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  box-shadow: var(--shadow-md, 0 4px 20px rgba(0,0,0,0.12));
  padding: 16px;
  z-index: 100;
  font-size: 12px;
  line-height: 1.55;

  /* Small arrow pointing up */
  &::before {
    content: '';
    position: absolute;
    top: -6px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 6px solid var(--color-border);
  }
  &::after {
    content: '';
    position: absolute;
    top: -5px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 6px solid var(--color-bg-card);
  }
`

const PopoverTitle = styled.div`
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--color-border-light);
`

const PopoverRow = styled.div`
  display: flex;
  gap: 10px;
  margin-bottom: 8px;
  &:last-child { margin-bottom: 0; }
`

const PopoverLabel = styled.span`
  font-weight: 600;
  color: var(--color-text);
  min-width: 80px;
  flex-shrink: 0;
`

const PopoverDesc = styled.span`
  color: var(--color-text-secondary);
`

// Right-edge variant — used by ChartInfoButton (button is at the right of card headers)
const InfoPopoverRight = styled(InfoPopover)`
  left: auto;
  right: 0;
  transform: none;
  &::before { left: auto; right: 6px; transform: none; }
  &::after  { left: auto; right: 6px; transform: none; }
`

function ChartInfoButton({ title, lines }: { title: string; lines: { label: string; desc: string }[] }) {
  const [open, setOpen] = React.useState(false)
  return (
    <InfoWrap onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <InfoBtn type="button" aria-label="Chart explanation">i</InfoBtn>
      {open && (
        <InfoPopoverRight>
          <PopoverTitle>{title}</PopoverTitle>
          {lines.map(l => (
            <PopoverRow key={l.label}>
              <PopoverLabel>{l.label}</PopoverLabel>
              <PopoverDesc>{l.desc}</PopoverDesc>
            </PopoverRow>
          ))}
        </InfoPopoverRight>
      )}
    </InfoWrap>
  )
}

function FteInfoButton() {
  const [open, setOpen] = React.useState(false)
  return (
    <InfoWrap
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <InfoBtn type="button" aria-label="What do these numbers mean?">i</InfoBtn>
      {open && (
        <InfoPopover>
          <PopoverTitle>What do these numbers mean?</PopoverTitle>
          <PopoverRow>
            <PopoverLabel>1 FTE</PopoverLabel>
            <PopoverDesc>One Full-Time Equivalent = one person working 100% of a standard 40-hr week. So 0.5 FTE = half a person's time.</PopoverDesc>
          </PopoverRow>
          <PopoverRow>
            <PopoverLabel>Capacity</PopoverLabel>
            <PopoverDesc>Total available FTE for the group — the count of active employees (each counted as 1 FTE).</PopoverDesc>
          </PopoverRow>
          <PopoverRow>
            <PopoverLabel>Forecast</PopoverLabel>
            <PopoverDesc>Projected billable FTE based on each employee's current-month confirmed/proposed allocation, carried forward 2 months.</PopoverDesc>
          </PopoverRow>
          <PopoverRow>
            <PopoverLabel>Actuals</PopoverLabel>
            <PopoverDesc>Realised billable FTE from the latest timesheet period: Headcount × avg chargeability %.</PopoverDesc>
          </PopoverRow>
          <PopoverRow>
            <PopoverLabel>Variance</PopoverLabel>
            <PopoverDesc>Forecast − Actuals. Negative means delivery fell short of plan; positive means over-delivery.</PopoverDesc>
          </PopoverRow>
          <PopoverRow>
            <PopoverLabel>Utilization</PopoverLabel>
            <PopoverDesc>Forecast ÷ Capacity × 100. ≥100% = over-booked (green), &lt;75% = bench risk (amber/red).</PopoverDesc>
          </PopoverRow>
        </InfoPopover>
      )}
    </InfoWrap>
  )
}

const UtilBadge = styled.span<{ $pct: number }>`
  font-weight: 600;
  color: ${p =>
    p.$pct >= 100 ? 'var(--color-success)' :
    p.$pct >= 75  ? 'var(--color-text)' :
    p.$pct >= 60  ? 'var(--color-warning)' :
    'var(--color-danger)'
  };
`

const SubSLChip = styled.span`
  display: inline-block;
  margin-right: 4px;
  color: var(--color-primary);
  font-weight: 500;
  font-size: 12px;
`

const VarCell = styled.span<{ $val: number | null }>`
  font-weight: 500;
  color: ${p =>
    p.$val === null ? 'var(--color-text-muted)' :
    p.$val >= 0    ? 'var(--color-text-muted)' :
    'var(--color-danger)'
  };
`

// ─── Detail modal components ─────────────────────────────────────────────────

const DetailList = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius-lg)', overflow: 'hidden' }}>
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--color-border)', fontSize: 12, fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
    <div style={{ padding: '4px 0' }}>{children}</div>
  </div>
)

const DetailListRow = ({ label, value }: { label: string; value: number | string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 14px', borderBottom: '1px solid var(--color-border-light)' }}>
    <span style={{ fontSize: 13, color: 'var(--color-text)' }}>{label}</span>
    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)' }}>{value}</span>
  </div>
)

const DetailTileBox = styled.div<{ $accent?: string }>`
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  span:first-child { font-size: 11px; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.04em; }
  span:last-child { font-size: 22px; font-weight: 700; color: ${p => p.$accent ?? 'var(--color-text)'}; }
`

const DetailTile = ({ label, value, accent }: { label: string; value: number | string; accent?: string }) => (
  <DetailTileBox $accent={accent}>
    <span>{label}</span>
    <span>{value}</span>
  </DetailTileBox>
)

const ModalTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
`

const MTh = styled.th`
  padding: 10px 14px;
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
`

const MTd = styled.td`
  padding: 10px 14px;
  border-bottom: 1px solid var(--color-border-light);
  vertical-align: middle;
`

const StatusBadge = styled.span<{ $status: string }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  text-transform: capitalize;
  background: ${p =>
    p.$status === 'active'   ? 'rgba(34,197,94,0.12)'  :
    p.$status === 'pipeline' ? 'rgba(245,158,11,0.12)' :
    p.$status === 'closed'   ? 'rgba(100,116,139,0.12)' :
    'rgba(59,130,246,0.12)'
  };
  color: ${p =>
    p.$status === 'active'   ? 'var(--color-success)'  :
    p.$status === 'pipeline' ? 'var(--color-warning)'  :
    p.$status === 'closed'   ? 'var(--color-text-secondary)' :
    'var(--color-primary)'
  };
`

const UtilTile = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  font-size: 13px;
  font-weight: 500;
`

const LocBarRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
`

const LocBarLabel = styled.span`
  font-size: 13px;
  color: var(--color-text);
  width: 120px;
  flex-shrink: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`

const LocBarTrack = styled.div`
  flex: 1;
  height: 8px;
  background: var(--color-border);
  border-radius: 999px;
  overflow: hidden;
`

const LocBarFill = styled.div<{ $pct: number }>`
  height: 100%;
  width: ${p => p.$pct}%;
  background: var(--color-primary);
  border-radius: 999px;
  transition: width 0.3s ease;
`

const LocBarValue = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text-secondary);
  width: 44px;
  text-align: right;
  flex-shrink: 0;
`

// ─── Weekly Forecast Table ────────────────────────────────────────────────────

const ForecastGrid = styled.div`
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
  margin-bottom: 32px;
`

const ForecastTable = styled.div`
  overflow-x: auto;
  max-width: 100%;
`

const FTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
`

const FThMonth = styled.th`
  padding: 8px 12px;
  text-align: center;
  font-weight: 700;
  color: var(--color-text);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
`

const FTh = styled.th`
  padding: 7px 10px;
  text-align: center;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
  font-size: 11px;
`

const FTdLabel = styled.td<{ $level: number }>`
  padding: 8px 12px 8px ${p => 12 + p.$level * 20}px;
  border-bottom: 1px solid var(--color-border-light);
  white-space: nowrap;
  position: sticky;
  left: 0;
  background: var(--color-bg-card);
  z-index: 1;
  min-width: 200px;
  max-width: 240px;
  font-size: ${p => p.$level === 0 ? '13px' : '12px'};
  font-weight: ${p => p.$level === 0 ? 600 : 400};
`

const FTdValue = styled.td<{ $pct: number | null }>`
  padding: 7px 10px;
  text-align: center;
  border-bottom: 1px solid var(--color-border-light);
  font-weight: 500;
  font-size: 12px;
  white-space: nowrap;
  background: ${p =>
    p.$pct === null     ? 'transparent' :
    p.$pct >= 80        ? 'rgba(34,197,94,0.1)' :
    p.$pct >= 50        ? 'rgba(59,130,246,0.08)' :
    'transparent'
  };
  color: ${p =>
    p.$pct === null ? 'var(--color-text-muted)' :
    p.$pct >= 80    ? 'var(--color-success)' :
    p.$pct >= 50    ? 'var(--color-primary)' :
    p.$pct > 0      ? 'var(--color-text-secondary)' :
    'var(--color-text-muted)'
  };
`

const RoleBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: ${p => p.$color};
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  margin-right: 8px;
  flex-shrink: 0;
`

const ExpandBtn = styled.button`
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
  color: var(--color-text-secondary);
  font-size: 11px;
  background: none;
  border: none;
  cursor: pointer;
  &:hover { color: var(--color-text); }
`

const EmptyState = styled.div`
  text-align: center;
  padding: 60px 20px;
  color: var(--color-text-secondary);
  font-size: 14px;
`

// ─── Badge colors per role initial ───────────────────────────────────────────

const ROLE_COLORS = [
  '#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#f97316', '#64748b', '#14b8a6',
]
const roleColor = (role: string) => ROLE_COLORS[Math.abs([...role].reduce((h, c) => (h << 5) - h + c.charCodeAt(0), 0)) % ROLE_COLORS.length]

// ─── Week column helpers ──────────────────────────────────────────────────────

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function weekColHeader(weekISO: string): { monthKey: string; dayRange: string } {
  const d = new Date(weekISO + 'T00:00:00')
  const fri = new Date(d)
  fri.setDate(d.getDate() + 4)
  const monthKey = `${MONTHS_SHORT[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`
  const dayRange = `${String(d.getDate()).padStart(2, '0')}-${String(fri.getDate()).padStart(2, '0')}`
  return { monthKey, dayRange }
}

function groupWeeksByMonth(weeks: string[]): { monthKey: string; weeks: string[] }[] {
  const map = new Map<string, string[]>()
  for (const w of weeks) {
    const { monthKey } = weekColHeader(w)
    if (!map.has(monthKey)) map.set(monthKey, [])
    map.get(monthKey)!.push(w)
  }
  return [...map.entries()].map(([monthKey, weeks]) => ({ monthKey, weeks }))
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ForecastingPage() {
  const { addToast } = useToast()
  const { data: liveData, loading: liveLoading } = useDashboardData()
  const { globalSearch } = useGlobalSearch()
  const { filter: designationGroup } = useDesignationFilter()

  const [summary, setSummary] = useState<ForecastSummary | null>(null)
  const [summaryLoading, setSummaryLoading] = useState(true) // starts true; set false in effect callback
  const [trendChartType, setTrendChartType] = useState<'bar' | 'line'>('line')

  // Filters
  const [deptFilter, setDeptFilter] = useState<string[]>([])
  const [subSLFilter, setSubSLFilter] = useState<string[]>([])
  const [locationFilter, setLocationFilter] = useState<string[]>([])
  const [gradeFilter, setGradeFilter] = useState<string[]>([])
  const [regionFilter, setRegionFilter] = useState<string[]>([])
  const [fteTab, setFteTab] = useState<'sl' | 'location'>('sl')
  const [fteUtilFilter, setFteUtilFilter] = useState('all')

  // Weekly table expand state
  const [expandedRoles, setExpandedRoles] = useState<Set<string>>(new Set())
  const [expandedEmps, setExpandedEmps] = useState<Set<string>>(new Set())

  // Load forecast summary (re-fetches when designation filter changes)
  useEffect(() => {
    setSummaryLoading(true)
    forecastSummaryApi.get(designationGroup)
      .then(data => setSummary(data))
      .catch(err => addToast(err instanceof Error ? err.message : 'Failed to load forecast data', 'error'))
      .finally(() => setSummaryLoading(false))
  }, [designationGroup]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Filter options from live employee data ────────────────────────────────
  const allServiceLines = useMemo(() =>
    Array.from(new Set(liveData.employees.map((e: any) => e.department).filter(Boolean))).sort() as string[],
    [liveData.employees])

  const deptToSubSLs = useMemo(() => {
    const m = new Map<string, Set<string>>()
    liveData.employees.forEach((e: any) => {
      if (!e.department || !e.subFunction) return
      if (!m.has(e.department)) m.set(e.department, new Set())
      m.get(e.department)!.add(e.subFunction)
    })
    return m
  }, [liveData.employees])

  const allSubSLs = useMemo(() =>
    Array.from(new Set(liveData.employees.map((e: any) => e.subFunction).filter(Boolean))).sort() as string[],
    [liveData.employees])

  const filteredSubSLs = useMemo(() => {
    if (deptFilter.length === 0) return allSubSLs
    const allowed = new Set(deptFilter.flatMap(d => [...(deptToSubSLs.get(d) ?? [])]))
    return allSubSLs.filter(s => allowed.has(s))
  }, [deptFilter, allSubSLs, deptToSubSLs])

  const allLocations = useMemo(() =>
    Array.from(new Set(liveData.employees.map((e: any) => e.location).filter(Boolean))).sort() as string[],
    [liveData.employees])

  const regionToLocs = useMemo(() => {
    const m = new Map<string, Set<string>>()
    liveData.employees.forEach((e: any) => {
      if (!e.region || !e.location) return
      if (!m.has(e.region)) m.set(e.region, new Set())
      m.get(e.region)!.add(e.location)
    })
    return m
  }, [liveData.employees])

  const allRegions = useMemo(() =>
    Array.from(new Set(liveData.employees.map((e: any) => e.region).filter(Boolean))).sort() as string[],
    [liveData.employees])

  const filteredLocations = useMemo(() => {
    if (regionFilter.length === 0) return allLocations
    const allowed = new Set(regionFilter.flatMap(r => [...(regionToLocs.get(r) ?? [])]))
    return allLocations.filter(l => allowed.has(l))
  }, [regionFilter, allLocations, regionToLocs])

  const allGrades = useMemo(() =>
    Array.from(new Set(liveData.employees.map((e: any) => e.designation).filter(Boolean))).sort() as string[],
    [liveData.employees])

  // ── KPI Aggregates ────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    if (!summary) return { capacity: 0, forecast: 0, utilization: 0, variance: 0 }
    const rows = deptFilter.length
      ? summary.fteByServiceLine.filter(r => deptFilter.includes(r.serviceLine))
      : summary.fteByServiceLine
    const capacity = rows.reduce((s, r) => s + r.capacity, 0)
    const forecast = rows.reduce((s, r) => s + r.forecast, 0)
    const actuals  = rows.reduce((s, r) => s + (r.actuals ?? 0), 0)
    const utilization = capacity > 0 ? Math.round(forecast / capacity * 1000) / 10 : 0
    const variance = Math.round((forecast - actuals) * 10) / 10
    return { capacity, forecast: Math.round(forecast * 10) / 10, utilization, variance }
  }, [summary, deptFilter])

  // ── Weekly forecast rows (filtered) — must come before FTE breakdowns ──────
  const filteredWeeklyRowsBase = useMemo(() => {
    if (!summary) return []
    let rows = summary.weeklyForecastRows
    if (deptFilter.length)     rows = rows.filter(r => deptFilter.includes(r.serviceLine))
    if (subSLFilter.length)    rows = rows.filter(r => subSLFilter.includes(r.subServiceLine))
    if (locationFilter.length) rows = rows.filter(r => locationFilter.includes(r.location))
    if (regionFilter.length)   rows = rows.filter(r => regionFilter.includes(r.region))
    if (gradeFilter.length)    rows = rows.filter(r => gradeFilter.includes(r.designation))
    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase()
      rows = rows.filter(r => r.name?.toLowerCase().includes(q))
    }
    return rows
  }, [summary, deptFilter, subSLFilter, locationFilter, regionFilter, gradeFilter, globalSearch])

  const anyFilterActive = deptFilter.length > 0 || subSLFilter.length > 0 || locationFilter.length > 0
    || regionFilter.length > 0 || gradeFilter.length > 0 || !!globalSearch.trim()

  const filteredFteSL = useMemo(() => {
    if (!summary) return []
    if (!anyFilterActive) {
      let rows = summary.fteByServiceLine
      if (fteUtilFilter === 'over')  rows = rows.filter(r => r.utilization >= 100)
      if (fteUtilFilter === 'under') rows = rows.filter(r => r.utilization < 75)
      return rows
    }
    const map = new Map<string, { capacity: number; forecast: number; actuals: number; subSLs: Set<string> }>()
    for (const r of filteredWeeklyRowsBase) {
      const sl = r.serviceLine || 'Unknown'
      const prev = map.get(sl) ?? { capacity: 0, forecast: 0, actuals: 0, subSLs: new Set<string>() }
      const weekVals = Object.values(r.weeks ?? {})
      const avgForecast = weekVals.length > 0 ? weekVals.reduce((s: number, w: any) => s + (w.totalPct ?? 0), 0) / weekVals.length / 100 : 0
      if (r.subServiceLine) prev.subSLs.add(r.subServiceLine)
      map.set(sl, { capacity: prev.capacity + 1, forecast: prev.forecast + avgForecast, actuals: prev.actuals, subSLs: prev.subSLs })
    }
    let rows = [...map.entries()].map(([serviceLine, v]) => ({
      serviceLine,
      subServiceLines: [...v.subSLs].sort().join(', '),
      capacity: Math.round(v.capacity * 10) / 10,
      forecast: Math.round(v.forecast * 10) / 10,
      actuals: null as number | null,
      variance: null as number | null,
      utilization: v.capacity > 0 ? Math.round(v.forecast / v.capacity * 1000) / 10 : 0,
    }))
    if (fteUtilFilter === 'over')  rows = rows.filter(r => r.utilization >= 100)
    if (fteUtilFilter === 'under') rows = rows.filter(r => r.utilization < 75)
    return rows
  }, [summary, filteredWeeklyRowsBase, anyFilterActive, fteUtilFilter])

  const filteredFteLoc = useMemo(() => {
    if (!summary) return []
    if (!anyFilterActive) {
      let rows = summary.fteByLocation
      if (locationFilter.length) rows = rows.filter(r => locationFilter.includes(r.location))
      return rows
    }
    const map = new Map<string, { capacity: number; forecast: number }>()
    for (const r of filteredWeeklyRowsBase) {
      const loc = r.location || 'Unknown'
      const prev = map.get(loc) ?? { capacity: 0, forecast: 0 }
      const weekVals = Object.values(r.weeks ?? {})
      const avgForecast = weekVals.length > 0 ? weekVals.reduce((s: number, w: any) => s + (w.totalPct ?? 0), 0) / weekVals.length / 100 : 0
      map.set(loc, { capacity: prev.capacity + 1, forecast: prev.forecast + avgForecast })
    }
    return [...map.entries()].map(([location, v]) => ({
      location,
      capacity: Math.round(v.capacity * 10) / 10,
      forecast: Math.round(v.forecast * 10) / 10,
      actuals: null as number | null,
      variance: null as number | null,
      utilization: v.capacity > 0 ? Math.round(v.forecast / v.capacity * 1000) / 10 : 0,
    }))
  }, [summary, filteredWeeklyRowsBase, anyFilterActive, locationFilter])

  // ── Monthly trend data ────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    if (!summary) return []
    return summary.monthlyTrend.slice(-12)
  }, [summary])

  // ── Service line chart data ───────────────────────────────────────────────
  const slChartData = useMemo(() => {
    return filteredFteSL.map(r => ({
      name: r.serviceLine,
      Capacity: r.capacity,
      Forecast: r.forecast,
      Actuals: r.actuals ?? 0,
    }))
  }, [filteredFteSL])

  // ── Location chart data ───────────────────────────────────────────────────
  const locChartData = useMemo(() => {
    return filteredFteLoc.map(r => ({
      name: r.location,
      Capacity: r.capacity,
      Forecast: r.forecast,
    }))
  }, [filteredFteLoc])

  const filteredWeeklyRows = filteredWeeklyRowsBase

  // All unique future weeks from filtered rows
  const allFutureWeeks = useMemo(() => {
    const s = new Set<string>()
    for (const r of filteredWeeklyRows) Object.keys(r.weeks).forEach(w => s.add(w))
    return [...s].sort()
  }, [filteredWeeklyRows])

  const weeksByMonth = useMemo(() => groupWeeksByMonth(allFutureWeeks), [allFutureWeeks])

  // Group rows by designation (role) for drill-down
  const roleGroups = useMemo(() => {
    const map = new Map<string, WeeklyForecastRow[]>()
    for (const r of filteredWeeklyRows) {
      const role = r.designation || 'Unknown'
      if (!map.has(role)) map.set(role, [])
      map.get(role)!.push(r)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [filteredWeeklyRows])

  // Role-level average utilization per week
  const roleWeekAgg = useMemo(() => {
    const out = new Map<string, Map<string, number>>()
    for (const [role, rows] of roleGroups) {
      const weekMap = new Map<string, { sum: number; n: number }>()
      for (const r of rows) {
        for (const [week, wd] of Object.entries(r.weeks)) {
          if (!weekMap.has(week)) weekMap.set(week, { sum: 0, n: 0 })
          const m = weekMap.get(week)!
          m.sum += wd.totalPct
          m.n++
        }
      }
      const avgs = new Map<string, number>()
      for (const [week, { sum, n }] of weekMap) avgs.set(week, n > 0 ? Math.round(sum / n * 10) / 10 : 0)
      out.set(role, avgs)
    }
    return out
  }, [roleGroups])

  const toggleRole = (role: string) => setExpandedRoles(prev => {
    const n = new Set(prev)
    n.has(role) ? n.delete(role) : n.add(role)
    return n
  })

  const toggleEmp = (empCode: string) => setExpandedEmps(prev => {
    const n = new Set(prev)
    n.has(empCode) ? n.delete(empCode) : n.add(empCode)
    return n
  })

  // ── Detail modal state ────────────────────────────────────────────────────
  const [activeModal, setActiveModal] = useState<'capacity' | 'forecast' | 'utilization' | 'variance' | 'bench' | 'over-allocated' | null>(null)

  // Derived values for detail modals
  const activeProjectCount = useMemo(() => {
    if (!summary) return 0
    return summary.projectFte.filter(p => p.activeFte > 0).length
  }, [summary])

  const avgFtePerResource = useMemo(() => {
    if (!kpi.capacity) return 0
    return Math.round(kpi.forecast / kpi.capacity * 100) / 100
  }, [kpi])

  const totalActiveFte = useMemo(() =>
    (summary?.projectFte ?? []).reduce((s, p) => s + p.activeFte, 0), [summary])
  const totalPipelineFte = useMemo(() =>
    (summary?.projectFte ?? []).reduce((s, p) => s + p.pipelineFte, 0), [summary])

  // Bench = employees with 0% allocation across ALL upcoming weeks (no active assignment)
  const benchEmployees = useMemo(() =>
    filteredWeeklyRows.filter(r => Object.keys(r.weeks).length === 0 || Object.values(r.weeks).every(w => w.totalPct === 0))
  , [filteredWeeklyRows])

  // Over-allocated = employees with >100% in any upcoming week
  const overAllocatedEmployees = useMemo(() =>
    filteredWeeklyRows
      .map(r => {
        const badWeeks = Object.entries(r.weeks)
          .filter(([, w]) => w.totalPct > 100)
          .map(([week, w]) => ({ week, pct: w.totalPct, projects: w.projects }))
        return { ...r, overWeeks: badWeeks }
      })
      .filter(r => r.overWeeks.length > 0)
  , [filteredWeeklyRows])

  const isLoading = (liveLoading && !liveData.employees.length) || summaryLoading
  if (isLoading) return <PageLoader message="Loading forecasting data…" />

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <PageHeader>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div>
            <h1 style={{ color: '#4E2C79', fontWeight: 800 }}>Forecasting & Analytics</h1>
            <p>Utilization-based resource forecast — current month projected 2 months forward</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ background: 'linear-gradient(135deg, #4E2C79, #7C3AED)', color: '#fff', fontWeight: 700, fontSize: 11, padding: '4px 12px', borderRadius: 20, letterSpacing: '0.05em' }}>UNIQUS</span>
          </div>
        </div>
      </PageHeader>

      {/* KPI Cards — all six in one row */}
      <KpiGrid style={{ gridTemplateColumns: 'repeat(6, 1fr)', marginBottom: 24 }}>
        <StatCard accent="#4E2C79" title="Total Capacity"    value={kpi.capacity}                    subtitle="FTEs (active headcount)"      onClick={() => setActiveModal('capacity')} />
        <StatCard accent="#7C3AED" title="Forecast FTE"      value={kpi.forecast}                    subtitle="Projected billable FTE"        onClick={() => setActiveModal('forecast')} />
        <StatCard accent="#06b6d4" title="Avg Utilization"   value={`${kpi.utilization}%`}           subtitle="Forecast / Capacity"           onClick={() => setActiveModal('utilization')} />
        <StatCard accent="#f59e0b" title="Bench"             value={benchEmployees.length}           subtitle="Zero allocation upcoming"      onClick={() => setActiveModal('bench')} />
        <StatCard accent="#ef4444" title="Over-Allocated"    value={overAllocatedEmployees.length}   subtitle=">100% in any week"             onClick={() => setActiveModal('over-allocated')} />
        <StatCard accent="#10b981" title="Variance (FTE)"    value={kpi.variance > 0 ? `+${kpi.variance}` : String(kpi.variance)} subtitle="Forecast − Actuals" onClick={() => setActiveModal('variance')} />
      </KpiGrid>

      {/* ── Detail Modals ──────────────────────────────────────────────────── */}

      {/* 1 — Total Capacity Detail */}
      <Modal open={activeModal === 'capacity'} onClose={() => setActiveModal(null)}
        title="Total Capacity — Detail" subtitle="Click any element on the dashboard for detailed breakdowns" size="lg">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>
          <DetailTile label="Total Headcount" value={kpi.capacity} />
          <DetailTile label="Active Projects" value={activeProjectCount} />
          <DetailTile label="Avg FTE / Resource" value={avgFtePerResource} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <DetailList title="By Grade">
            {(summary?.byGrade ?? []).map(r => <DetailListRow key={r.grade} label={r.grade} value={r.count} />)}
          </DetailList>
          <DetailList title="By Location">
            {(summary?.fteByLocation ?? []).map(r => <DetailListRow key={r.location} label={r.location} value={r.capacity} />)}
          </DetailList>
          <DetailList title="By Service Line">
            {(summary?.fteByServiceLine ?? []).map(r => <DetailListRow key={r.serviceLine} label={r.serviceLine} value={r.capacity} />)}
          </DetailList>
        </div>
      </Modal>

      {/* 2 — Forecasted FTE Detail */}
      <Modal open={activeModal === 'forecast'} onClose={() => setActiveModal(null)}
        title="Forecasted FTE — Detail" subtitle="Forecasted FTE across all active and pipeline engagements" size="lg">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          <DetailTile label="Active FTE"   value={Math.round(totalActiveFte * 10) / 10}   accent="var(--color-success)" />
          <DetailTile label="Pipeline FTE" value={Math.round(totalPipelineFte * 10) / 10} accent="var(--color-warning)" />
        </div>
        <ModalTable>
          <thead>
            <tr>
              <MTh>Project</MTh>
              <MTh>Code</MTh>
              <MTh>SL</MTh>
              <MTh style={{ textAlign: 'right' }}>Active FTE</MTh>
              <MTh style={{ textAlign: 'right' }}>Pipeline FTE</MTh>
              <MTh>Status</MTh>
            </tr>
          </thead>
          <tbody>
            {(summary?.projectFte ?? []).length === 0
              ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-secondary)' }}>No upcoming project allocations found</td></tr>
              : (summary?.projectFte ?? []).map(p => (
                <tr key={p.projectName}>
                  <MTd><strong>{p.projectName}</strong></MTd>
                  <MTd style={{ color: 'var(--color-text-secondary)', fontFamily: 'monospace', fontSize: 11 }}>{p.projectCode || '—'}</MTd>
                  <MTd>{p.serviceLine || '—'}</MTd>
                  <MTd style={{ textAlign: 'right', fontWeight: 600 }}>{p.activeFte.toFixed(1)}</MTd>
                  <MTd style={{ textAlign: 'right', color: 'var(--color-warning)' }}>{p.pipelineFte.toFixed(1)}</MTd>
                  <MTd>
                    <StatusBadge $status={p.status}>{p.status}</StatusBadge>
                  </MTd>
                </tr>
              ))
            }
          </tbody>
        </ModalTable>
      </Modal>

      {/* 3 — Utilization Detail */}
      <Modal open={activeModal === 'utilization'} onClose={() => setActiveModal(null)}
        title="Utilization — Detail" subtitle="Utilization breakdown across service lines and locations" size="md">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          {(filteredFteSL.length > 0 ? filteredFteSL : summary?.fteByServiceLine ?? []).map(r => (
            <UtilTile key={r.serviceLine}>
              <span>{r.serviceLine}</span>
              <UtilBadge $pct={r.utilization}>{r.utilization.toFixed(1)}%</UtilBadge>
            </UtilTile>
          ))}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Utilization by Location
        </div>
        {(summary?.fteByLocation ?? []).map(r => {
          const pct = r.utilization
          return (
            <LocBarRow key={r.location}>
              <LocBarLabel>{r.location}</LocBarLabel>
              <LocBarTrack>
                <LocBarFill $pct={Math.min(pct, 100)} />
              </LocBarTrack>
              <LocBarValue>{pct.toFixed(1)}%</LocBarValue>
            </LocBarRow>
          )
        })}
      </Modal>

      {/* 4 — Variance Analysis Detail */}
      <Modal open={activeModal === 'variance'} onClose={() => setActiveModal(null)}
        title="Variance Analysis — Detail" subtitle="Variance (Actuals – Forecast) by service line and location" size="lg">
        <ModalTable style={{ marginBottom: 24 }}>
          <thead>
            <tr>
              <MTh>Service Line</MTh>
              <MTh style={{ textAlign: 'right' }}>Forecast</MTh>
              <MTh style={{ textAlign: 'right' }}>Actuals</MTh>
              <MTh style={{ textAlign: 'right' }}>Variance</MTh>
            </tr>
          </thead>
          <tbody>
            {(filteredFteSL.length > 0 ? filteredFteSL : summary?.fteByServiceLine ?? []).map(r => (
              <tr key={r.serviceLine}>
                <MTd>{r.serviceLine}</MTd>
                <MTd style={{ textAlign: 'right' }}>{r.forecast.toFixed(1)}</MTd>
                <MTd style={{ textAlign: 'right' }}>{r.actuals != null ? r.actuals.toFixed(1) : '—'}</MTd>
                <MTd style={{ textAlign: 'right' }}>
                  <VarCell $val={r.variance}>{r.variance != null ? r.variance.toFixed(1) : '—'}</VarCell>
                </MTd>
              </tr>
            ))}
          </tbody>
        </ModalTable>
        <ModalTable>
          <thead>
            <tr>
              <MTh>Location</MTh>
              <MTh style={{ textAlign: 'right' }}>Forecast</MTh>
              <MTh style={{ textAlign: 'right' }}>Actuals</MTh>
              <MTh style={{ textAlign: 'right' }}>Variance</MTh>
            </tr>
          </thead>
          <tbody>
            {(summary?.fteByLocation ?? []).map(r => {
              const actuals = r.actuals ?? null
              const variance = actuals !== null ? Math.round((r.forecast - actuals) * 10) / 10 : null
              return (
                <tr key={r.location}>
                  <MTd>{r.location}</MTd>
                  <MTd style={{ textAlign: 'right' }}>{r.forecast.toFixed(1)}</MTd>
                  <MTd style={{ textAlign: 'right' }}>{actuals !== null ? actuals.toFixed(1) : '—'}</MTd>
                  <MTd style={{ textAlign: 'right' }}>
                    <VarCell $val={variance}>{variance !== null ? variance.toFixed(1) : '—'}</VarCell>
                  </MTd>
                </tr>
              )
            })}
          </tbody>
        </ModalTable>
      </Modal>

      {/* 5 — Bench Detail */}
      <Modal open={activeModal === 'bench'} onClose={() => setActiveModal(null)}
        title="Bench — Detail" subtitle="Employees with no upcoming client allocation" size="lg">
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(245,158,11,0.08)', borderRadius: 'var(--border-radius)', border: '1px solid rgba(245,158,11,0.2)', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          These employees have <strong>0% allocation</strong> across all upcoming forecast weeks. They are available for new project assignments or are currently without active client work.
        </div>
        {benchEmployees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-secondary)' }}>No bench employees found for the current filters.</div>
        ) : (
          <ModalTable>
            <thead>
              <tr>
                <MTh>Employee</MTh>
                <MTh>Grade</MTh>
                <MTh>Service Line</MTh>
                <MTh>Sub-SL</MTh>
                <MTh>Location</MTh>
              </tr>
            </thead>
            <tbody>
              {benchEmployees.map(r => (
                <tr key={r.empCode}>
                  <MTd><strong>{r.name}</strong><br /><span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{r.empCode}</span></MTd>
                  <MTd>{r.designation || '—'}</MTd>
                  <MTd>{r.serviceLine || '—'}</MTd>
                  <MTd>{r.subServiceLine || '—'}</MTd>
                  <MTd>{r.location || '—'}</MTd>
                </tr>
              ))}
            </tbody>
          </ModalTable>
        )}
      </Modal>

      {/* 6 — Over-Allocated Detail */}
      <Modal open={activeModal === 'over-allocated'} onClose={() => setActiveModal(null)}
        title="Over-Allocated — Detail" subtitle="Employees exceeding 100% allocation in upcoming weeks" size="lg">
        <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.08)', borderRadius: 'var(--border-radius)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          These employees are allocated <strong>above 100%</strong> in one or more upcoming weeks. This may indicate conflicting project bookings that need resolution.
        </div>
        {overAllocatedEmployees.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-secondary)' }}>No over-allocated employees found for the current filters.</div>
        ) : (
          <ModalTable>
            <thead>
              <tr>
                <MTh>Employee</MTh>
                <MTh>Grade</MTh>
                <MTh>Service Line</MTh>
                <MTh>Week</MTh>
                <MTh style={{ textAlign: 'right' }}>Total %</MTh>
                <MTh>Projects</MTh>
              </tr>
            </thead>
            <tbody>
              {overAllocatedEmployees.flatMap(r =>
                r.overWeeks.map((w, i) => (
                  <tr key={`${r.empCode}-${w.week}`}>
                    {i === 0 && (
                      <MTd rowSpan={r.overWeeks.length}>
                        <strong>{r.name}</strong><br />
                        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{r.empCode}</span>
                      </MTd>
                    )}
                    {i === 0 && <MTd rowSpan={r.overWeeks.length}>{r.designation || '—'}</MTd>}
                    {i === 0 && <MTd rowSpan={r.overWeeks.length}>{r.serviceLine || '—'}</MTd>}
                    <MTd style={{ fontFamily: 'monospace', fontSize: 12 }}>{w.week}</MTd>
                    <MTd style={{ textAlign: 'right', color: 'var(--color-danger)', fontWeight: 700 }}>{w.pct}%</MTd>
                    <MTd style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      {w.projects.map(p => p.name ?? p.status).join(', ') || '—'}
                    </MTd>
                  </tr>
                ))
              )}
            </tbody>
          </ModalTable>
        )}
      </Modal>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <DesignationFilterButtons />
      </div>

      <FilterRow>
        <FilterLabel>Service Line:</FilterLabel>
        <MultiSelect options={allServiceLines} values={deptFilter} onChange={setDeptFilter} placeholder="All Service Lines" />
        <FilterLabel>Sub-SL:</FilterLabel>
        <MultiSelect options={filteredSubSLs} values={subSLFilter} onChange={setSubSLFilter} placeholder="All Sub-SLs" />
        <FilterLabel>Region:</FilterLabel>
        <MultiSelect options={allRegions} values={regionFilter} onChange={setRegionFilter} placeholder="All Regions" />
        <FilterLabel>Location:</FilterLabel>
        <MultiSelect options={filteredLocations} values={locationFilter} onChange={setLocationFilter} placeholder="All Locations" />
        <FilterLabel>Grade:</FilterLabel>
        <MultiSelect options={allGrades} values={gradeFilter} onChange={setGradeFilter} placeholder="All Grades" />
      </FilterRow>

      {/* Charts row 1 — both bar charts side by side */}
      <SectionGrid>
        <ChartCard>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, flex: 1 }}>FTE by Service Line</h3>
            <ChartInfoButton
              title="FTE by Service Line"
              lines={[
                { label: 'Capacity', desc: 'Total active headcount per service line — each employee counts as 1 FTE regardless of allocation.' },
                { label: 'Forecast', desc: 'Projected billable FTE: sum of each employee\'s current-month confirmed/proposed allocation %, carried forward.' },
                { label: 'Actuals', desc: 'Realised billable FTE from the latest timesheet period (headcount × avg chargeability %).' },
              ]}
            />
          </div>
          {slChartData.length === 0 ? (
            <EmptyState>No data — apply a different filter</EmptyState>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={slChartData} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} />
                <YAxis fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Capacity" radius={[4,4,0,0]}>
                  {slChartData.map((entry, i) => (
                    <Cell key={i} fill={DEPT_COLORS[entry.name] ?? DEPT_COLOR_FALLBACK} opacity={0.35} />
                  ))}
                  <LabelList dataKey="Capacity" position="top" formatter={(v: unknown) => `${Number(v).toFixed(1)}`} style={{ fontSize: 9, fill: 'var(--color-text-secondary)' }} />
                </Bar>
                <Bar dataKey="Forecast" radius={[4,4,0,0]}>
                  {slChartData.map((entry, i) => (
                    <Cell key={i} fill={DEPT_COLORS[entry.name] ?? DEPT_COLOR_FALLBACK} />
                  ))}
                  <LabelList dataKey="Forecast" position="top" formatter={(v: unknown) => `${Number(v).toFixed(1)}`} style={{ fontSize: 9, fill: 'var(--color-text)' }} />
                </Bar>
                <Bar dataKey="Actuals" radius={[4,4,0,0]}>
                  {slChartData.map((entry, i) => (
                    <Cell key={i} fill={DEPT_COLORS[entry.name] ?? DEPT_COLOR_FALLBACK} opacity={0.7} />
                  ))}
                  <LabelList dataKey="Actuals" position="top" formatter={(v: unknown) => `${Number(v).toFixed(1)}`} style={{ fontSize: 9, fill: 'var(--color-text)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, flex: 1 }}>FTE by Location</h3>
            <ChartInfoButton
              title="FTE by Location"
              lines={[
                { label: 'Capacity', desc: 'Number of active employees based in that location — each counts as 1 FTE.' },
                { label: 'Forecast', desc: 'Projected billable FTE for employees in that location based on their upcoming confirmed/proposed allocations.' },
              ]}
            />
          </div>
          {locChartData.length === 0 ? (
            <EmptyState>No location data</EmptyState>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={locChartData} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} />
                <YAxis fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Capacity" fill="#9E77ED" fillOpacity={0.4} radius={[4,4,0,0]}>
                  <LabelList dataKey="Capacity" position="top" formatter={(v: unknown) => `${Number(v).toFixed(1)}`} style={{ fontSize: 9, fill: 'var(--color-text-secondary)' }} />
                </Bar>
                <Bar dataKey="Forecast" fill="#44217A" radius={[4,4,0,0]}>
                  <LabelList dataKey="Forecast" position="top" formatter={(v: unknown) => `${Number(v).toFixed(1)}`} style={{ fontSize: 9, fill: 'var(--color-text)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </SectionGrid>

      {/* Charts row 2 — full-width utilization trend */}
      <ChartCard style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ margin: 0 }}>Monthly Utilization Trend</h3>
            {(deptFilter.length > 0 || subSLFilter.length > 0 || locationFilter.length > 0 || regionFilter.length > 0 || gradeFilter.length > 0) && (
              <span style={{ fontSize: 11, color: '#f59e0b', background: '#fff8e6', border: '1px solid #f59e0b44', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>
                ⚠ Showing org-wide trend (historical data is not per-filter)
              </span>
            )}
            <ChartInfoButton
              title="Monthly Utilization Trend"
              lines={[
                { label: 'Actuals %', desc: 'Historical chargeability % from uploaded timesheet data — what was actually billed each month.' },
                { label: 'Forecast %', desc: 'Projected utilization % for upcoming months based on current confirmed/proposed allocations (Forecast FTE ÷ Capacity × 100).' },
                { label: '80% line', desc: 'Target utilization threshold. Sustained values below this signal bench risk; above 100% indicates over-booking.' },
              ]}
            />
          </div>
          <ChartToggle>
            <ChartToggleBtn $active={trendChartType === 'line'} onClick={() => setTrendChartType('line')}>Line</ChartToggleBtn>
            <ChartToggleBtn $active={trendChartType === 'bar'}  onClick={() => setTrendChartType('bar')}>Bar</ChartToggleBtn>
          </ChartToggle>
        </div>
        {trendData.length === 0 ? (
          <EmptyState>No trend data available</EmptyState>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            {trendChartType === 'line' ? (
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} />
                <YAxis domain={[0, 100]} unit="%" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <Legend />
                <ReferenceLine y={80} stroke="var(--color-success)" strokeDasharray="4 4" />
                <Line type="monotone" dataKey="actual"   stroke="#44217A" name="Actuals %" strokeWidth={2} dot={{ r: 3 }} connectNulls={false}>
                  <LabelList dataKey="actual" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 9, fill: 'var(--color-text)' }} />
                </Line>
                <Line type="monotone" dataKey="forecast" stroke="#BD1C7D" name="Forecast %" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} connectNulls={false}>
                  <LabelList dataKey="forecast" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 9, fill: '#BD1C7D' }} />
                </Line>
              </LineChart>
            ) : (
              <BarChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="label" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} />
                <YAxis domain={[0, 100]} unit="%" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} />
                <Tooltip formatter={(v: any) => `${v}%`} />
                <Legend />
                <Bar dataKey="actual"   fill="#44217A" name="Actuals %" radius={[4,4,0,0]}>
                  <LabelList dataKey="actual" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 9, fill: 'var(--color-text)' }} />
                </Bar>
                <Bar dataKey="forecast" fill="#BD1C7D" name="Forecast %" radius={[4,4,0,0]}>
                  <LabelList dataKey="forecast" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 9, fill: '#BD1C7D' }} />
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* ── FTE Breakdown ───────────────────────────────────────────────────── */}
      <BreakdownCard>
        <BreakdownHeader>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <h3>FTE Breakdown</h3>
            <FteInfoButton />
            <span style={{ fontSize: 12, color: 'var(--color-primary)', marginLeft: 10 }}>
              • Sub-Service Line &amp; Location tabs
            </span>
          </div>
          <TabRow>
            <Tab $active={fteTab === 'sl'}       onClick={() => setFteTab('sl')}>By Service Line &amp; Sub-SL</Tab>
            <Tab $active={fteTab === 'location'}  onClick={() => setFteTab('location')}>By Location</Tab>
          </TabRow>
        </BreakdownHeader>

        {fteTab === 'sl' && (
          <>
            <BreakdownFilters>
              <MultiSelect options={allServiceLines} values={deptFilter} onChange={setDeptFilter} placeholder="All Service Lines" />
              <SelectFilter value={fteUtilFilter} onChange={e => setFteUtilFilter(e.target.value)}>
                <option value="all">All Utilization</option>
                <option value="over">Over-utilized (≥100%)</option>
                <option value="under">Under-utilized (&lt;75%)</option>
              </SelectFilter>
            </BreakdownFilters>
            <div style={{ overflowX: 'auto' }}>
              <BTable>
                <thead>
                  <tr>
                    <BTh>Service Line</BTh>
                    <BTh>Sub-Service Lines</BTh>
                    <BTh style={{ textAlign: 'right' }}>Capacity</BTh>
                    <BTh style={{ textAlign: 'right' }}>Forecast</BTh>
                    <BTh style={{ textAlign: 'right' }}>Actuals</BTh>
                    <BTh style={{ textAlign: 'right' }}>Variance</BTh>
                    <BTh style={{ textAlign: 'right' }}>Utilization</BTh>
                  </tr>
                </thead>
                <tbody>
                  {filteredFteSL.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-secondary)' }}>No data</td></tr>
                  ) : filteredFteSL.map(row => (
                    <tr key={row.serviceLine}>
                      <BTd><strong>{row.serviceLine}</strong></BTd>
                      <BTd>
                        {row.subServiceLines
                          ? row.subServiceLines.split(', ').map(s => <SubSLChip key={s}>{s}</SubSLChip>)
                          : '—'}
                      </BTd>
                      <BTd style={{ textAlign: 'right' }}>{row.capacity.toFixed(1)}</BTd>
                      <BTd style={{ textAlign: 'right' }}>{row.forecast.toFixed(1)}</BTd>
                      <BTd style={{ textAlign: 'right' }}>{row.actuals != null ? row.actuals.toFixed(1) : '—'}</BTd>
                      <BTd style={{ textAlign: 'right' }}>
                        <VarCell $val={row.variance}>{row.variance != null ? row.variance.toFixed(1) : '—'}</VarCell>
                      </BTd>
                      <BTd style={{ textAlign: 'right' }}>
                        <UtilBadge $pct={row.utilization}>{row.utilization.toFixed(1)}%</UtilBadge>
                      </BTd>
                    </tr>
                  ))}
                </tbody>
              </BTable>
            </div>
          </>
        )}

        {fteTab === 'location' && (
          <>
            <BreakdownFilters>
              <MultiSelect options={allLocations} values={locationFilter} onChange={setLocationFilter} placeholder="All Locations" />
            </BreakdownFilters>
            <div style={{ overflowX: 'auto' }}>
              <BTable>
                <thead>
                  <tr>
                    <BTh>Location</BTh>
                    <BTh style={{ textAlign: 'right' }}>Capacity</BTh>
                    <BTh style={{ textAlign: 'right' }}>Forecast</BTh>
                    <BTh style={{ textAlign: 'right' }}>Utilization</BTh>
                  </tr>
                </thead>
                <tbody>
                  {filteredFteLoc.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-secondary)' }}>No data</td></tr>
                  ) : filteredFteLoc.map(row => (
                    <tr key={row.location}>
                      <BTd><strong>{row.location}</strong></BTd>
                      <BTd style={{ textAlign: 'right' }}>{row.capacity.toFixed(1)}</BTd>
                      <BTd style={{ textAlign: 'right' }}>{row.forecast.toFixed(1)}</BTd>
                      <BTd style={{ textAlign: 'right' }}>
                        <UtilBadge $pct={row.utilization}>{row.utilization.toFixed(1)}%</UtilBadge>
                      </BTd>
                    </tr>
                  ))}
                </tbody>
              </BTable>
            </div>
          </>
        )}
      </BreakdownCard>

      {/* ── Weekly Forecast Drill-Down ──────────────────────────────────────── */}
      <ForecastGrid>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Role / Employee / Project — Weekly Forecast</h3>
          <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4, marginBottom: 0 }}>
            Expand rows to drill down from role → employee → project level
          </p>
        </div>

        {allFutureWeeks.length === 0 ? (
          <EmptyState>
            {summary ? 'No future allocations found for the selected filters.' : 'Loading…'}
          </EmptyState>
        ) : (
          <ForecastTable>
            <FTable>
              <thead>
                {/* Month header row */}
                <tr>
                  <FThMonth style={{ position: 'sticky', left: 0, background: 'var(--color-bg)', zIndex: 2, minWidth: 200, textAlign: 'left', padding: '8px 12px' }}>
                    Role
                  </FThMonth>
                  {weeksByMonth.map(({ monthKey, weeks }) => (
                    <FThMonth key={monthKey} colSpan={weeks.length}>{monthKey}</FThMonth>
                  ))}
                </tr>
                {/* Week day-range header row */}
                <tr>
                  <FTh style={{ position: 'sticky', left: 0, background: 'var(--color-bg)', zIndex: 2 }} />
                  {allFutureWeeks.map(w => (
                    <FTh key={w}>{weekColHeader(w).dayRange}</FTh>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roleGroups.map(([role, empRows]) => {
                  const roleExpanded = expandedRoles.has(role)
                  const color = roleColor(role)
                  const initials = role.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
                  const weekAvgs = roleWeekAgg.get(role) ?? new Map()

                  return (
                    <React.Fragment key={role}>
                      {/* Role row */}
                      <tr>
                        <FTdLabel $level={0}>
                          <ExpandBtn onClick={() => toggleRole(role)}>
                            {roleExpanded ? '▾' : '▸'}
                          </ExpandBtn>
                          <RoleBadge $color={color}>{initials}</RoleBadge>
                          {role}
                        </FTdLabel>
                        {allFutureWeeks.map(w => {
                          const pct = weekAvgs.get(w) ?? null
                          return (
                            <FTdValue key={w} $pct={pct}>
                              {pct !== null && pct > 0 ? `${pct.toFixed(2)}%` : '—'}
                            </FTdValue>
                          )
                        })}
                      </tr>

                      {/* Employee rows (if role expanded) */}
                      {roleExpanded && empRows.map(emp => {
                        const empExpanded = expandedEmps.has(emp.empCode)
                        const hasProjects = Object.values(emp.weeks).some(w => w.projects.length > 0)

                        return (
                          <React.Fragment key={emp.empCode}>
                            <tr>
                              <FTdLabel $level={1} style={{ fontWeight: 400 }}>
                                {hasProjects && (
                                  <ExpandBtn onClick={() => toggleEmp(emp.empCode)}>
                                    {empExpanded ? '▾' : '▸'}
                                  </ExpandBtn>
                                )}
                                {!hasProjects && <span style={{ display: 'inline-block', width: 18 }} />}
                                {emp.name}
                              </FTdLabel>
                              {allFutureWeeks.map(w => {
                                const wd = emp.weeks[w]
                                const pct = wd ? wd.totalPct : null
                                return (
                                  <FTdValue key={w} $pct={pct}>
                                    {pct !== null && pct > 0 ? `${pct}%` : '—'}
                                  </FTdValue>
                                )
                              })}
                            </tr>

                            {/* Project rows (if employee expanded) */}
                            {empExpanded && allFutureWeeks.map(w => {
                              const wd = emp.weeks[w]
                              return wd?.projects ?? []
                            }).flat().length === 0 ? null : (
                              empExpanded && (
                                <>
                                  {/* Collect all unique project names for this employee across all visible weeks */}
                                  {Array.from(
                                    new Set(
                                      allFutureWeeks.flatMap(w =>
                                        (emp.weeks[w]?.projects ?? []).map(p => p.name ?? '(status)')
                                      )
                                    )
                                  ).map(projName => (
                                    <tr key={`${emp.empCode}-${projName}`}>
                                      <FTdLabel $level={2} style={{ fontWeight: 400, color: 'var(--color-text-secondary)', fontSize: 11 }}>
                                        <span style={{ display: 'inline-block', width: 18 }} />
                                        {projName}
                                      </FTdLabel>
                                      {allFutureWeeks.map(w => {
                                        const proj = (emp.weeks[w]?.projects ?? []).find(p => (p.name ?? '(status)') === projName)
                                        return (
                                          <FTdValue key={w} $pct={proj ? proj.pct : null}>
                                            {proj && proj.pct > 0 ? `${proj.pct}%` : '—'}
                                          </FTdValue>
                                        )
                                      })}
                                    </tr>
                                  ))}
                                </>
                              )
                            )}
                          </React.Fragment>
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </FTable>
          </ForecastTable>
        )}
      </ForecastGrid>

      {/* ── Employee Details ──────────────────────────────────────────────── */}
      <BreakdownCard>
        <BreakdownHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ color: '#4E2C79' }}>Employee Details</h3>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>({filteredWeeklyRows.length} resources in current filter)</span>
          </div>
        </BreakdownHeader>
        <div style={{ overflowX: 'auto' }}>
          <BTable>
            <thead>
              <tr>
                <BTh>Name</BTh>
                <BTh>Emp ID</BTh>
                <BTh>Service Line</BTh>
                <BTh>Sub-SL</BTh>
                <BTh>Designation</BTh>
                <BTh>Location</BTh>
                <BTh>Region</BTh>
                <BTh style={{ textAlign: 'right' }}>Upcoming Weeks</BTh>
                <BTh style={{ textAlign: 'right' }}>Max Alloc %</BTh>
              </tr>
            </thead>
            <tbody>
              {filteredWeeklyRows.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-secondary)' }}>No employees match current filters</td></tr>
              ) : (
                filteredWeeklyRows.map(r => {
                  const weekPcts = Object.values(r.weeks).map(w => w.totalPct)
                  const maxPct = weekPcts.length > 0 ? Math.max(...weekPcts) : 0
                  const allocColor = maxPct > 100 ? '#c0392b' : maxPct >= 75 ? '#27ae60' : maxPct > 0 ? '#f39c12' : '#888'
                  return (
                    <tr key={r.empCode} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <BTd style={{ fontWeight: 600, color: '#4E2C79' }}>{r.name}</BTd>
                      <BTd style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--color-text-secondary)' }}>{r.empCode}</BTd>
                      <BTd>{r.serviceLine || '—'}</BTd>
                      <BTd style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{r.subServiceLine || '—'}</BTd>
                      <BTd style={{ fontSize: 12 }}>{r.designation || '—'}</BTd>
                      <BTd style={{ fontSize: 12 }}>{r.location || '—'}</BTd>
                      <BTd style={{ fontSize: 12 }}>{r.region || '—'}</BTd>
                      <BTd style={{ textAlign: 'right' }}>{weekPcts.length}</BTd>
                      <BTd style={{ textAlign: 'right', fontWeight: 700, color: allocColor }}>{maxPct > 0 ? `${maxPct}%` : '—'}</BTd>
                    </tr>
                  )
                })
              )}
            </tbody>
          </BTable>
        </div>
      </BreakdownCard>

      {/* ── Underlying Forecast Data ──────────────────────────────────────── */}
      <BreakdownCard style={{ marginBottom: 32 }}>
        <BreakdownHeader>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <h3 style={{ color: '#4E2C79' }}>FTE Underlying Data</h3>
            <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>Capacity, Forecast &amp; Actuals by Service Line</span>
          </div>
        </BreakdownHeader>
        <div style={{ overflowX: 'auto' }}>
          <BTable>
            <thead>
              <tr>
                <BTh>Service Line</BTh>
                <BTh style={{ textAlign: 'right' }}>Capacity</BTh>
                <BTh style={{ textAlign: 'right' }}>Forecast FTE</BTh>
                <BTh style={{ textAlign: 'right' }}>Actuals FTE</BTh>
                <BTh style={{ textAlign: 'right' }}>Variance</BTh>
                <BTh style={{ textAlign: 'right' }}>Utilization %</BTh>
              </tr>
            </thead>
            <tbody>
              {filteredFteSL.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-secondary)' }}>No data for current filters</td></tr>
              ) : (
                filteredFteSL.map(r => {
                  const utilColor = r.utilization >= 100 ? '#27ae60' : r.utilization >= 75 ? 'var(--color-text)' : r.utilization >= 60 ? '#f59e0b' : '#c0392b'
                  return (
                    <tr key={r.serviceLine} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <BTd style={{ fontWeight: 600, color: '#4E2C79' }}>{r.serviceLine}</BTd>
                      <BTd style={{ textAlign: 'right' }}>{r.capacity}</BTd>
                      <BTd style={{ textAlign: 'right', fontWeight: 600 }}>{r.forecast.toFixed(1)}</BTd>
                      <BTd style={{ textAlign: 'right', color: 'var(--color-text-secondary)' }}>{r.actuals != null ? r.actuals.toFixed(1) : '—'}</BTd>
                      <BTd style={{ textAlign: 'right', color: (r.variance ?? 0) < 0 ? '#c0392b' : 'var(--color-text-secondary)', fontWeight: 500 }}>
                        {r.variance != null ? (r.variance > 0 ? `+${r.variance.toFixed(1)}` : r.variance.toFixed(1)) : '—'}
                      </BTd>
                      <BTd style={{ textAlign: 'right', fontWeight: 700, color: utilColor }}>{r.utilization.toFixed(1)}%</BTd>
                    </tr>
                  )
                })
              )}
              {filteredFteSL.length > 0 && (
                <tr style={{ background: '#f9f7ff', fontWeight: 700 }}>
                  <BTd style={{ color: '#4E2C79' }}>Total</BTd>
                  <BTd style={{ textAlign: 'right' }}>{filteredFteSL.reduce((s, r) => s + r.capacity, 0)}</BTd>
                  <BTd style={{ textAlign: 'right' }}>{filteredFteSL.reduce((s, r) => s + r.forecast, 0).toFixed(1)}</BTd>
                  <BTd style={{ textAlign: 'right' }}>{filteredFteSL.some(r => r.actuals !== null) ? filteredFteSL.reduce((s, r) => s + (r.actuals ?? 0), 0).toFixed(1) : '—'}</BTd>
                  <BTd style={{ textAlign: 'right' }} />
                  <BTd style={{ textAlign: 'right', color: '#4E2C79' }}>{kpi.utilization.toFixed(1)}%</BTd>
                </tr>
              )}
            </tbody>
          </BTable>
        </div>
      </BreakdownCard>
    </div>
  )
}
