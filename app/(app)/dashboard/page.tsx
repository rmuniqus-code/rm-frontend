'use client'

import React, { useState, useMemo, useEffect } from 'react'
import styled from 'styled-components'
import StatCard from '@/components/shared/stat-card'
import ToggleView from '@/components/shared/toggle-view'
import Modal, { Section, SectionTitle, DetailGrid, DetailItem } from '@/components/shared/modal'
import {
  capacityByServiceLine,
  capacityByLocation,
  utilizationByMonth,
  forecastMonths,
  forecastByRole,
} from '@/data/mock-data'
import type { ForecastEntry } from '@/data/mock-data'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line, LabelList,
} from 'recharts'

// Colour palette for multi-line yearly trend charts (one colour per series)
const TREND_COLORS = [
  'var(--color-primary)',
  'var(--color-accent-magenta)',
  '#22c55e', '#f59e0b', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6', '#f97316', '#64748b',
]
import { Upload, Download, MapPin, Shield, TrendingUp, TrendingDown, RefreshCw, Trash2, Calendar, ChevronRight, ChevronDown } from 'lucide-react'
import { useRole } from '@/components/shared/role-context'
import DataTable from '@/components/shared/data-table'
import type { DataTableColumn } from '@/components/shared/data-table'
import MultiSelect from '@/components/shared/multi-select'
import { useToast } from '@/components/shared/toast'
import ImportModal from '@/components/dashboard/import-modal'
import OutliersWidget from '@/components/dashboard/outliers-widget'
import { useDashboardData } from '@/hooks/use-dashboard-data'
import type { TimesheetGapRow, TimesheetGapByTeamRow, DashboardKPI, EmployeeRow, OverAllocResource, SubTeamTrendRow } from '@/hooks/use-dashboard-data'
import { apiRaw } from '@/lib/api'
import { PageLoader } from '@/components/shared/page-loader'

const PageHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 12px;
`

const PageTitleArea = styled.div`
  h1 {
    font-size: 24px;
    font-weight: 700;
    color: var(--color-text);
  }

  p {
    font-size: 14px;
    color: var(--color-text-secondary);
    margin-top: 4px;
  }
`

const HeaderActions = styled.div`
  display: flex;
  gap: 8px;
`

const ActionBtn = styled.button`
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

const KpiGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
`

const ControlsRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 12px;
`

const FilterGroup = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const FilterLabel = styled.span`
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
`

const FilterSelect = styled.select`
  padding: 6px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg-card);
  color: var(--color-text);
  font-size: 12px;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`

const TabBar = styled.div`
  display: flex;
  gap: 0;
  border-bottom: 2px solid var(--color-border);
  margin-bottom: 24px;
  overflow-x: auto;
`

const Tab = styled.button<{ $active: boolean }>`
  padding: 10px 20px;
  font-size: 13px;
  font-weight: ${(p: { $active: boolean }) => p.$active ? 600 : 400};
  color: ${(p: { $active: boolean }) => p.$active ? 'var(--color-primary)' : 'var(--color-text-secondary)'};
  border-bottom: 2px solid ${(p: { $active: boolean }) => p.$active ? 'var(--color-primary)' : 'transparent'};
  margin-bottom: -2px;
  white-space: nowrap;
  transition: all var(--transition-fast);
  &:hover { color: var(--color-primary); }
`

const SectionGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 24px;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`

const TrendIcon = styled.span<{ $direction: string }>`
  display: inline-flex;
  align-items: center;
  color: ${(p: { $direction: string }) => p.$direction === 'up' ? 'var(--color-trend-up)' : 'var(--color-trend-down)'};
`

const StatusDot = styled.span<{ $color: string }>`
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${(p: { $color: string }) => p.$color};
  margin-right: 6px;
`

const FilterRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  align-items: center;
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
  color: ${(p: { $active: boolean }) => p.$active ? '#fff' : 'var(--color-text-secondary)'};
  background: ${(p: { $active: boolean }) => p.$active ? 'var(--color-primary)' : 'transparent'};
  transition: all var(--transition-fast);
  &:hover { background: ${(p: { $active: boolean }) => p.$active ? 'var(--color-primary-hover)' : 'var(--color-border-light)'}; }
`

const TimesheetViewRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
`

const TimesheetSummary = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  margin-bottom: 16px;
`

const SummaryStat = styled.div`
  padding: 12px 16px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  h4 { font-size: 11px; font-weight: 600; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  span { font-size: 20px; font-weight: 700; color: var(--color-danger); }
`

const InsightCards = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
  margin-top: 20px;
`

const InsightCard = styled.div`
  padding: 16px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  border-left: 3px solid var(--color-primary);
  h4 { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
  p { font-size: 12px; color: var(--color-text-secondary); }
`

const DASHBOARD_TABS = ['Overview', 'Chargeability', 'Compliance', 'Missed Timesheet', 'Resource Allocation', 'Employee Details'] as const

const PeriodSelectorRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding: 10px 16px;
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
`

const PeriodSelect = styled.select`
  padding: 5px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: var(--color-bg-card);
  color: var(--color-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
`

const SubTeamRow = styled.tr`
  background: var(--color-bg);
  td { font-size: 12px; color: var(--color-text-secondary); }
`

const SHORT_MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
}

/** Parses both "Mar-2026" (DB format) and "YYYY-MM" into { monthIdx, year } */
function parsePeriod(period: string): { monthIdx: number; year: number } | null {
  const parts = period.split('-')
  if (parts.length < 2) return null
  if (/^\d{4}$/.test(parts[0])) {
    // YYYY-MM
    return { year: parseInt(parts[0]), monthIdx: parseInt(parts[1]) - 1 }
  }
  // Mon-YYYY  (e.g. Mar-2026)
  const cap = parts[0].charAt(0).toUpperCase() + parts[0].slice(1, 3).toLowerCase()
  const monthIdx = SHORT_MONTHS[cap]
  if (monthIdx === undefined) return null
  return { year: parseInt(parts[1]), monthIdx }
}

function formatPeriodLabel(period: string): string {
  const p = parsePeriod(period)
  if (!p) return period
  const monthName = new Date(p.year, p.monthIdx).toLocaleString('default', { month: 'long' })
  return `${monthName} ${p.year}`
}

const RoleBanner = styled.div<{ $role: string }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  margin-bottom: 16px;
  border-radius: var(--border-radius);
  font-size: 13px;
  font-weight: 500;
  background: ${p =>
    p.$role === 'rm' ? 'var(--color-primary-light)' :
    p.$role === 'employee' ? '#fef3c7' :
    '#e0e7ff'};
  color: ${p =>
    p.$role === 'rm' ? 'var(--color-primary-dark)' :
    p.$role === 'employee' ? '#92400e' :
    '#3730a3'};
  border: 1px solid ${p =>
    p.$role === 'rm' ? 'var(--color-primary)' :
    p.$role === 'employee' ? '#f59e0b' :
    '#6366f1'};
`

const ChartGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 24px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const ChartCard = styled.div<{ $clickable?: boolean }>`
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  padding: 20px;
  box-shadow: var(--shadow-sm);
  cursor: ${p => p.$clickable ? 'pointer' : 'default'};
  transition: all var(--transition-fast);

  ${p => p.$clickable && `
    &:hover {
      box-shadow: var(--shadow-md);
      border-color: var(--color-primary);
    }
  `}

  h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-text);
    margin-bottom: 16px;
  }
`

const ForecastSection = styled.div`
  margin-top: 24px;
`

const ForecastGrid = styled.div`
  background: var(--color-bg-card);
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius-lg);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
`

const ForecastTable = styled.div`
  overflow-x: auto;
`

const FTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
`

const FTh = styled.th`
  padding: 8px 12px;
  text-align: center;
  font-weight: 600;
  color: var(--color-text-secondary);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  white-space: nowrap;
  font-size: 11px;
`

const FThMonth = styled.th`
  padding: 6px 12px;
  text-align: center;
  font-weight: 700;
  color: var(--color-text);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
`

const FTd = styled.td<{ $level: number }>`
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border-light);
  white-space: nowrap;
  padding-left: ${p => 12 + p.$level * 20}px;
`

const FTdValue = styled.td<{ $value: number | null }>`
  padding: 8px 12px;
  text-align: center;
  border-bottom: 1px solid var(--color-border-light);
  font-weight: 500;
  color: ${p =>
    p.$value === null ? 'var(--color-text-muted)' :
    p.$value > 50 ? 'var(--color-danger)' :
    p.$value > 30 ? 'var(--color-success)' :
    'var(--color-text-muted)'
  };
`

const RoleBadge = styled.span<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: ${p => p.$color};
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  margin-right: 8px;
`

const ExpandBtn = styled.button`
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
  color: var(--color-text-secondary);
  font-size: 12px;

  &:hover { color: var(--color-text); }
`

const ModalTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  th {
    text-align: left;
    padding: 8px 12px;
    font-weight: 600;
    font-size: 11px;
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg);
  }

  td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--color-border-light);
  }

  tr:last-child td {
    border-bottom: none;
  }
`

type ModalType = null | 'kpi' | 'service-line' | 'location' | 'utilization'

interface KpiModalInfo {
  title: string
  value: string | number
}

export default function DashboardPage() {
  const { addToast } = useToast()
  const [activeTab, setActiveTab] = useState<typeof DASHBOARD_TABS[number]>('Overview')
  const [timeView, setTimeView] = useState('Weekly')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandedModalSL, setExpandedModalSL] = useState<Set<string>>(new Set())
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null)
  const [modalType, setModalType] = useState<ModalType>(null)
  const [kpiModal, setKpiModal] = useState<KpiModalInfo | null>(null)
  const [chartType, setChartType] = useState<'bar' | 'line'>('bar')
  const [timesheetView, setTimesheetView] = useState<'W' | '4W' | 'M'>('W')
  const [timeRange, setTimeRange] = useState('6m')
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeRow | null>(null)
  const [expandedMissedSL, setExpandedMissedSL] = useState<Set<string>>(new Set())
  const { role: roleView, roleLabel } = useRole()
  const [importOpen, setImportOpen] = useState(false)
  // ── Global filters (apply to ALL tabs) ──
  const [globalSL, setGlobalSL] = useState<string[]>([])
  const [globalSubSL, setGlobalSubSL] = useState<string[]>([])
  const [globalRegion, setGlobalRegion] = useState<string[]>([])
  const [globalLocation, setGlobalLocation] = useState<string[]>([])
  const [globalGrade, setGlobalGrade] = useState<string[]>([])
  // Per-tab chart type toggles
  const [chargeChartType, setChargeChartType] = useState<'bar' | 'line'>('bar')
  const [compChartType, setCompChartType] = useState<'bar' | 'line'>('bar')
  // Per-tab drilldown state
  const [chargeDrilldown, setChargeDrilldown] = useState<string | null>(null)
  const [compDrilldown, setCompDrilldown] = useState<string | null>(null)
  // Per-tab view mode: 'summary' (aggregated) | 'trend' (yearly line) | 'employee' (individual rows)
  const [chargeViewMode, setChargeViewMode] = useState<'summary' | 'trend' | 'employee'>('summary')
  const [compViewMode, setCompViewMode] = useState<'summary' | 'trend' | 'employee'>('summary')
  const [missedViewMode, setMissedViewMode] = useState<'summary' | 'employee'>('summary')
  const [allocViewMode, setAllocViewMode] = useState<'summary' | 'employee'>('summary')
  const { data: liveData, loading: liveLoading, hasLiveData, refresh: refreshLive } = useDashboardData(selectedPeriod ?? undefined)

  // ── Data source: live data only — no mock fallback ──
  const kpiData: DashboardKPI = (liveData.kpi ?? {
    totalCapacity: 0, forecastedFte: 0, utilization: 0, utilizationYtd: 0, avgCompliance: 0,
    benchCount: 0, timesheetGapCount: 0, overAllocated: 0, variance: 0,
    activeResources: 0, servingNotice: null, contract: null, exited: 0,
  }) as DashboardKPI
  const chargeabilityData = liveData.chargeability
  const chargeabilitySubData = liveData.chargeabilityBySubTeam
  const complianceData = liveData.compliance
  const complianceSubData = liveData.complianceBySubTeam
  const chargeabilityByRegion = liveData.chargeabilityByRegion
  const complianceByRegion = liveData.complianceByRegion
  const chargeabilityTrendByDept = liveData.chargeabilityTrendByDept
  const chargeabilityTrendBySubTeam = liveData.chargeabilityTrendBySubTeam
  const complianceTrendByDept = liveData.complianceTrendByDept
  const complianceTrendBySubTeam = liveData.complianceTrendBySubTeam
  const timesheetNotFilledData: TimesheetGapRow[] = liveData.timesheetGaps as TimesheetGapRow[]
  const timesheetGapsByTeam = liveData.timesheetGapsByTeam
  const arcAllTeamsData = liveData.allocation
  const employeeDetailData = liveData.employees

  // Chart data — live with mock fallback
  const capacityByServiceLineData = hasLiveData && liveData.capacityByServiceLine.length > 0
    ? liveData.capacityByServiceLine.map(r => ({ serviceLine: r.serviceLine!, capacity: r.capacity, forecast: r.forecast, actual: r.actual, subServiceLines: r.subServiceLines ?? [] }))
    : capacityByServiceLine
  const capacityByLocationData = hasLiveData && liveData.capacityByLocation.length > 0
    ? liveData.capacityByLocation.map(r => ({ location: r.location!, capacity: r.capacity, forecast: r.forecast, actual: r.actual }))
    : capacityByLocation
  const utilizationData = hasLiveData && liveData.utilizationTrend.length > 0
    ? liveData.utilizationTrend.map(r => ({ month: r.week, forecast: r.forecast, actual: r.actual }))
    : utilizationByMonth
  const liveOverAllocList = hasLiveData ? liveData.overAllocList : []

  const handleImportComplete = () => {
    addToast('Data imported successfully — refreshing dashboard…', 'success')
    // Reset to Latest so the newly uploaded period is shown
    setSelectedPeriod(null)
  }

  const allWeeks = forecastMonths.flatMap(m => m.weeks.map(w => ({ month: m.month, week: w })))

  const subServiceLines = useMemo(() =>
    Array.from(new Set(employeeDetailData.map(e => e.subFunction).filter(Boolean))).filter(s => s !== 'LT').sort(),
    [employeeDetailData]
  )

  const empLocations = useMemo(() =>
    Array.from(new Set(employeeDetailData.map(e => e.location).filter(Boolean))).sort(),
    [employeeDetailData]
  )

  const empRegions = useMemo(() =>
    Array.from(new Set(employeeDetailData.map(e => e.region).filter(Boolean))).sort(),
    [employeeDetailData]
  )

  const grades = useMemo(() =>
    Array.from(new Set(employeeDetailData.map(e => e.designation).filter(Boolean))).sort(),
    [employeeDetailData]
  )

  const serviceLines = useMemo(() =>
    Array.from(new Set(chargeabilityData.map(d => d.department).filter(Boolean))).filter(d => d !== 'Central').sort(),
    [chargeabilityData]
  )

  // Region → locations cascade map derived from live employee data
  const dashRegionToLocations = useMemo(() => {
    const map = new Map<string, Set<string>>()
    employeeDetailData.forEach(e => {
      if (!e.region || !e.location) return
      if (!map.has(e.region)) map.set(e.region, new Set())
      map.get(e.region)!.add(e.location)
    })
    return map
  }, [employeeDetailData])

  const dashAllRegions = empRegions

  // Service Line → Sub-Service Line cascade map
  const deptToSubFunctions = useMemo(() => {
    const map = new Map<string, Set<string>>()
    employeeDetailData.forEach(e => {
      if (!e.department || !e.subFunction) return
      if (!map.has(e.department)) map.set(e.department, new Set())
      map.get(e.department)!.add(e.subFunction)
    })
    return map
  }, [employeeDetailData])

  // ── Global cascade: sub-SLs available given selected service lines ──
  const filteredGlobalSubSLs = useMemo(() => {
    if (globalSL.length === 0) return subServiceLines
    const inDepts = new Set(globalSL.flatMap(d => [...(deptToSubFunctions.get(d) ?? [])]))
    return subServiceLines.filter(s => inDepts.has(s))
  }, [globalSL, subServiceLines, deptToSubFunctions])

  // ── Global cascade: locations available given selected regions ──
  const filteredGlobalLocations = useMemo(() => {
    if (globalRegion.length === 0) return empLocations
    const inRegions = new Set(globalRegion.flatMap(r => [...(dashRegionToLocations.get(r) ?? [])]))
    return empLocations.filter(l => inRegions.has(l))
  }, [globalRegion, empLocations, dashRegionToLocations])

  // Reset cascaded selections when parent filter changes
  useEffect(() => {
    setGlobalSubSL(prev => prev.filter(s => filteredGlobalSubSLs.includes(s)))
  }, [filteredGlobalSubSLs])

  useEffect(() => {
    setGlobalLocation(prev => prev.filter(l => filteredGlobalLocations.includes(l)))
  }, [filteredGlobalLocations])

  // ── Departments matching global location/region/grade/subSL filters ──
  // Used to further narrow chargeability and compliance data beyond service line selection.
  const globalFilteredDepts = useMemo(() => {
    if (globalLocation.length === 0 && globalRegion.length === 0 && globalGrade.length === 0 && globalSubSL.length === 0) return null
    const matched = employeeDetailData.filter(e => {
      if (globalLocation.length > 0 && !globalLocation.includes(e.location)) return false
      if (globalRegion.length > 0 && !globalRegion.includes(e.region)) return false
      if (globalGrade.length > 0 && !globalGrade.includes(e.designation)) return false
      if (globalSubSL.length > 0 && !globalSubSL.includes(e.subFunction)) return false
      return true
    })
    return new Set(matched.map(e => e.department).filter(Boolean))
  }, [globalLocation, globalRegion, globalGrade, globalSubSL, employeeDetailData])

  // Filtered missed timesheet data based on global filters
  const filteredTimesheetGaps = useMemo(() => {
    let data = timesheetNotFilledData
    if (globalSL.length > 0) data = data.filter(r => globalSL.includes(r.department))
    if (globalSubSL.length > 0) data = data.filter(r => globalSubSL.includes(r.subTeam))
    if (globalLocation.length > 0) data = data.filter(r => globalLocation.includes(r.location))
    return data
  }, [timesheetNotFilledData, globalSL, globalSubSL, globalLocation])

  // Filtered timesheetGapsByTeam based on global filters
  const filteredTimesheetGapsByTeam = useMemo(() => {
    if (globalSL.length === 0 && globalSubSL.length === 0 && globalLocation.length === 0) {
      return timesheetGapsByTeam
    }
    return timesheetGapsByTeam
      .filter(row => globalSL.length === 0 || globalSL.includes(row.department))
      .map(row => ({
        ...row,
        subTeams: row.subTeams.filter(st =>
          globalSubSL.length === 0 || globalSubSL.includes(st.subTeam)
        ),
        count: globalSubSL.length === 0
          ? row.count
          : row.subTeams.filter(st => globalSubSL.includes(st.subTeam)).reduce((s, st) => s + st.count, 0),
      }))
      .filter(row => row.count > 0)
  }, [timesheetGapsByTeam, globalSL, globalSubSL, globalLocation])

  const filteredCapacityByLocation = useMemo(() => {
    if (globalLocation.length === 0) return capacityByLocationData
    return capacityByLocationData.filter(l => globalLocation.includes(l.location))
  }, [globalLocation, capacityByLocationData])

  // Over-allocated & bench lists — live data when available
  const overAllocatedResources = useMemo(() => liveOverAllocList, [liveOverAllocList])

  const benchResources = useMemo(() => [] as OverAllocResource[], [])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleModalSL = (id: string) => {
    setExpandedModalSL(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openKpiModal = (title: string, value: string | number) => {
    setExpandedModalSL(new Set())
    setKpiModal({ title, value })
    setModalType('kpi')
  }

  const renderForecastRows = (entries: ForecastEntry[], level: number): React.ReactNode[] => {
    return entries.flatMap(entry => {
      const isExpanded = expanded.has(entry.id)
      const hasChildren = entry.children && entry.children.length > 0

      return [
        <tr key={entry.id}>
          <FTd $level={level} style={{ position: 'sticky', left: 0, background: 'var(--color-bg-card)', zIndex: 1, minWidth: 200 }}>
            {hasChildren && (
              <ExpandBtn onClick={() => toggleExpand(entry.id)}>
                {isExpanded ? '▾' : '▸'}
              </ExpandBtn>
            )}
            <RoleBadge $color={entry.color}>{entry.shortCode}</RoleBadge>
            {entry.name}
          </FTd>
          {allWeeks.map(({ month, week }) => {
            const key = `${month}|${week}`
            const val = entry.weeklyUtilization[key]
            return (
              <FTdValue key={key} $value={val ?? null}>
                {val !== null && val !== undefined ? `${val.toFixed(1)}%` : '—'}
              </FTdValue>
            )
          })}
        </tr>,
        ...(isExpanded && hasChildren ? renderForecastRows(entry.children!, level + 1) : []),
      ]
    })
  }

  // (overAllocatedResources & benchResources defined above via useMemo)

  // ── Forecasting data used in sub-tabs ──
  const currentPeriodLabel = useMemo(() => {
    const p = liveData.currentPeriod
    if (!p) return 'Current'
    const parsed = parsePeriod(p)
    if (!parsed) return p
    return new Date(parsed.year, parsed.monthIdx).toLocaleString('default', { month: 'long' })
  }, [liveData.currentPeriod])

  const previousPeriodLabel = useMemo(() => {
    const p = liveData.currentPeriod
    if (!p) return 'Previous'
    const parsed = parsePeriod(p)
    if (!parsed) return 'Previous'
    const prev = new Date(parsed.year, parsed.monthIdx - 1)
    return prev.toLocaleString('default', { month: 'long' })
  }, [liveData.currentPeriod])

  const chargeabilityCols: DataTableColumn<typeof chargeabilityData[0]>[] = [
    { key: 'department', header: 'Service Line', render: (row) => <span style={{ fontWeight: 500 }}>{row.department}</span> },
    { key: 'headcount', header: 'Headcount', align: 'center', render: (row) => <span>{row.headcount ?? '—'}</span> },
    { key: 'current', header: `MTD ${currentPeriodLabel}`, align: 'center', render: (row) => <span style={{ fontWeight: 600 }}>{row.current}%</span> },
    { key: 'previous', header: `MTD ${previousPeriodLabel}`, align: 'center', render: (row) => <span style={{ color: 'var(--color-text-secondary)' }}>{row.previous}%</span> },
    { key: 'trend', header: 'Trend', align: 'center', render: (row) => (
      <TrendIcon $direction={row.current >= row.previous ? 'up' : 'down'}>
        {row.current >= row.previous ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
      </TrendIcon>
    )},
  ]

  const chargeabilitySubTeamCols: DataTableColumn<typeof chargeabilitySubData[0]>[] = [
    { key: 'department', header: 'Service Line', render: (row) => <span style={{ fontWeight: 500 }}>{row.department}</span> },
    { key: 'subTeam', header: 'Sub-Team' },
    { key: 'headcount', header: 'Headcount', align: 'center', render: (row) => <span>{row.headcount ?? '—'}</span> },
    { key: 'current', header: `MTD ${currentPeriodLabel}`, align: 'center', render: (row) => <span style={{ fontWeight: 600 }}>{row.current}%</span> },
    { key: 'previous', header: `MTD ${previousPeriodLabel}`, align: 'center', render: (row) => <span style={{ color: 'var(--color-text-secondary)' }}>{row.previous}%</span> },
    { key: 'trend', header: 'Trend', align: 'center', render: (row) => (
      <TrendIcon $direction={row.current >= row.previous ? 'up' : 'down'}>
        {row.current >= row.previous ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
      </TrendIcon>
    )},
  ]

  const complianceCols: DataTableColumn<typeof complianceData[0]>[] = [
    { key: 'department', header: 'Service Line', render: (row) => <span style={{ fontWeight: 500 }}>{row.department}</span> },
    { key: 'headcount', header: 'Headcount', align: 'center', render: (row) => <span>{row.headcount ?? '—'}</span> },
    { key: 'current', header: `MTD ${currentPeriodLabel}`, align: 'center', render: (row) => <span style={{ fontWeight: 600 }}>{row.current}%</span> },
    { key: 'previous', header: `MTD ${previousPeriodLabel}`, align: 'center', render: (row) => <span>{row.previous}%</span> },
  ]

  const complianceSubTeamCols: DataTableColumn<typeof complianceSubData[0]>[] = [
    { key: 'department', header: 'Service Line', render: (row) => <span style={{ fontWeight: 500 }}>{row.department}</span> },
    { key: 'subTeam', header: 'Sub-Team' },
    { key: 'headcount', header: 'Headcount', align: 'center', render: (row) => <span>{row.headcount ?? '—'}</span> },
    { key: 'current', header: `MTD ${currentPeriodLabel}`, align: 'center', render: (row) => <span style={{ fontWeight: 600 }}>{row.current}%</span> },
    { key: 'previous', header: `MTD ${previousPeriodLabel}`, align: 'center', render: (row) => <span>{row.previous}%</span> },
  ]

  const timesheetCols: DataTableColumn<typeof timesheetNotFilledData[0]>[] = [
    { key: 'name', header: 'Employee Name', render: (row) => <span style={{ fontWeight: 600 }}>{row.name || '—'}</span> },
    { key: 'department', header: 'Service Line' },
    { key: 'subTeam', header: 'Sub-Team', render: (row) => <span>{row.subTeam || '—'}</span> },
    { key: 'designation', header: 'Designation' },
    { key: 'location', header: 'Location', render: (row) => <span>{row.location || '—'}</span> },
    { key: 'period', header: 'Period' },
    { key: 'compliancePct', header: 'Compliance %', align: 'center', render: (row) => <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>{row.compliancePct ?? 0}%</span> },
  ]

  const allocCols: DataTableColumn<typeof arcAllTeamsData[0]>[] = [
    { key: 'location', header: 'Location', render: (row) => <span style={{ fontWeight: 500 }}>{row.location}</span> },
    { key: 'region', header: 'Region' },
    { key: 'analyst', header: 'Analyst', align: 'center', render: (row) => <span>{row.analyst ?? '—'}</span> },
    { key: 'assocConsultant', header: 'Assoc. Consultant', align: 'center', render: (row) => <span>{row.assocConsultant ?? '—'}</span> },
    { key: 'consultant', header: 'Consultant', align: 'center', render: (row) => <span>{row.consultant ?? '—'}</span> },
    { key: 'asstManager', header: 'Asst. Manager', align: 'center', render: (row) => <span>{row.asstManager ?? '—'}</span> },
    { key: 'manager', header: 'Manager', align: 'center', render: (row) => <span>{row.manager ?? '—'}</span> },
    { key: 'assocDirector', header: 'Assoc. Director', align: 'center', render: (row) => <span>{row.assocDirector ?? '—'}</span> },
    { key: 'total', header: 'Total', align: 'center', render: (row) => <span style={{ fontWeight: 700 }}>{row.total}</span> },
  ]

  const empCols: DataTableColumn<typeof employeeDetailData[0]>[] = [
    { key: 'department', header: 'Dept' },
    { key: 'subFunction', header: 'Sub-Function' },
    { key: 'empId', header: 'Emp ID', render: (row) => <span style={{ fontFamily: 'monospace' }}>{row.empId}</span> },
    { key: 'name', header: 'Name', render: (row) => (
      <span><StatusDot $color={row.status === 'green' ? 'var(--color-success)' : 'var(--color-danger)'} />{row.name}</span>
    )},
    { key: 'designation', header: 'Designation' },
    { key: 'location', header: 'Location' },
    { key: 'currentProject', header: 'Current Project', render: (row) => (
      <span style={{ fontSize: 12, color: row.currentProject ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
        {row.currentProject ?? '—'}
      </span>
    )},
    { key: 'chargeabilityMTD', header: 'MTD Charge', align: 'center', render: (row) => (
      row.chargeabilityMTD !== null
        ? <span style={{ fontWeight: 600, color: row.chargeabilityMTD >= 70 ? 'var(--color-success)' : 'var(--color-danger)' }}>{row.chargeabilityMTD}%</span>
        : <span style={{ color: 'var(--color-text-muted)' }}>—</span>
    )},
    { key: 'chargeabilityYTD', header: 'YTD Charge', align: 'center', render: (row) => (
      row.chargeabilityYTD !== null
        ? <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{row.chargeabilityYTD}%</span>
        : <span style={{ color: 'var(--color-text-muted)' }}>—</span>
    )},
    { key: 'dateOfJoining', header: 'DOJ' },
  ]

  const demandForecastData = useMemo(() => {
    const allData = [
      { month: 'Jan', demand: 40, supply: 45 },
      { month: 'Feb', demand: 42, supply: 46 },
      { month: 'Mar', demand: 44, supply: 47 },
      { month: 'Apr', demand: 45, supply: 48 },
      { month: 'May', demand: 52, supply: 48 },
      { month: 'Jun', demand: 48, supply: 47 },
      { month: 'Jul', demand: 55, supply: 46 },
      { month: 'Aug', demand: 50, supply: 48 },
      { month: 'Sep', demand: 53, supply: 49 },
      { month: 'Oct', demand: 49, supply: 50 },
      { month: 'Nov', demand: 46, supply: 50 },
      { month: 'Dec', demand: 44, supply: 51 },
    ]
    const count = timeRange === '3m' ? 3 : timeRange === '6m' ? 6 : 12
    return allData.slice(3, 3 + count)
  }, [timeRange])

  const filteredChargeability = useMemo(() => {
    if (globalSL.length === 0) return chargeabilityData
    return chargeabilityData.filter(d => globalSL.includes(d.department))
  }, [globalSL, chargeabilityData])

  // ── Chargeability tab filtered data (uses shared globalFilteredDepts) ──
  const filteredChargeabilityTab = useMemo(() => {
    let data = chargeabilityData
    if (globalSL.length > 0) data = data.filter(d => globalSL.includes(d.department))
    if (globalFilteredDepts !== null) data = data.filter(d => globalFilteredDepts.has(d.department))
    return data
  }, [chargeabilityData, globalSL, globalFilteredDepts])

  // ── Compliance tab filtered data ──
  const filteredComplianceTab = useMemo(() => {
    let data = complianceData
    if (globalSL.length > 0) data = data.filter(d => globalSL.includes(d.department))
    if (globalFilteredDepts !== null) data = data.filter(d => globalFilteredDepts.has(d.department))
    return data
  }, [complianceData, globalSL, globalFilteredDepts])

  const filteredEmployees = useMemo(() => {
    let data = employeeDetailData
    if (globalSL.length > 0) data = data.filter(d => globalSL.includes(d.department))
    if (globalSubSL.length > 0) data = data.filter(d => globalSubSL.includes(d.subFunction))
    if (globalRegion.length > 0) data = data.filter(d => globalRegion.includes(d.region))
    if (globalLocation.length > 0) data = data.filter(d => globalLocation.includes(d.location))
    if (globalGrade.length > 0) data = data.filter(d => globalGrade.includes(d.designation))
    return data
  }, [globalSL, globalSubSL, globalRegion, globalLocation, globalGrade, employeeDetailData])

  const filteredAllocation = useMemo(() => {
    let data = arcAllTeamsData
    if (globalRegion.length > 0) data = data.filter(d => globalRegion.includes(d.region))
    if (globalLocation.length > 0) data = data.filter(d => globalLocation.includes(d.location))
    return data
  }, [globalRegion, globalLocation, arcAllTeamsData])

  // Sub-team filtered views for Chargeability and Compliance tabs
  const filteredChargeabilitySubTab = useMemo(() => {
    let data = chargeabilitySubData
    if (globalSL.length > 0) data = data.filter(d => globalSL.includes(d.department))
    if (globalFilteredDepts !== null) data = data.filter(d => globalFilteredDepts.has(d.department))
    return data
  }, [chargeabilitySubData, globalSL, globalFilteredDepts])

  const filteredComplianceSubTab = useMemo(() => {
    let data = complianceSubData
    if (globalSL.length > 0) data = data.filter(d => globalSL.includes(d.department))
    if (globalFilteredDepts !== null) data = data.filter(d => globalFilteredDepts.has(d.department))
    return data
  }, [complianceSubData, globalSL, globalFilteredDepts])

  // ── Chart data for drilldown ──
  // Clicking a bar in the service-line chart drills into sub-teams for that dept.
  const chargeChartData = useMemo(() => {
    if (chargeDrilldown) {
      return filteredChargeabilitySubTab
        .filter(d => d.department === chargeDrilldown)
        .map(d => ({ department: d.subTeam, headcount: d.headcount, current: d.current, previous: d.previous }))
    }
    return filteredChargeabilityTab
  }, [chargeDrilldown, filteredChargeabilityTab, filteredChargeabilitySubTab])

  const compChartData = useMemo(() => {
    if (compDrilldown) {
      return filteredComplianceSubTab
        .filter(d => d.department === compDrilldown)
        .map(d => ({ department: d.subTeam, headcount: d.headcount, current: d.current, previous: d.previous }))
    }
    return filteredComplianceTab
  }, [compDrilldown, filteredComplianceTab, filteredComplianceSubTab])

  // ── Filtered KPI values for the top widgets ──
  // When any global filter is active, compute derived values from already-filtered data
  // so the widgets reflect the current selection.
  const filteredKpi = useMemo(() => {
    const isFiltered = globalSL.length > 0 || globalSubSL.length > 0 || globalRegion.length > 0 || globalLocation.length > 0 || globalGrade.length > 0
    if (!isFiltered) return kpiData

    // ── Active Resources: count filtered employees (respects all filters) ──
    const activeResources = filteredEmployees.length

    // ── Missed Timesheet: count filtered gaps (respects SL, Sub-SL, Location) ──
    const timesheetGapCount = filteredTimesheetGaps.length

    // ── Chargeability & Compliance ──
    // Region/location/grade filters require different data sources:
    // - Region only  → v_chargeability_by_region aggregates (headcount-weighted)
    // - SubSL (±SL)  → sub-team aggregates
    // - SL only      → dept-level aggregates
    // - Location/Grade only → employee-level records (non-null only)
    const hasGradeOnly = globalGrade.length > 0 && globalRegion.length === 0 && globalLocation.length === 0

    let utilization = 0
    let avgCompliance = 0

    if (globalRegion.length > 0 && globalSL.length === 0 && globalSubSL.length === 0) {
      // Region only (no SL/SubSL context) — use pre-aggregated region-level data
      const regionRows = chargeabilityByRegion.filter(r => globalRegion.includes(r.region))
      const totalHC = regionRows.reduce((s, r) => s + r.headcount, 0)
      utilization = totalHC > 0
        ? Number((regionRows.reduce((s, r) => s + r.current * r.headcount, 0) / totalHC).toFixed(1))
        : 0
      const compRegionRows = complianceByRegion.filter(r => globalRegion.includes(r.region))
      const totalCompHC = compRegionRows.reduce((s, r) => s + r.headcount, 0)
      avgCompliance = totalCompHC > 0
        ? Number((compRegionRows.reduce((s, r) => s + r.current * r.headcount, 0) / totalCompHC).toFixed(1))
        : 0
    } else if (globalLocation.length > 0 && globalSL.length === 0 && globalSubSL.length === 0) {
      // Location only — fall back to employee-level (no location aggregate view available)
      const empWithCharge = filteredEmployees.filter(e => e.chargeabilityMTD !== null)
      utilization = empWithCharge.length > 0
        ? Number((empWithCharge.reduce((s, e) => s + e.chargeabilityMTD!, 0) / empWithCharge.length).toFixed(1))
        : 0
      const empWithCompliance = filteredEmployees.filter(e => e.complianceMTD !== null)
      avgCompliance = empWithCompliance.length > 0
        ? Number((empWithCompliance.reduce((s, e) => s + e.complianceMTD!, 0) / empWithCompliance.length).toFixed(1))
        : 0
    } else if (hasGradeOnly) {
      // Grade only — employee-level records (non-null only)
      const empWithCharge = filteredEmployees.filter(e => e.chargeabilityMTD !== null)
      utilization = empWithCharge.length > 0
        ? Number((empWithCharge.reduce((s, e) => s + e.chargeabilityMTD!, 0) / empWithCharge.length).toFixed(1))
        : 0
      const empWithCompliance = filteredEmployees.filter(e => e.complianceMTD !== null)
      avgCompliance = empWithCompliance.length > 0
        ? Number((empWithCompliance.reduce((s, e) => s + e.complianceMTD!, 0) / empWithCompliance.length).toFixed(1))
        : 0
    } else if (globalSubSL.length > 0) {
      // Sub-team-level aggregates, weighted by headcount
      let subRows = chargeabilitySubData.filter(d => globalSubSL.includes(d.subTeam))
      if (globalSL.length > 0) subRows = subRows.filter(d => globalSL.includes(d.department))
      const totalHC = subRows.reduce((s, d) => s + d.headcount, 0)
      utilization = totalHC > 0
        ? Number((subRows.reduce((s, d) => s + d.current * d.headcount, 0) / totalHC).toFixed(1))
        : 0
      let compSubRows = complianceSubData.filter(d => globalSubSL.includes(d.subTeam))
      if (globalSL.length > 0) compSubRows = compSubRows.filter(d => globalSL.includes(d.department))
      const totalCompHC = compSubRows.reduce((s, d) => s + d.headcount, 0)
      avgCompliance = totalCompHC > 0
        ? Number((compSubRows.reduce((s, d) => s + d.current * d.headcount, 0) / totalCompHC).toFixed(1))
        : 0
    } else {
      // Department-level aggregates, weighted by headcount (SL filter only)
      const deptRows = globalSL.length > 0
        ? chargeabilityData.filter(d => globalSL.includes(d.department))
        : chargeabilityData
      const totalHC = deptRows.reduce((s, d) => s + d.headcount, 0)
      utilization = totalHC > 0
        ? Number((deptRows.reduce((s, d) => s + d.current * d.headcount, 0) / totalHC).toFixed(1))
        : 0
      const compDeptRows = globalSL.length > 0
        ? complianceData.filter(d => globalSL.includes(d.department))
        : complianceData
      const totalCompHC = compDeptRows.reduce((s, d) => s + d.headcount, 0)
      avgCompliance = totalCompHC > 0
        ? Number((compDeptRows.reduce((s, d) => s + d.current * d.headcount, 0) / totalCompHC).toFixed(1))
        : 0
    }

    // ── YTD Chargeability: average YTD across filtered employees ──
    const ytdEmployees = filteredEmployees.filter(e => e.chargeabilityYTD !== null)
    const utilizationYtd = ytdEmployees.length > 0
      ? Number((ytdEmployees.reduce((s, e) => s + (e.chargeabilityYTD ?? 0), 0) / ytdEmployees.length).toFixed(1))
      : 0

    return { ...kpiData, utilization, utilizationYtd, avgCompliance, activeResources, timesheetGapCount }
  }, [globalSL, globalSubSL, globalRegion, globalLocation, globalGrade, kpiData, filteredEmployees, filteredTimesheetGaps, chargeabilityData, chargeabilitySubData, complianceData, complianceSubData, chargeabilityByRegion, complianceByRegion])

  // ── Yearly trend pivot data for Chargeability and Compliance trend charts ──
  // Pivots the backend arrays into recharts format: [{ period, label, SL1: %, SL2: %, ... }]
  // Generate a canonical 12-month period range so all trend lines share the same x-axis,
  // regardless of which months have data for each service line / sub-team.
  const canonicalTrendPeriods = useMemo(() => {
    const now = new Date()
    const periods: string[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return periods
  }, [])

  const { chargeTrendData, chargeTrendKeys } = useMemo(() => {
    const rows = chargeDrilldown
      ? chargeabilityTrendBySubTeam.filter(r => r.department === chargeDrilldown) as SubTeamTrendRow[]
      : chargeabilityTrendByDept
    const keys = rows.map(r => chargeDrilldown ? (r as SubTeamTrendRow).subTeam : r.department)
    const data = canonicalTrendPeriods.map(period => {
      const point: Record<string, any> = { period, label: formatPeriodLabel(period) }
      rows.forEach(r => {
        const key = chargeDrilldown ? (r as SubTeamTrendRow).subTeam : r.department
        const t = r.trend.find(t => t.period === period)
        point[key] = t?.value ?? null
      })
      return point
    })
    return { chargeTrendData: data, chargeTrendKeys: keys }
  }, [chargeDrilldown, chargeabilityTrendByDept, chargeabilityTrendBySubTeam, canonicalTrendPeriods])

  const { compTrendData, compTrendKeys } = useMemo(() => {
    const rows = compDrilldown
      ? complianceTrendBySubTeam.filter(r => r.department === compDrilldown) as SubTeamTrendRow[]
      : complianceTrendByDept
    const keys = rows.map(r => compDrilldown ? (r as SubTeamTrendRow).subTeam : r.department)
    const data = canonicalTrendPeriods.map(period => {
      const point: Record<string, any> = { period, label: formatPeriodLabel(period) }
      rows.forEach(r => {
        const key = compDrilldown ? (r as SubTeamTrendRow).subTeam : r.department
        const t = r.trend.find(t => t.period === period)
        point[key] = t?.value ?? null
      })
      return point
    })
    return { compTrendData: data, compTrendKeys: keys }
  }, [compDrilldown, complianceTrendByDept, complianceTrendBySubTeam, canonicalTrendPeriods])

  // Live summary value for KPI modal — updates when period changes
  const modalSummaryValue = useMemo(() => {
    if (!kpiModal) return null
    switch (kpiModal.title) {
      case 'Current Month Chargeability': return `${filteredKpi.utilization}%`
      case 'Avg Compliance': return `${filteredKpi.avgCompliance ?? 0}%`
      case 'Active Resources': return String(filteredKpi.activeResources ?? filteredKpi.totalCapacity)
      case 'Missed Timesheet': return String(filteredKpi.timesheetGapCount ?? filteredKpi.benchCount)
      default: return String(kpiModal.value)
    }
  }, [kpiModal, filteredKpi])

  const gapBySkill = [
    { skill: 'Data Analytics', gap: 3 },
    { skill: 'Cloud Architecture', gap: 2 },
    { skill: 'M&A', gap: 1 },
    { skill: 'Transfer Pricing', gap: 2 },
    { skill: 'Project Management', gap: 1 },
  ]

  // Timesheet gaps aggregated by department for chart
  const timesheetGapsByDept = useMemo(() => {
    const map = new Map<string, { count: number; avgCompliance: number; total: number }>()
    timesheetNotFilledData.forEach(r => {
      const dept = r.department || 'Unknown'
      if (!map.has(dept)) map.set(dept, { count: 0, avgCompliance: 0, total: 0 })
      const entry = map.get(dept)!
      entry.count += 1
      entry.avgCompliance += (r.compliancePct ?? 0)
      entry.total += 1
    })
    return [...map.entries()]
      .map(([department, v]) => ({
        department,
        gaps: v.count,
        avgCompliance: v.total > 0 ? Math.round(v.avgCompliance / v.total) : 0,
      }))
      .sort((a, b) => b.gaps - a.gaps)
  }, [timesheetNotFilledData])

  if (liveLoading && !hasLiveData) return <PageLoader message="Loading dashboard…" />

  return (
    <div>
      <PageHeader>
        <PageTitleArea>
          <h1>Dashboard</h1>
          <p>Resource capacity overview and forecasting</p>
        </PageTitleArea>
        <HeaderActions>
          <ActionBtn onClick={() => setImportOpen(true)}><Upload size={16} /> Import</ActionBtn>
          {hasLiveData && (
            <ActionBtn onClick={refreshLive} disabled={liveLoading}>
              <RefreshCw size={16} style={liveLoading ? { animation: 'spin 1s linear infinite' } : undefined} /> Refresh
            </ActionBtn>
          )}
          <ActionBtn><Download size={16} /> Export</ActionBtn>
          {process.env.NODE_ENV === 'development' && (
            <ActionBtn
              onClick={async () => {
                if (!confirm('This will delete ALL data from the database. Continue?')) return
                const res = await apiRaw('/api/reset-db', { method: 'POST' })
                const json = await res.json()
                if (json.success) {
                  addToast('Database reset successfully', 'success')
                  // Notify all data consumers (requests context, outliers, etc.)
                  window.dispatchEvent(new Event('db-reset'))
                  refreshLive()
                } else {
                  addToast(`Reset failed: ${json.errors?.join(', ') || json.error}`, 'error')
                }
              }}
              style={{ borderColor: 'var(--color-error, #e53e3e)', color: 'var(--color-error, #e53e3e)' }}
            >
              <Trash2 size={16} /> Reset DB
            </ActionBtn>
          )}
        </HeaderActions>
      </PageHeader>

      <RoleBanner $role={roleView}>
        <Shield size={14} /> Viewing as: {roleLabel}
        {hasLiveData && liveData.lastRefreshed && (
          <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.7 }}>
            Live data • updated {liveData.lastRefreshed.toLocaleTimeString()}
          </span>
        )}
      </RoleBanner>

      {liveData.availablePeriods.length > 0 && (
        <PeriodSelectorRow>
          <Calendar size={14} style={{ color: 'var(--color-text-secondary)' }} />
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Period:</span>
          <PeriodSelect
            value={selectedPeriod ?? ''}
            onChange={e => setSelectedPeriod(e.target.value || null)}
          >
            <option value="">Latest ({liveData.availablePeriods[0] ? formatPeriodLabel(liveData.availablePeriods[0]) : '—'})</option>
            {liveData.availablePeriods.map(p => (
              <option key={p} value={p}>{formatPeriodLabel(p)}</option>
            ))}
          </PeriodSelect>
          {selectedPeriod && (
            <span style={{ fontSize: 11, color: 'var(--color-primary)', marginLeft: 4 }}>
              Showing: {formatPeriodLabel(selectedPeriod)}
            </span>
          )}
        </PeriodSelectorRow>
      )}

      <KpiGrid>
        <StatCard
          title="Current Month Chargeability"
          value={`${filteredKpi.utilization}%`}
          subtitle={`YTD: ${filteredKpi.utilizationYtd ?? 0}%`}
          change={-1}
          onClick={() => openKpiModal('Current Month Chargeability', `${filteredKpi.utilization}%`)}
        />
        <StatCard title="Avg Compliance" value={`${filteredKpi.avgCompliance ?? 0}%`} change={2} onClick={() => openKpiModal('Avg Compliance', `${filteredKpi.avgCompliance ?? 0}%`)} />
        <StatCard
          title="Active Resources"
          value={filteredKpi.activeResources ?? filteredKpi.totalCapacity}
          subtitle={`Exited: ${kpiData.exited ?? 0} · Notice: ${kpiData.servingNotice ?? '—'} · Contract: ${kpiData.contract ?? '—'}`}
          change={4}
          onClick={() => openKpiModal('Active Resources', filteredKpi.activeResources ?? filteredKpi.totalCapacity)}
        />
        <StatCard title="Missed Timesheet" value={filteredKpi.timesheetGapCount ?? filteredKpi.benchCount} change={-12} onClick={() => openKpiModal('Missed Timesheet', filteredKpi.timesheetGapCount ?? filteredKpi.benchCount)} />
      </KpiGrid>

      {/* ── Global Filters — apply to ALL tabs ── */}
      <FilterRow style={{ flexWrap: 'wrap', background: 'var(--color-bg-card)', padding: '12px 16px', borderRadius: 'var(--border-radius)', border: '1px solid var(--color-border)', marginBottom: 16 }}>
        <FilterLabel style={{ fontWeight: 600, color: 'var(--color-text)' }}>Filters:</FilterLabel>
        <FilterLabel>Service Line:</FilterLabel>
        <MultiSelect options={serviceLines} values={globalSL} onChange={setGlobalSL} placeholder="All Service Lines" />
        <FilterLabel>Sub-SL:</FilterLabel>
        <MultiSelect options={filteredGlobalSubSLs} values={globalSubSL} onChange={setGlobalSubSL} placeholder="All Sub-SLs" />
        <FilterLabel>Region:</FilterLabel>
        <MultiSelect options={dashAllRegions} values={globalRegion} onChange={setGlobalRegion} placeholder="All Regions" />
        <FilterLabel>Location:</FilterLabel>
        <MultiSelect options={filteredGlobalLocations} values={globalLocation} onChange={setGlobalLocation} placeholder="All Locations" />
        <FilterLabel>Grade:</FilterLabel>
        <MultiSelect options={grades} values={globalGrade} onChange={setGlobalGrade} placeholder="All Grades" />
        {(globalSL.length > 0 || globalSubSL.length > 0 || globalRegion.length > 0 || globalLocation.length > 0 || globalGrade.length > 0) && (
          <button
            onClick={() => { setGlobalSL([]); setGlobalSubSL([]); setGlobalRegion([]); setGlobalLocation([]); setGlobalGrade([]) }}
            style={{ padding: '4px 10px', fontSize: 12, color: 'var(--color-danger)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius)', background: 'none', cursor: 'pointer', marginLeft: 4 }}
          >
            Clear All
          </button>
        )}
      </FilterRow>

      <TabBar>
        {DASHBOARD_TABS.map(tab => (
          <Tab key={tab} $active={activeTab === tab} onClick={() => setActiveTab(tab)}>
            {tab}
          </Tab>
        ))}
      </TabBar>

      {activeTab === 'Overview' && (
        <>
          {/* Outliers Widget */}
          <OutliersWidget />

          <ChartCard style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0 }}>Chargeability by Department{globalSL.length > 0 ? ` (${globalSL.join(', ')})` : ''}</h3>
              <ChartToggle>
                <ChartToggleBtn $active={chartType === 'bar'} onClick={() => setChartType('bar')}>Bar</ChartToggleBtn>
                <ChartToggleBtn $active={chartType === 'line'} onClick={() => setChartType('line')}>Line</ChartToggleBtn>
              </ChartToggle>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              {chartType === 'bar' ? (
                <BarChart data={filteredChargeability}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="department" fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} />
                  <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="current" fill="var(--color-primary)" name={currentPeriodLabel} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="previous" fill="var(--color-accent-magenta)" name={previousPeriodLabel} radius={[4, 4, 0, 0]} />
                </BarChart>
              ) : (
                <LineChart data={filteredChargeability}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="department" fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} />
                  <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="current" stroke="var(--color-primary)" name={currentPeriodLabel} strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="previous" stroke="var(--color-accent-magenta)" name={previousPeriodLabel} strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              )}
            </ResponsiveContainer>
          </ChartCard>
        </>
      )}

      {activeTab === 'Chargeability' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <ChartToggle>
              <ChartToggleBtn $active={chargeChartType === 'bar'} onClick={() => setChargeChartType('bar')}>Bar</ChartToggleBtn>
              <ChartToggleBtn $active={chargeChartType === 'line'} onClick={() => setChargeChartType('line')}>Line</ChartToggleBtn>
            </ChartToggle>
            <ChartToggle>
              <ChartToggleBtn $active={chargeViewMode === 'summary'} onClick={() => setChargeViewMode('summary')}>Summary</ChartToggleBtn>
              <ChartToggleBtn $active={chargeViewMode === 'trend'} onClick={() => setChargeViewMode('trend')}>Yearly Trend</ChartToggleBtn>
              <ChartToggleBtn $active={chargeViewMode === 'employee'} onClick={() => setChargeViewMode('employee')}>Employee View</ChartToggleBtn>
            </ChartToggle>
          </div>

          {chargeViewMode === 'summary' && (
            <>
              <ChartCard style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {chargeDrilldown && (
                      <button
                        onClick={() => setChargeDrilldown(null)}
                        style={{ fontSize: 12, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        ← All Service Lines
                      </button>
                    )}
                    <h3 style={{ margin: 0 }}>
                      {chargeDrilldown
                        ? `${chargeDrilldown} — Sub-Teams (${chargeChartData.length})`
                        : `Chargeability by Department (${chargeChartData.length})`}
                    </h3>
                  </div>
                  {!chargeDrilldown && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Click a bar to drill down</span>}
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  {chargeChartType === 'bar' ? (
                    <BarChart data={chargeChartData} onClick={!chargeDrilldown ? (e: any) => { if (e?.activeLabel) setChargeDrilldown(e.activeLabel) } : undefined} style={{ cursor: chargeDrilldown ? 'default' : 'pointer' }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="department" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} domain={[0, 100]} unit="%" />
                      <Tooltip formatter={(v: unknown) => `${Number(v)}%`} />
                      <Legend />
                      <Bar dataKey="current" fill="var(--color-primary)" name={currentPeriodLabel} radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="current" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 10, fill: 'var(--color-text)' }} />
                      </Bar>
                      <Bar dataKey="previous" fill="var(--color-accent-magenta)" name={previousPeriodLabel} radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="previous" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 10, fill: 'var(--color-text)' }} />
                      </Bar>
                    </BarChart>
                  ) : (
                    <LineChart data={chargeChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="department" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} domain={[0, 100]} unit="%" />
                      <Tooltip formatter={(v: unknown) => `${Number(v)}%`} />
                      <Legend />
                      <Line type="monotone" dataKey="current" stroke="var(--color-primary)" name={currentPeriodLabel} strokeWidth={2} dot={{ r: 4 }}>
                        <LabelList dataKey="current" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 10, fill: 'var(--color-text)' }} />
                      </Line>
                      <Line type="monotone" dataKey="previous" stroke="var(--color-accent-magenta)" name={previousPeriodLabel} strokeWidth={2} dot={{ r: 4 }}>
                        <LabelList dataKey="previous" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 10, fill: 'var(--color-text)' }} />
                      </Line>
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </ChartCard>
              <SectionGrid>
                {chargeDrilldown ? (
                  <>
                    <DataTable columns={chargeabilitySubTeamCols} data={filteredChargeabilitySubTab.filter(d => d.department === chargeDrilldown)} title={`Sub-Teams — ${chargeDrilldown}`} />
                    <DataTable columns={chargeabilityCols} data={filteredChargeabilityTab} title="All Service Lines" />
                  </>
                ) : (
                  <>
                    <DataTable columns={chargeabilityCols} data={filteredChargeabilityTab} title="Service Lines" />
                    <DataTable columns={chargeabilitySubTeamCols} data={filteredChargeabilitySubTab} title="Sub-Teams" />
                  </>
                )}
              </SectionGrid>
            </>
          )}

          {chargeViewMode === 'trend' && (
            <ChartCard>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {chargeDrilldown && (
                    <button
                      onClick={() => setChargeDrilldown(null)}
                      style={{ fontSize: 12, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      ← All Service Lines
                    </button>
                  )}
                  <h3 style={{ margin: 0 }}>
                    {chargeDrilldown
                      ? `${chargeDrilldown} — Sub-Teams Yearly Trend`
                      : 'Chargeability Yearly Trend by Service Line'}
                  </h3>
                </div>
                {!chargeDrilldown && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Click a line to drill into sub-teams</span>}
              </div>
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={chargeTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} domain={[0, 100]} unit="%" />
                  <Tooltip formatter={(v: unknown) => v !== null ? `${Number(v)}%` : 'No data'} />
                  <Legend />
                  {chargeTrendKeys.map((key, i) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={TREND_COLORS[i % TREND_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                      activeDot={!chargeDrilldown ? { r: 6, cursor: 'pointer', onClick: () => setChargeDrilldown(key) } : { r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {chargeViewMode === 'employee' && (
            <DataTable
              columns={empCols}
              data={filteredEmployees}
              title={`Employee Chargeability (${filteredEmployees.length})`}
              onRowClick={(row) => setSelectedEmployee(row)}
            />
          )}
        </>
      )}

      {activeTab === 'Compliance' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <ChartToggle>
              <ChartToggleBtn $active={compChartType === 'bar'} onClick={() => setCompChartType('bar')}>Bar</ChartToggleBtn>
              <ChartToggleBtn $active={compChartType === 'line'} onClick={() => setCompChartType('line')}>Line</ChartToggleBtn>
            </ChartToggle>
            <ChartToggle>
              <ChartToggleBtn $active={compViewMode === 'summary'} onClick={() => setCompViewMode('summary')}>Summary</ChartToggleBtn>
              <ChartToggleBtn $active={compViewMode === 'trend'} onClick={() => setCompViewMode('trend')}>Yearly Trend</ChartToggleBtn>
              <ChartToggleBtn $active={compViewMode === 'employee'} onClick={() => setCompViewMode('employee')}>Employee View</ChartToggleBtn>
            </ChartToggle>
          </div>

          {compViewMode === 'summary' && (
            <>
              <ChartCard style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {compDrilldown && (
                      <button
                        onClick={() => setCompDrilldown(null)}
                        style={{ fontSize: 12, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        ← All Service Lines
                      </button>
                    )}
                    <h3 style={{ margin: 0 }}>
                      {compDrilldown
                        ? `${compDrilldown} — Sub-Teams (${compChartData.length})`
                        : `Timesheet Compliance by Department (${compChartData.length})`}
                    </h3>
                  </div>
                  {!compDrilldown && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Click a bar to drill down</span>}
                </div>
                <ResponsiveContainer width="100%" height={320}>
                  {compChartType === 'bar' ? (
                    <BarChart data={compChartData} onClick={!compDrilldown ? (e: any) => { if (e?.activeLabel) setCompDrilldown(e.activeLabel) } : undefined} style={{ cursor: compDrilldown ? 'default' : 'pointer' }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="department" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} domain={[0, 100]} unit="%" />
                      <Tooltip formatter={(v: unknown) => `${Number(v)}%`} />
                      <Legend />
                      <Bar dataKey="current" fill="var(--color-success, #22c55e)" name={currentPeriodLabel} radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="current" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 10, fill: 'var(--color-text)' }} />
                      </Bar>
                      <Bar dataKey="previous" fill="#86efac" name={previousPeriodLabel} radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="previous" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 10, fill: 'var(--color-text)' }} />
                      </Bar>
                    </BarChart>
                  ) : (
                    <LineChart data={compChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                      <XAxis dataKey="department" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} interval={0} angle={-20} textAnchor="end" height={60} />
                      <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} domain={[0, 100]} unit="%" />
                      <Tooltip formatter={(v: unknown) => `${Number(v)}%`} />
                      <Legend />
                      <Line type="monotone" dataKey="current" stroke="var(--color-success, #22c55e)" name={currentPeriodLabel} strokeWidth={2} dot={{ r: 4 }}>
                        <LabelList dataKey="current" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 10, fill: 'var(--color-text)' }} />
                      </Line>
                      <Line type="monotone" dataKey="previous" stroke="#86efac" name={previousPeriodLabel} strokeWidth={2} dot={{ r: 4 }}>
                        <LabelList dataKey="previous" position="top" formatter={(v: unknown) => `${v}%`} style={{ fontSize: 10, fill: 'var(--color-text)' }} />
                      </Line>
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </ChartCard>
              <SectionGrid>
                {compDrilldown ? (
                  <>
                    <DataTable columns={complianceSubTeamCols} data={filteredComplianceSubTab.filter(d => d.department === compDrilldown)} title={`Sub-Teams — ${compDrilldown}`} />
                    <DataTable columns={complianceCols} data={filteredComplianceTab} title="All Service Lines" />
                  </>
                ) : (
                  <>
                    <DataTable columns={complianceCols} data={filteredComplianceTab} title="Service Lines" />
                    <DataTable columns={complianceSubTeamCols} data={filteredComplianceSubTab} title="Sub-Teams" />
                  </>
                )}
              </SectionGrid>
            </>
          )}

          {compViewMode === 'trend' && (
            <ChartCard>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {compDrilldown && (
                    <button
                      onClick={() => setCompDrilldown(null)}
                      style={{ fontSize: 12, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}
                    >
                      ← All Service Lines
                    </button>
                  )}
                  <h3 style={{ margin: 0 }}>
                    {compDrilldown
                      ? `${compDrilldown} — Sub-Teams Yearly Trend`
                      : 'Compliance Yearly Trend by Service Line'}
                  </h3>
                </div>
                {!compDrilldown && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Click a line to drill into sub-teams</span>}
              </div>
              <ResponsiveContainer width="100%" height={340}>
                <LineChart data={compTrendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="label" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} domain={[0, 100]} unit="%" />
                  <Tooltip formatter={(v: unknown) => v !== null ? `${Number(v)}%` : 'No data'} />
                  <Legend />
                  {compTrendKeys.map((key, i) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={TREND_COLORS[i % TREND_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                      activeDot={!compDrilldown ? { r: 6, cursor: 'pointer', onClick: () => setCompDrilldown(key) } : { r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {compViewMode === 'employee' && (
            <DataTable
              columns={[
                ...empCols.filter(c => c.key !== 'chargeabilityMTD' && c.key !== 'chargeabilityYTD'),
                { key: 'chargeabilityMTD', header: 'MTD Charge', align: 'center' as const, render: (row: typeof employeeDetailData[0]) => (
                  row.chargeabilityMTD !== null
                    ? <span style={{ fontWeight: 600, color: row.chargeabilityMTD >= 70 ? 'var(--color-success)' : 'var(--color-danger)' }}>{row.chargeabilityMTD}%</span>
                    : <span style={{ color: 'var(--color-text-muted)' }}>—</span>
                )},
              ]}
              data={filteredEmployees}
              title={`Employee Compliance View (${filteredEmployees.length})`}
              onRowClick={(row) => setSelectedEmployee(row)}
            />
          )}
        </>
      )}

      {activeTab === 'Missed Timesheet' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <ChartToggle>
              <ChartToggleBtn $active={timesheetView === 'W'} onClick={() => setTimesheetView('W')}>Weekly</ChartToggleBtn>
              <ChartToggleBtn $active={timesheetView === '4W'} onClick={() => setTimesheetView('4W')}>4 Weeks</ChartToggleBtn>
              <ChartToggleBtn $active={timesheetView === 'M'} onClick={() => setTimesheetView('M')}>Monthly</ChartToggleBtn>
            </ChartToggle>
            <ChartToggle>
              <ChartToggleBtn $active={missedViewMode === 'summary'} onClick={() => setMissedViewMode('summary')}>Summary</ChartToggleBtn>
              <ChartToggleBtn $active={missedViewMode === 'employee'} onClick={() => setMissedViewMode('employee')}>Employee View</ChartToggleBtn>
            </ChartToggle>
          </div>

          {missedViewMode === 'summary' && (
            <>
          <TimesheetSummary>
            <SummaryStat>
              <h4>Total With Gaps</h4>
              <span>{filteredTimesheetGaps.length}</span>
            </SummaryStat>
            <SummaryStat>
              <h4>Departments Affected</h4>
              <span>{new Set(filteredTimesheetGaps.map(r => r.department).filter(Boolean)).size}</span>
            </SummaryStat>
            <SummaryStat>
              <h4>Period</h4>
              <span style={{ fontSize: 14, color: 'var(--color-primary)' }}>{filteredTimesheetGaps[0]?.period ?? timesheetNotFilledData[0]?.period ?? '—'}</span>
            </SummaryStat>
          </TimesheetSummary>
          {timesheetGapsByDept.length > 0 && (
            <ChartCard style={{ marginBottom: 20 }}>
              <h3>Missed Timesheet by Department</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={timesheetGapsByDept}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="department" fontSize={11} tick={{ fill: 'var(--color-text-secondary)' }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis fontSize={12} tick={{ fill: 'var(--color-text-secondary)' }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="gaps" fill="var(--color-danger, #ef4444)" name="Employees with Gaps" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="avgCompliance" fill="var(--color-accent-lilac)" name="Avg Compliance %" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
          {filteredTimesheetGapsByTeam.length > 0 && (
            <SectionGrid>
              <div>
                <DataTable
                  columns={[
                    { key: 'department', header: 'Service Line', render: (row: TimesheetGapByTeamRow) => (
                      <span style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {row.subTeams.length > 0 && (
                          <button
                            onClick={() => setExpandedMissedSL(prev => {
                              const next = new Set(prev)
                              next.has(row.department) ? next.delete(row.department) : next.add(row.department)
                              return next
                            })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 0 }}
                          >
                            {expandedMissedSL.has(row.department) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          </button>
                        )}
                        {row.department}
                      </span>
                    )},
                    { key: 'count', header: 'Defaulters', align: 'center', render: (row: TimesheetGapByTeamRow) => <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>{row.count}</span> },
                  ]}
                  data={filteredTimesheetGapsByTeam.flatMap(row => [
                    row,
                    ...(expandedMissedSL.has(row.department)
                      ? row.subTeams.map(st => ({
                          department: `  ↳ ${st.subTeam}`,
                          count: st.count,
                          subTeams: [],
                          _isSubRow: true,
                        } as any))
                      : []),
                  ])}
                  title="Defaulters by Team"
                />
              </div>
              <DataTable columns={timesheetCols} data={filteredTimesheetGaps} title={`Timesheet Not Filled — ${timesheetView === 'W' ? 'Weekly' : timesheetView === '4W' ? '4-Week' : 'Monthly'} View`} />
            </SectionGrid>
          )}
          {filteredTimesheetGapsByTeam.length === 0 && (
            <DataTable columns={timesheetCols} data={filteredTimesheetGaps} title={`Timesheet Not Filled — ${timesheetView === 'W' ? 'Weekly' : timesheetView === '4W' ? '4-Week' : 'Monthly'} View`} />
          )}
            </>
          )}

          {missedViewMode === 'employee' && (
            <DataTable columns={timesheetCols} data={filteredTimesheetGaps} title={`Employees with Missed Timesheets (${filteredTimesheetGaps.length})`} />
          )}
        </>
      )}

      {activeTab === 'Resource Allocation' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <ChartToggle>
              <ChartToggleBtn $active={allocViewMode === 'summary'} onClick={() => setAllocViewMode('summary')}>Summary</ChartToggleBtn>
              <ChartToggleBtn $active={allocViewMode === 'employee'} onClick={() => setAllocViewMode('employee')}>Employee View</ChartToggleBtn>
            </ChartToggle>
          </div>
          {allocViewMode === 'summary' && (
            <DataTable
              columns={allocCols}
              data={filteredAllocation}
              title="Headcount by Location"
              totalRow={{
                location: 'Grand Total',
                region: '',
                total: String(filteredAllocation.reduce((s, r) => s + r.total, 0)),
              }}
            />
          )}
          {allocViewMode === 'employee' && (
            <DataTable
              columns={empCols}
              data={filteredEmployees}
              title={`Employee Details by Location (${filteredEmployees.length})`}
              onRowClick={(row) => setSelectedEmployee(row)}
            />
          )}
        </>
      )}

      {activeTab === 'Employee Details' && (
        <>
          <DataTable
            columns={empCols}
            data={filteredEmployees}
            title={`Employee Details (${filteredEmployees.length})`}
            onRowClick={(row) => setSelectedEmployee(row)}
          />
        </>
      )}

      {/* KPI Detail Modal */}
      <Modal
        open={modalType === 'kpi' && !!kpiModal}
        onClose={() => { setModalType(null); setKpiModal(null) }}
        title={kpiModal?.title ?? ''}
        subtitle="Detailed breakdown"
        size="lg"
      >
        {liveData.availablePeriods.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, padding: '8px 12px', background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 'var(--border-radius)' }}>
            <Calendar size={13} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text-secondary)' }}>Period:</span>
            <PeriodSelect
              value={selectedPeriod ?? ''}
              onChange={e => setSelectedPeriod(e.target.value || null)}
            >
              <option value="">Latest ({liveData.availablePeriods[0] ? formatPeriodLabel(liveData.availablePeriods[0]) : '—'})</option>
              {liveData.availablePeriods.map(p => (
                <option key={p} value={p}>{formatPeriodLabel(p)}</option>
              ))}
            </PeriodSelect>
          </div>
        )}
        <Section>
          <SectionTitle>Summary</SectionTitle>
          <DetailGrid $cols={1}>
            <DetailItem>
              <label>
                {kpiModal?.title === 'Current Month Chargeability'
                  ? `${currentPeriodLabel}'s Chargeability`
                  : kpiModal?.title === 'Avg Compliance'
                  ? `${currentPeriodLabel}'s Compliance`
                  : kpiModal?.title === 'Active Resources'
                  ? `${currentPeriodLabel}'s Active Resources`
                  : kpiModal?.title === 'Missed Timesheet'
                  ? `${currentPeriodLabel}'s Missed Timesheets`
                  : 'Current Value'}
              </label>
              <span>{modalSummaryValue}</span>
            </DetailItem>
          </DetailGrid>
        </Section>
        {kpiModal?.title === 'Over-Allocated' && (
          <Section>
            <SectionTitle>Over-Allocated Resources</SectionTitle>
            <ModalTable>
              <thead><tr><th>Resource</th><th>Allocation %</th><th>Projects</th><th>Week</th></tr></thead>
              <tbody>
                {overAllocatedResources.map(r => (
                  <tr key={`${r.id}-${r.weekStart}`}>
                    <td style={{ fontWeight: 500 }}>{r.name}</td>
                    <td style={{ color: 'var(--color-danger)', fontWeight: 600 }}>{r.totalAllocation}%</td>
                    <td>{r.projectCount}</td>
                    <td>{r.weekStart}</td>
                  </tr>
                ))}
              </tbody>
            </ModalTable>
          </Section>
        )}
        {kpiModal?.title === 'On Bench' && (
          <Section>
            <SectionTitle>Bench Resources</SectionTitle>
            <p style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>No bench data available from live data yet.</p>
          </Section>
        )}
        {kpiModal?.title === 'Current Month Chargeability' && (
          <Section>
            <SectionTitle>Chargeability by Service Line</SectionTitle>
            <ModalTable>
              <thead>
                <tr>
                  <th>Service Line</th>
                  <th style={{ textAlign: 'center' }}>Headcount</th>
                  <th>MTD {currentPeriodLabel}</th>
                  <th>MTD {previousPeriodLabel}</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {chargeabilityData.map(d => {
                  const subTeams = chargeabilitySubData.filter(s => s.department === d.department)
                  const isExpanded = expandedModalSL.has(`charge-${d.department}`)
                  return (
                    <React.Fragment key={`charge-${d.department}`}>
                      <tr>
                        <td style={{ fontWeight: 500 }}>
                          {subTeams.length > 0 && (
                            <button
                              onClick={() => toggleModalSL(`charge-${d.department}`)}
                              style={{ marginRight: 6, color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', verticalAlign: 'middle' }}
                            >
                              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                          )}
                          {d.department}
                        </td>
                        <td style={{ textAlign: 'center' }}>{d.headcount ?? '—'}</td>
                        <td style={{ fontWeight: 600 }}>{d.current}%</td>
                        <td style={{ color: 'var(--color-text-secondary)' }}>{d.previous}%</td>
                        <td>
                          <TrendIcon $direction={d.current >= d.previous ? 'up' : 'down'}>
                            {d.current >= d.previous ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            <span style={{ marginLeft: 4, fontSize: 12 }}>{d.current >= d.previous ? '+' : ''}{(d.current - d.previous).toFixed(1)}%</span>
                          </TrendIcon>
                        </td>
                      </tr>
                      {isExpanded && subTeams.map(st => (
                        <SubTeamRow key={`charge-${d.department}-${st.subTeam}`}>
                          <td style={{ paddingLeft: 28 }}>↳ {st.subTeam}</td>
                          <td style={{ textAlign: 'center' }}>{st.headcount ?? '—'}</td>
                          <td>{st.current}%</td>
                          <td style={{ color: 'var(--color-text-muted)' }}>{st.previous}%</td>
                          <td>
                            <TrendIcon $direction={st.current >= st.previous ? 'up' : 'down'}>
                              {st.current >= st.previous ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                            </TrendIcon>
                          </td>
                        </SubTeamRow>
                      ))}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </ModalTable>
          </Section>
        )}
        {kpiModal?.title === 'Avg Compliance' && (
          <Section>
            <SectionTitle>Compliance by Service Line</SectionTitle>
            <ModalTable>
              <thead>
                <tr>
                  <th>Service Line</th>
                  <th style={{ textAlign: 'center' }}>Headcount</th>
                  <th>MTD {currentPeriodLabel}</th>
                  <th>MTD {previousPeriodLabel}</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {complianceData.map(d => {
                  const subTeams = complianceSubData.filter(s => s.department === d.department)
                  const isExpanded = expandedModalSL.has(`comp-${d.department}`)
                  return (
                    <React.Fragment key={`comp-${d.department}`}>
                      <tr>
                        <td style={{ fontWeight: 500 }}>
                          {subTeams.length > 0 && (
                            <button
                              onClick={() => toggleModalSL(`comp-${d.department}`)}
                              style={{ marginRight: 6, color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', verticalAlign: 'middle' }}
                            >
                              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                          )}
                          {d.department}
                        </td>
                        <td style={{ textAlign: 'center' }}>{d.headcount ?? '—'}</td>
                        <td style={{ fontWeight: 600 }}>{d.current}%</td>
                        <td style={{ color: 'var(--color-text-secondary)' }}>{d.previous}%</td>
                        <td>
                          <TrendIcon $direction={d.current >= d.previous ? 'up' : 'down'}>
                            {d.current >= d.previous ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                            <span style={{ marginLeft: 4, fontSize: 12 }}>{d.current >= d.previous ? '+' : ''}{(d.current - d.previous).toFixed(1)}%</span>
                          </TrendIcon>
                        </td>
                      </tr>
                      {isExpanded && subTeams.map(st => (
                        <SubTeamRow key={`comp-${d.department}-${st.subTeam}`}>
                          <td style={{ paddingLeft: 28 }}>↳ {st.subTeam}</td>
                          <td style={{ textAlign: 'center' }}>{st.headcount ?? '—'}</td>
                          <td>{st.current}%</td>
                          <td style={{ color: 'var(--color-text-muted)' }}>{st.previous}%</td>
                          <td>
                            <TrendIcon $direction={st.current >= st.previous ? 'up' : 'down'}>
                              {st.current >= st.previous ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                            </TrendIcon>
                          </td>
                        </SubTeamRow>
                      ))}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </ModalTable>
          </Section>
        )}
        {kpiModal?.title === 'Active Resources' && (
          <Section>
            <SectionTitle>Workforce Status Breakdown</SectionTitle>
            <DetailGrid $cols={4}>
              <DetailItem>
                <label>Active</label>
                <span style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: 22 }}>
                  {kpiData.activeResources ?? kpiData.totalCapacity}
                </span>
              </DetailItem>
              <DetailItem>
                <label>Exited</label>
                <span style={{ color: 'var(--color-danger)', fontWeight: 700, fontSize: 22 }}>
                  {kpiData.exited ?? 0}
                </span>
              </DetailItem>
              <DetailItem>
                <label>Serving Notice</label>
                <span style={{ color: 'var(--color-warning, #f59e0b)', fontWeight: 700, fontSize: 22 }}>
                  {kpiData.servingNotice ?? '—'}
                </span>
              </DetailItem>
              <DetailItem>
                <label>On Contract</label>
                <span style={{ fontWeight: 700, fontSize: 22 }}>
                  {kpiData.contract ?? '—'}
                </span>
              </DetailItem>
            </DetailGrid>
            {(kpiData.servingNotice === null || kpiData.contract === null) && (
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 8 }}>
                Serving Notice and On Contract counts require additional employee status fields in the schema.
              </p>
            )}
            <SectionTitle style={{ marginTop: 16 }}>Headcount by Service Line</SectionTitle>
            <ModalTable>
              <thead>
                <tr>
                  <th>Service Line</th>
                  <th style={{ textAlign: 'center' }}>Active Headcount</th>
                </tr>
              </thead>
              <tbody>
                {chargeabilityData.map(d => {
                  const subTeams = chargeabilitySubData.filter(s => s.department === d.department)
                  const isExpanded = expandedModalSL.has(`active-${d.department}`)
                  return (
                    <React.Fragment key={`active-${d.department}`}>
                      <tr>
                        <td style={{ fontWeight: 500 }}>
                          {subTeams.length > 0 && (
                            <button
                              onClick={() => toggleModalSL(`active-${d.department}`)}
                              style={{ marginRight: 6, color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', verticalAlign: 'middle' }}
                            >
                              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                            </button>
                          )}
                          {d.department}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: 600 }}>{d.headcount ?? '—'}</td>
                      </tr>
                      {isExpanded && subTeams.map(st => (
                        <SubTeamRow key={`active-${d.department}-${st.subTeam}`}>
                          <td style={{ paddingLeft: 28 }}>↳ {st.subTeam}</td>
                          <td style={{ textAlign: 'center' }}>{st.headcount ?? '—'}</td>
                        </SubTeamRow>
                      ))}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </ModalTable>
          </Section>
        )}
        {kpiModal?.title === 'Missed Timesheet' && (
          <>
            <Section>
              <SectionTitle>About Missed Timesheet</SectionTitle>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                Missed timesheets are counted for employees whose compliance percentage is <strong>0%</strong> — i.e. they have not filled any timesheet for the period.
              </p>
            </Section>
            {timesheetGapsByTeam.length > 0 && (
              <Section>
                <SectionTitle>Defaulters by Service Line</SectionTitle>
                <ModalTable>
                  <thead>
                    <tr>
                      <th>Service Line</th>
                      <th style={{ textAlign: 'center' }}>Defaulters</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timesheetGapsByTeam.map(row => {
                      const isExpanded = expandedModalSL.has(`missed-${row.department}`)
                      return (
                        <React.Fragment key={`missed-${row.department}`}>
                          <tr>
                            <td style={{ fontWeight: 500 }}>
                              {row.subTeams.length > 0 && (
                                <button
                                  onClick={() => toggleModalSL(`missed-${row.department}`)}
                                  style={{ marginRight: 6, color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', verticalAlign: 'middle' }}
                                >
                                  {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                </button>
                              )}
                              {row.department}
                            </td>
                            <td style={{ textAlign: 'center', color: 'var(--color-danger)', fontWeight: 700 }}>{row.count}</td>
                          </tr>
                          {isExpanded && row.subTeams.map(st => (
                            <SubTeamRow key={`missed-${row.department}-${st.subTeam}`}>
                              <td style={{ paddingLeft: 28 }}>↳ {st.subTeam}</td>
                              <td style={{ textAlign: 'center', color: 'var(--color-danger)', fontWeight: 600 }}>{st.count}</td>
                            </SubTeamRow>
                          ))}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </ModalTable>
              </Section>
            )}
          </>
        )}
      </Modal>

      {/* Service Line Breakdown Modal */}
      <Modal
        open={modalType === 'service-line'}
        onClose={() => setModalType(null)}
        title="Capacity vs Forecast by Service Line"
        subtitle="Detailed breakdown by service line and sub-service lines"
        size="lg"
      >
        {capacityByServiceLineData.map(sl => (
          <Section key={sl.serviceLine}>
            <SectionTitle>{sl.serviceLine}</SectionTitle>
            <DetailGrid $cols={4}>
              <DetailItem><label>Capacity</label><span>{sl.capacity} FTEs</span></DetailItem>
              <DetailItem><label>Forecast</label><span>{sl.forecast} FTEs</span></DetailItem>
              <DetailItem><label>Actual</label><span>{sl.actual} FTEs</span></DetailItem>
              <DetailItem><label>Variance</label><span>{(sl.capacity - sl.forecast).toFixed(1)} FTEs</span></DetailItem>
            </DetailGrid>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-muted)' }}>
              Sub-service lines: {sl.subServiceLines.join(', ')}
            </div>
          </Section>
        ))}
      </Modal>

      {/* Location Breakdown Modal */}
      <Modal
        open={modalType === 'location'}
        onClose={() => setModalType(null)}
        title="Capacity vs Forecast by Location"
        subtitle="Detailed breakdown by office location"
        size="lg"
      >
        <ModalTable>
          <thead>
            <tr>
              <th>Location</th>
              <th>Capacity</th>
              <th>Forecast</th>
              <th>Actual</th>
              <th>Utilization</th>
              <th>Variance</th>
            </tr>
          </thead>
          <tbody>
            {capacityByLocationData.map(loc => (
              <tr key={loc.location}>
                <td style={{ fontWeight: 500 }}>{loc.location}</td>
                <td>{loc.capacity}</td>
                <td>{loc.forecast}</td>
                <td>{loc.actual}</td>
                <td>{loc.capacity > 0 ? `${((loc.actual / loc.capacity) * 100).toFixed(0)}%` : '—'}</td>
                <td style={{ color: loc.capacity - loc.forecast > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {(loc.capacity - loc.forecast).toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </ModalTable>
      </Modal>

      {/* Utilization Trend Modal */}
      <Modal
        open={modalType === 'utilization'}
        onClose={() => setModalType(null)}
        title="Utilization Trend"
        subtitle="Month-over-month utilization comparison"
        size="md"
      >
        <ModalTable>
          <thead>
            <tr><th>Month</th><th>Forecast</th><th>Actual</th><th>Gap</th></tr>
          </thead>
          <tbody>
            {utilizationData.map(m => (
              <tr key={m.month}>
                <td style={{ fontWeight: 500 }}>{m.month}</td>
                <td>{m.forecast}%</td>
                <td>{m.actual !== null ? `${m.actual}%` : '—'}</td>
                <td style={{ color: m.actual !== null ? (m.actual >= m.forecast ? 'var(--color-success)' : 'var(--color-danger)') : 'var(--color-text-muted)' }}>
                  {m.actual !== null ? `${(m.actual - m.forecast).toFixed(0)}%` : 'Pending'}
                </td>
              </tr>
            ))}
          </tbody>
        </ModalTable>
      </Modal>

      {/* Employee Detail Modal */}
      <Modal
        open={!!selectedEmployee}
        onClose={() => setSelectedEmployee(null)}
        title={selectedEmployee?.name ?? ''}
        subtitle={`${selectedEmployee?.designation} • ${selectedEmployee?.department}`}
        size="md"
      >
        {selectedEmployee && (
          <Section>
            <SectionTitle>Employee Information</SectionTitle>
            <DetailGrid>
              <DetailItem><label>Employee ID</label><span>{selectedEmployee.empId}</span></DetailItem>
              <DetailItem><label>Email</label><span>{selectedEmployee.email}</span></DetailItem>
              <DetailItem><label>Department</label><span>{selectedEmployee.department}</span></DetailItem>
              <DetailItem><label>Sub-Function</label><span>{selectedEmployee.subFunction}</span></DetailItem>
              <DetailItem><label>Designation</label><span>{selectedEmployee.designation}</span></DetailItem>
              <DetailItem><label>Location</label><span>{selectedEmployee.location}</span></DetailItem>
              <DetailItem><label>Date of Joining</label><span>{selectedEmployee.dateOfJoining}</span></DetailItem>
              <DetailItem>
                <label>Status</label>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <StatusDot $color={selectedEmployee.status === 'green' ? 'var(--color-success)' : 'var(--color-danger)'} />
                  {selectedEmployee.status === 'green' ? 'Active' : 'Attention Required'}
                </span>
              </DetailItem>
              <DetailItem>
                <label>Chargeability MTD</label>
                <span style={{ fontWeight: 600, color: selectedEmployee.chargeabilityMTD !== null && selectedEmployee.chargeabilityMTD >= 70 ? 'var(--color-success)' : selectedEmployee.chargeabilityMTD !== null ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
                  {selectedEmployee.chargeabilityMTD !== null ? `${selectedEmployee.chargeabilityMTD}%` : '—'}
                </span>
              </DetailItem>
              <DetailItem>
                <label>Chargeability YTD</label>
                <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>
                  {selectedEmployee.chargeabilityYTD !== null ? `${selectedEmployee.chargeabilityYTD}%` : '—'}
                </span>
              </DetailItem>
              <DetailItem>
                <label>Current Project</label>
                <span>{selectedEmployee.currentProject ?? '—'}</span>
              </DetailItem>
            </DetailGrid>
          </Section>
        )}
      </Modal>

      {/* Import Modal */}
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onComplete={handleImportComplete}
      />
    </div>
  )
}
